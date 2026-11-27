import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const MOCK_USER_DATA = vi.hoisted(() =>
  require('node:path').join(require('node:os').tmpdir(), `scalpel-plugin-filter-${Date.now()}`),
)

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => MOCK_USER_DATA) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn(() => null) },
  dialog: { showMessageBox: vi.fn(async () => ({ response: 1 })) },
}))
vi.mock('../overlay', () => ({ reloadFilterInGame: vi.fn() }))

import { ipcMain } from 'electron'
import { getIntents } from '../filter/intent-recorder'
import { getCurrentFilter, loadFilter } from '../filter-state'
import { reloadFilterInGame } from '../overlay'
import { type ConfirmMoves, type PluginFilterMoveResult, registerPluginFilterHandlers } from './plugin-filter'

type ReadResult = { content: string; path: string; revision: string } | null

const tempDirs: string[] = []
afterAll(() => {
  for (const d of tempDirs) rmSync(d, { recursive: true, force: true })
})

function writeFilter(lines: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'scalpel-plugin-filter-'))
  tempDirs.push(dir)
  const path = join(dir, 'test.filter')
  writeFileSync(path, lines.join('\n'), 'utf-8')
  return path
}

const FILTER = [
  'Show # %D8 $type->currency $tier->t1',
  '\tClass "Currency"',
  '\tBaseType == "Divine Orb" "Mirror of Kalandra"',
  '\tSetFontSize 45',
  '',
  'Show # %D5 $type->currency $tier->t2',
  '\tClass "Currency"',
  '\tBaseType == "Chaos Orb" "Exalted Orb" "Vaal Orb"',
  '\tSetFontSize 40',
  '',
  'Show # %D3 $type->currency $tier->t3',
  '\tClass "Currency"',
  '\tBaseType == "Orb of Alteration"',
  '\tSetFontSize 35',
  '',
  'Show # $type->currency $tier->rest',
  '\tClass "Currency"',
  '\tSetFontSize 30',
]
// Block header lines (1-based): t1=1, t2=6, t3=11, rest=16

function setup(confirm: ConfirmMoves = async () => true) {
  vi.mocked(ipcMain.handle).mockClear()
  const path = writeFilter(FILTER)
  loadFilter(path)
  const store = {
    get: (key: string) => (key === 'filterPath' ? path : key === 'reloadOnSave' ? true : undefined),
  } as unknown as Parameters<typeof registerPluginFilterHandlers>[0]
  registerPluginFilterHandlers(store, confirm)
  const find = (channel: string) => {
    const call = vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === channel)
    if (!call) throw new Error(`${channel} not registered`)
    return call[1] as (...args: unknown[]) => Promise<unknown>
  }
  const read = () => find('plugins:filter-read')({}) as Promise<ReadResult>
  const move = (req: unknown) =>
    find('plugins:filter-move-basetypes')({ sender: {} }, 'economy-retier', req) as Promise<PluginFilterMoveResult>
  return { path, read, move }
}

describe('plugin filter capability', () => {
  beforeEach(() => {
    vi.mocked(reloadFilterInGame).mockClear()
  })

  it('reads the loaded filter with a revision', async () => {
    const { read, path } = setup()
    const r = await read()
    expect(r?.path).toBe(path)
    expect(r?.content.split('\n')[0]).toBe(FILTER[0])
    expect(r?.revision).toMatch(/^[0-9a-f]{64}$/)
  })

  it('moves several bases across tiers in one call through the tier-move path', async () => {
    const { read, move, path } = setup()
    const { revision } = (await read()) as NonNullable<ReadResult>
    const before = getIntents().intents.length
    const res = await move({
      revision,
      moves: [
        { baseType: 'Exalted Orb', fromBlockLine: 6, toBlockLine: 1 },
        { baseType: 'Vaal Orb', fromBlockLine: 6, toBlockLine: 11 },
      ],
    })
    expect(res).toEqual({ ok: true, moved: 2, skipped: [] })
    const text = readFileSync(path, 'utf-8')
    expect(text).toContain('BaseType == "Divine Orb" "Mirror of Kalandra" "Exalted Orb"')
    expect(text).toContain('BaseType == "Chaos Orb"\n')
    expect(text).toContain('BaseType == "Orb of Alteration" "Vaal Orb"')
    const intents = getIntents().intents.slice(before)
    expect(intents.map((i) => [i.type, i.target.tier, (i.payload as { value: string }).value])).toEqual([
      ['move-basetype', 't1', 'Exalted Orb'],
      ['move-basetype', 't3', 'Vaal Orb'],
    ])
    expect(reloadFilterInGame).toHaveBeenCalledTimes(1)
  })

  it('never empties a source block and reports what it left', async () => {
    const { read, move } = setup()
    const { revision } = (await read()) as NonNullable<ReadResult>
    const res = await move({
      revision,
      moves: [
        { baseType: 'Chaos Orb', fromBlockLine: 6, toBlockLine: 11 },
        { baseType: 'Exalted Orb', fromBlockLine: 6, toBlockLine: 11 },
        { baseType: 'Vaal Orb', fromBlockLine: 6, toBlockLine: 11 },
      ],
    })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.moved).toBe(2)
    expect(res.skipped).toEqual([{ baseType: 'Vaal Orb', fromBlockLine: 6, toBlockLine: 11, reason: 'last-base' }])
    const t2 = getCurrentFilter()?.blocks[1].conditions.find((c) => c.type === 'BaseType')
    expect(t2?.values).toEqual(['Vaal Orb'])
  })

  it('skips moves Scalpel will not make', async () => {
    const { read, move } = setup()
    const { revision } = (await read()) as NonNullable<ReadResult>
    const res = await move({
      revision,
      moves: [
        { baseType: 'Chaos Orb', fromBlockLine: 6, toBlockLine: 16 }, // rest has no BaseType line
        { baseType: 'Chaos Orb', fromBlockLine: 7, toBlockLine: 1 }, // not a block header
        { baseType: 'Ancient Orb', fromBlockLine: 6, toBlockLine: 1 }, // not named
        { baseType: 'Chaos Orb', fromBlockLine: 6, toBlockLine: 6 }, // same block
      ],
    })
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.skipped?.map((s) => s.reason)).toEqual(['no-basetype', 'no-block', 'not-named', 'same-block'])
  })

  it('refuses a plan made against an older revision', async () => {
    const { move, path } = setup()
    const before = readFileSync(path, 'utf-8')
    const res = await move({ revision: 'stale', moves: [{ baseType: 'Chaos Orb', fromBlockLine: 6, toBlockLine: 1 }] })
    expect(res.ok).toBe(false)
    expect(readFileSync(path, 'utf-8')).toBe(before)
  })

  it('writes nothing when the user cancels the confirmation', async () => {
    const confirm = vi.fn(async () => false)
    const { read, move, path } = setup(confirm)
    const before = readFileSync(path, 'utf-8')
    const { revision } = (await read()) as NonNullable<ReadResult>
    const res = await move({ revision, moves: [{ baseType: 'Chaos Orb', fromBlockLine: 6, toBlockLine: 1 }] })
    expect(res).toMatchObject({ ok: false, cancelled: true })
    expect(confirm).toHaveBeenCalledWith({}, 'economy-retier', ['Chaos Orb: t2 → t1'], 1)
    expect(readFileSync(path, 'utf-8')).toBe(before)
    expect(reloadFilterInGame).not.toHaveBeenCalled()
  })

  it('rejects a malformed request', async () => {
    const { move } = setup()
    expect(await move({ revision: 'x', moves: [{ baseType: '', fromBlockLine: 1, toBlockLine: 6 }] })).toMatchObject({
      ok: false,
    })
    expect(await move(null)).toMatchObject({ ok: false })
  })

  it('keeps later edits on the right lines when a strip deletes a BaseType line', async () => {
    const path = writeFilter([
      'Show # $type->currency $tier->t1',
      '\tBaseType == "Divine Orb"',
      '\tBaseType == "Chaos Orb"',
      '',
      'Show # $type->currency $tier->t2',
      '\tBaseType == "Exalted Orb" "Vaal Orb"',
      '',
      'Show # $type->currency $tier->t3',
      '\tBaseType == "Orb of Alteration"',
    ])
    vi.mocked(ipcMain.handle).mockClear()
    loadFilter(path)
    registerPluginFilterHandlers(
      { get: (k: string) => (k === 'filterPath' ? path : undefined) } as unknown as Parameters<
        typeof registerPluginFilterHandlers
      >[0],
      async () => true,
    )
    const h = (ch: string) =>
      vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === ch)?.[1] as (...a: unknown[]) => Promise<unknown>
    const { revision } = (await h('plugins:filter-read')({})) as NonNullable<ReadResult>
    const res = (await h('plugins:filter-move-basetypes')({ sender: {} }, 'p', {
      revision,
      moves: [
        { baseType: 'Chaos Orb', fromBlockLine: 1, toBlockLine: 5 },
        { baseType: 'Vaal Orb', fromBlockLine: 5, toBlockLine: 8 },
      ],
    })) as PluginFilterMoveResult
    expect(res).toEqual({ ok: true, moved: 2, skipped: [] })
    expect(readFileSync(path, 'utf-8').split('\n')).toEqual([
      'Show # $type->currency $tier->t1',
      '\tBaseType == "Divine Orb"',
      '',
      'Show # $type->currency $tier->t2',
      '\tBaseType == "Exalted Orb" "Chaos Orb"',
      '',
      'Show # $type->currency $tier->t3',
      '\tBaseType == "Orb of Alteration" "Vaal Orb"',
    ])
  })

  it('writes and records the filter spelling when the plugin sends another case', async () => {
    const { read, move, path } = setup()
    const { revision } = (await read()) as NonNullable<ReadResult>
    const before = getIntents().intents.length
    const res = await move({ revision, moves: [{ baseType: 'exalted orb', fromBlockLine: 6, toBlockLine: 1 }] })
    expect(res).toEqual({ ok: true, moved: 1, skipped: [] })
    const text = readFileSync(path, 'utf-8')
    expect(text).toContain('BaseType == "Divine Orb" "Mirror of Kalandra" "Exalted Orb"')
    expect(text).toContain('BaseType == "Chaos Orb" "Vaal Orb"')
    expect(text).not.toContain('exalted orb')
    const intent = getIntents().intents[before]
    expect((intent.payload as { value: string }).value).toBe('Exalted Orb')
  })

  it('counts a base the destination already lists as moved and records it', async () => {
    const path = writeFilter([
      'Show # $type->currency $tier->t1',
      '\tBaseType == "Divine Orb" "Chaos Orb"',
      '',
      'Show # $type->currency $tier->t2',
      '\tBaseType == "Chaos Orb" "Vaal Orb"',
    ])
    vi.mocked(ipcMain.handle).mockClear()
    loadFilter(path)
    registerPluginFilterHandlers(
      { get: () => undefined } as unknown as Parameters<typeof registerPluginFilterHandlers>[0],
      async () => true,
    )
    const h = (ch: string) =>
      vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === ch)?.[1] as (...a: unknown[]) => Promise<unknown>
    const { revision } = (await h('plugins:filter-read')({})) as NonNullable<ReadResult>
    const before = getIntents().intents.length
    const res = (await h('plugins:filter-move-basetypes')({ sender: {} }, 'p', {
      revision,
      moves: [{ baseType: 'Chaos Orb', fromBlockLine: 4, toBlockLine: 1 }],
    })) as PluginFilterMoveResult
    expect(res).toEqual({ ok: true, moved: 1, skipped: [] })
    expect(readFileSync(path, 'utf-8')).toContain('BaseType == "Vaal Orb"')
    expect(getIntents().intents.length).toBe(before + 1)
  })

  it('skips a duplicate move and a base caught by a substring token', async () => {
    const path = writeFilter([
      'Show # $type->currency $tier->t1',
      '\tBaseType == "Divine Orb"',
      '',
      'Show # $type->currency $tier->t2',
      '\tBaseType "Orb" "Vaal"',
    ])
    vi.mocked(ipcMain.handle).mockClear()
    loadFilter(path)
    registerPluginFilterHandlers(
      { get: () => undefined } as unknown as Parameters<typeof registerPluginFilterHandlers>[0],
      async () => true,
    )
    const h = (ch: string) =>
      vi.mocked(ipcMain.handle).mock.calls.find((c) => c[0] === ch)?.[1] as (...a: unknown[]) => Promise<unknown>
    const { revision } = (await h('plugins:filter-read')({})) as NonNullable<ReadResult>
    const res = (await h('plugins:filter-move-basetypes')({ sender: {} }, 'p', {
      revision,
      moves: [
        { baseType: 'Chaos Orb', fromBlockLine: 4, toBlockLine: 1 },
        { baseType: 'Chaos Orb', fromBlockLine: 4, toBlockLine: 1 },
      ],
    })) as PluginFilterMoveResult
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.skipped?.map((x) => x.reason)).toEqual(['token', 'duplicate'])
  })

  it('refuses when the filter changes while the confirmation is open', async () => {
    let filterPath = ''
    const { read, move, path } = setup(async () => {
      writeFileSync(filterPath, `${readFileSync(filterPath, 'utf-8')}\n# edited`, 'utf-8')
      loadFilter(filterPath)
      return true
    })
    filterPath = path
    const { revision } = (await read()) as NonNullable<ReadResult>
    const res = await move({ revision, moves: [{ baseType: 'Chaos Orb', fromBlockLine: 6, toBlockLine: 1 }] })
    expect(res).toMatchObject({ ok: false })
    expect(readFileSync(path, 'utf-8')).toContain('BaseType == "Chaos Orb" "Exalted Orb" "Vaal Orb"')
  })

  it('refuses more moves than the limit in one call', async () => {
    const { read, move } = setup()
    const { revision } = (await read()) as NonNullable<ReadResult>
    const moves = Array.from({ length: 1001 }, () => ({ baseType: 'Chaos Orb', fromBlockLine: 6, toBlockLine: 1 }))
    expect(await move({ revision, moves })).toMatchObject({ ok: false })
  })
})
