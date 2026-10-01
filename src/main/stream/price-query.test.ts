import type { ChipState, PriceCheck, QueryOp } from '@scalpel/stream-contract'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { on: vi.fn(), handle: vi.fn(), removeListener: vi.fn() },
  app: { userAgentFallback: 'Scalpel-Test/1.0', on: vi.fn(), isReady: () => false },
  net: { request: vi.fn() },
}))

// Pass-through spy so one test can feed buildPriceCheck a hand-built row set.
vi.mock('../trade/stat-matcher', async (orig) => {
  const actual = await orig<typeof import('../trade/stat-matcher')>()
  return { ...actual, matchItemMods: vi.fn(actual.matchItemMods) }
})

import { setPoeVersion } from '../game-state'
import { FIXTURES, STAT_ENTRIES } from '../trade/__fixtures__/poe2-trade-items'
import { parseItemText } from '../trade/clipboard'
import { defensesFromPoeItem, itemInfoFromPoeItem, tradeItemFromPoeItem } from '../trade/item-info'
import { _setStatEntriesForTests, matchItemMods } from '../trade/stat-matcher'
import { buildTradeQuery, type StatFilter } from '../trade/trade'
import { applyEdits, initialEdits, type RowEdit } from '../../../packages/stream-viewer/src/data/trade-link'
import characterJson from './__fixtures__/ninja-character.json'
import characterStats from './__fixtures__/ninja-character-stats.json'
import { ninjaItemText } from './ninja-item-text'
import {
  buildPriceCheck,
  chipVariant,
  duplicateOpLocks,
  lockedSuffix,
  MAX_PRICE_CHECK_BYTES,
  tradeLeague,
} from './price-query'
import { NinjaCharacterSchema, NinjaItemDataSchema } from './sources/ninja-types'

const LEAGUE = 'Fate of the Vaal'

const unidRingText = [
  'Item Class: Rings',
  'Rarity: Rare',
  'Gold Ring',
  '--------',
  'Item Level: 83',
  '--------',
  '{ Implicit Modifier }',
  '11(6-15)% increased Rarity of Items found (implicit)',
  '--------',
  'Unidentified',
].join('\n')

function parse(text: string) {
  const item = parseItemText(text)
  if (!item) throw new Error('fixture did not parse')
  return item
}

function defaultFilters(text: string): StatFilter[] {
  const item = parse(text)
  return matchItemMods(
    item.explicits,
    item.implicits,
    defensesFromPoeItem(item),
    itemInfoFromPoeItem(item),
    item.advancedMods,
    90,
  ).slice(0, 40)
}

// Test-local stand-in for the viewer's applyEdits (Task 6): delete drops the key,
// disable marks the object `disabled: true`, set writes the value (creating missing
// intermediate objects).
function applyOps(body: unknown, ops: QueryOp[]): unknown {
  const out = structuredClone(body)
  for (const o of ops) {
    let node = out as Record<string | number, unknown>
    for (const key of o.path.slice(0, -1)) {
      if (o.op === 'set' && (typeof node[key] !== 'object' || node[key] === null)) node[key] = {}
      node = node[key] as Record<string | number, unknown>
    }
    const last = o.path[o.path.length - 1]
    if (o.op === 'delete') delete node[last]
    else if (o.op === 'set') node[last] = structuredClone(o.value)
    else (node[last] as Record<string, unknown>).disabled = true
  }
  return out
}

function setAt(body: unknown, path: Array<string | number>, value: number): unknown {
  const out = structuredClone(body)
  let node = out as Record<string | number, unknown>
  for (const key of path.slice(0, -1)) node = node[key] as Record<string | number, unknown>
  node[path[path.length - 1]] = value
  return out
}

// trade2-semantic normalisation applied to both sides: a stat filter or group marked
// `disabled: true` is ignored by trade2; an `and` group with no filters matches every
// item; a filter group whose `filters` object is empty constrains nothing. Non-`and`
// stat groups (count/not/weight) are kept even when empty, so a fully-disabled count
// group still shows up as a mismatch.
function normalise(body: unknown): unknown {
  const b = structuredClone(body) as { query: Record<string, unknown> }
  const q = b.query
  if (Array.isArray(q.stats)) {
    const groups = (q.stats as Array<Record<string, unknown>>)
      .filter((g) => g.disabled !== true)
      .map((g): Record<string, unknown> & { filters: unknown[] } => ({
        ...g,
        filters: (g.filters as Array<Record<string, unknown>>).filter((f) => f.disabled !== true),
      }))
      .filter((g) => !(g.type === 'and' && g.filters.length === 0))
    q.stats = groups
  }
  const groups = q.filters as Record<string, { filters?: Record<string, unknown> }> | undefined
  if (groups) {
    for (const [k, g] of Object.entries(groups)) {
      if (g.filters && Object.keys(g.filters).length === 0) delete groups[k]
    }
    if (Object.keys(groups).length === 0) delete q.filters
  }
  return b
}

// Rows are a subsequence of the matched filters (no-effect locked rows are dropped), so
// map each row to the index of the filter it came from.
function filterIndexes(pc: PriceCheck, filters: StatFilter[]): number[] {
  let k = 0
  return pc.rows.map((row) => {
    while (k < filters.length && filters[k].id !== row.id) k++
    if (k >= filters.length) throw new Error(`no filter for row ${row.id}`)
    return k++
  })
}

/** The "on" filter set: toggleable rows enabled, everything else (locked, chip, dropped) as matched. */
function onFiltersFor(pc: PriceCheck, filters: StatFilter[]): StatFilter[] {
  const idx = filterIndexes(pc, filters)
  return filters.map((f, j) => {
    const r = idx.indexOf(j)
    return r >= 0 && !pc.rows[r].locked && !pc.rows[r].chip ? { ...f, enabled: true } : f
  })
}

function check(name: string): PriceCheck {
  const pc = buildPriceCheck(parse(FIXTURES[name]), LEAGUE)
  if (!pc) throw new Error(`buildPriceCheck returned null for ${name}`)
  return pc
}

beforeEach(() => {
  setPoeVersion(2)
  _setStatEntriesForTests(STAT_ENTRIES)
})

describe('buildPriceCheck', () => {
  for (const name of Object.keys(FIXTURES)) {
    it(`builds a bounded price check: ${name}`, () => {
      const pc = check(name)
      expect(pc.league).toBe(LEAGUE)
      expect(pc.rows.length).toBeGreaterThan(0)
      expect(Buffer.byteLength(JSON.stringify(pc), 'utf8')).toBeLessThanOrEqual(MAX_PRICE_CHECK_BYTES)
    })
  }

  for (const name of ['ring', 'bow', 'armour']) {
    it(`default-off ops reproduce the default query: ${name}`, () => {
      const pc = check(name)
      const item = parse(FIXTURES[name])
      const ops = pc.rows.filter((r) => !r.locked && !r.defaultEnabled).flatMap((r) => r.offOps)
      const viewer = applyOps(pc.body, ops)
      const expected = buildTradeQuery(tradeItemFromPoeItem(item), defaultFilters(FIXTURES[name]), {
        loggedIn: false,
      }).body
      expect(normalise(viewer)).toEqual(normalise(expected))
    })

    it(`every toggleable row's offOps reproduce turning that row off: ${name}`, () => {
      const pc = check(name)
      const item = parse(FIXTURES[name])
      const filters = defaultFilters(FIXTURES[name])
      const onFilters = onFiltersFor(pc, filters)
      const idx = filterIndexes(pc, filters)
      pc.rows.forEach((row, r) => {
        if (row.locked || row.chip) return
        const off = onFilters.map((f, j) => (j === idx[r] ? { ...f, enabled: false } : f))
        const expected = buildTradeQuery(tradeItemFromPoeItem(item), off, { loggedIn: false }).body
        expect(normalise(applyOps(pc.body, row.offOps))).toEqual(normalise(expected))
      })
    })
  }

  for (const name of ['ring', 'bow', 'armour']) {
    it(`every chip state's ops reproduce building with that state: ${name}`, () => {
      const pc = check(name)
      const item = parse(FIXTURES[name])
      const filters = defaultFilters(FIXTURES[name])
      const idx = filterIndexes(pc, filters)
      const defaultOff = pc.rows.filter((r) => !r.locked && !r.chip && !r.defaultEnabled).flatMap((r) => r.offOps)
      let checked = 0
      pc.rows.forEach((row, r) => {
        if (!row.chip) return
        expect(row.locked).toBe(false)
        expect(row.chip.states[row.chip.default]).toEqual([])
        for (const [state, ops] of Object.entries(row.chip.states) as Array<[ChipState, QueryOp[]]>) {
          const variant = filters.map((f, j) => (j === idx[r] ? chipVariant(f, state) : f))
          const expected = buildTradeQuery(tradeItemFromPoeItem(item), variant, { loggedIn: false }).body
          expect(normalise(applyOps(pc.body, [...ops, ...defaultOff])), `${row.id} ${state}`).toEqual(
            normalise(expected),
          )
          checked++
        }
      })
      expect(checked).toBeGreaterThan(0)
    })
  }

  for (const name of ['ring', 'bow', 'armour']) {
    it(`chip states compose pairwise with other chips and toggleable rows: ${name}`, () => {
      const pc = check(name)
      const item = parse(FIXTURES[name])
      const filters = defaultFilters(FIXTURES[name])
      const idx = filterIndexes(pc, filters)
      const offOpsByRow = new Map<number, QueryOp[]>()
      pc.rows.forEach((r, k) => {
        if (!r.locked && !r.chip && !r.defaultEnabled) offOpsByRow.set(k, r.offOps)
      })
      const expectCombo = (ops: QueryOp[], changes: Map<number, (f: StatFilter) => StatFilter>, label: string) => {
        const viewer = applyOps(pc.body, ops)
        const fs = filters.map((f, j) => {
          const r = idx.indexOf(j)
          const change = r >= 0 ? changes.get(r) : undefined
          return change ? change(f) : f
        })
        const expected = buildTradeQuery(tradeItemFromPoeItem(item), fs, { loggedIn: false }).body
        expect(normalise(viewer), label).toEqual(normalise(expected))
      }
      const chipRows = pc.rows.map((r, k) => ({ r, k })).filter(({ r }) => r.chip)
      const toggleRows = pc.rows.map((r, k) => ({ r, k })).filter(({ r }) => !r.locked && !r.chip)
      let combos = 0
      for (const a of chipRows) {
        for (const [sa, opsA] of Object.entries(a.r.chip?.states ?? {}) as Array<[ChipState, QueryOp[]]>) {
          // (1) every other chip in every state
          for (const b of chipRows) {
            if (b.k <= a.k) continue
            for (const [sb, opsB] of Object.entries(b.r.chip?.states ?? {}) as Array<[ChipState, QueryOp[]]>) {
              const defaultOff = [...offOpsByRow.values()].flat()
              expectCombo(
                [...opsA, ...opsB, ...defaultOff],
                new Map([
                  [a.k, (f: StatFilter) => chipVariant(f, sa)],
                  [b.k, (f: StatFilter) => chipVariant(f, sb)],
                ]),
                `${a.r.id}=${sa} + ${b.r.id}=${sb}`,
              )
              combos++
            }
          }
          // (2) every toggleable row flipped from its default (default-on turned off, default-off turned on)
          for (const t of toggleRows) {
            const others = [...offOpsByRow].filter(([k]) => k !== t.k).flatMap(([, ops]) => ops)
            const flipOps = t.r.defaultEnabled ? t.r.offOps : []
            expectCombo(
              [...opsA, ...flipOps, ...others],
              new Map([
                [a.k, (f: StatFilter) => chipVariant(f, sa)],
                [t.k, (f: StatFilter) => ({ ...f, enabled: !t.r.defaultEnabled })],
              ]),
              `${a.r.id}=${sa} + ${t.r.id} ${t.r.defaultEnabled ? 'off' : 'on'}`,
            )
            combos++
          }
        }
      }
      expect(combos).toBeGreaterThan(0)
    })
  }

  for (const name of ['ring', 'bow', 'armour']) {
    it(`real viewer applyEdits with every kind of edit at once matches buildTradeQuery: ${name}`, () => {
      const pc = check(name)
      const item = parse(FIXTURES[name])
      const filters = defaultFilters(FIXTURES[name])
      const idx = filterIndexes(pc, filters)
      const edits: RowEdit[] = initialEdits(pc.rows)
      const changes = new Map<number, (f: StatFilter) => StatFilter>()
      let minEdited = false
      pc.rows.forEach((row, r) => {
        if (row.locked) return
        if (row.chip) {
          const to = (Object.keys(row.chip.states) as ChipState[]).find((s) => s !== row.chip?.default)
          if (to === undefined) return
          edits[r].chip = to
          changes.set(r, (f) => chipVariant(f, to))
          return
        }
        if (!minEdited && row.minPath && row.min !== null && row.defaultEnabled) {
          // Edit one min; the row stays enabled.
          minEdited = true
          edits[r].min = row.min + 1
          changes.set(r, (f) => ({ ...f, enabled: true, min: (row.min as number) + 1 }))
          return
        }
        edits[r].enabled = !row.defaultEnabled
        changes.set(r, (f) => ({ ...f, enabled: !row.defaultEnabled }))
      })
      expect(minEdited, 'no stat row with a minPath').toBe(true)
      expect(changes.size).toBeGreaterThan(1)
      const viewer = applyEdits(pc, edits)
      // Rows the viewer doesn't touch: toggleable ones sit at their default, as in the all-on body.
      const fs = filters.map((f, j) => {
        const r = idx.indexOf(j)
        if (r < 0) return f
        const row = pc.rows[r]
        const base = !row.locked && !row.chip ? { ...f, enabled: row.defaultEnabled } : f
        const change = changes.get(r)
        return change ? change(base) : base
      })
      const expected = buildTradeQuery(tradeItemFromPoeItem(item), fs, { loggedIn: false }).body
      expect(normalise(viewer)).toEqual(normalise(expected))
    })
  }

  it('ring: Corrupted, Mirrored and ilvl are chip rows, not locked', () => {
    const pc = check('ring')
    const row = (id: string) => pc.rows.find((r) => r.id === id)
    expect(row('misc.corrupted')).toMatchObject({ locked: false, chip: { mode: 'yesno', default: 'no' } })
    expect(row('misc.mirrored')).toMatchObject({ locked: false, chip: { mode: 'yesno', default: 'no' } })
    expect(row('misc.ilvl')).toMatchObject({ locked: false, chip: { mode: 'minmax', default: 'none' } })
    for (const id of ['misc.corrupted', 'misc.mirrored']) {
      expect(Object.keys(row(id)?.chip?.states ?? {}).sort()).toEqual(['no', 'none', 'yes'])
    }
    expect(Object.keys(row('misc.ilvl')?.chip?.states ?? {}).sort()).toEqual(['max', 'min', 'none'])
  })

  it('writing at minPath matches building with that min', () => {
    const pc = check('ring')
    const item = parse(FIXTURES.ring)
    const filters = defaultFilters(FIXTURES.ring)
    const i = pc.rows.findIndex((r) => !r.locked && r.id === 'explicit.stat_life')
    expect(i).toBeGreaterThanOrEqual(0)
    const path = pc.rows[i].minPath
    expect(path).not.toBeNull()
    const onFilters = onFiltersFor(pc, filters)
    const fi = filterIndexes(pc, filters)[i]
    onFilters[fi] = { ...onFilters[fi], min: 50 }
    const expected = buildTradeQuery(tradeItemFromPoeItem(item), onFilters, { loggedIn: false }).body
    expect(setAt(pc.body, path!, 50)).toEqual(expected)
  })

  it('locks the misc.identified row on an unidentified rare', () => {
    const pc = buildPriceCheck(parse(unidRingText), LEAGUE)
    expect(pc).not.toBeNull()
    const row = pc!.rows.find((r) => r.id === 'misc.identified')
    expect(row).toMatchObject({ locked: true, offOps: [], defaultEnabled: true })
  })
})

describe('tradeLeague', () => {
  it.each([
    ['SSF Runes of Aldur', 'Runes of Aldur'],
    ['HC SSF Runes of Aldur', 'HC Runes of Aldur'],
    ['Hardcore SSF Runes of Aldur', 'Hardcore Runes of Aldur'],
    ['SSF Standard', 'Standard'],
    ['SSF Hardcore', 'Hardcore'],
    ['Fate of the Vaal', 'Fate of the Vaal'],
    ['HC Fate of the Vaal', 'HC Fate of the Vaal'],
    ['Hardcore Mirage', 'Hardcore Mirage'],
    ['Standard', 'Standard'],
  ])('%s -> %s', (from, to) => {
    expect(tradeLeague(from)).toBe(to)
  })

  it('is applied to the league stored on the price check', () => {
    expect(buildPriceCheck(parse(FIXTURES.ring), 'SSF Runes of Aldur')?.league).toBe('Runes of Aldur')
  })
})

describe('locked rows', () => {
  const chip = (id: string, chipState: StatFilter['chipState'], text = id): StatFilter => ({
    id,
    text,
    type: 'misc',
    value: null,
    min: null,
    max: null,
    enabled: false,
    chipState,
  })

  function withRows(extra: StatFilter[]): PriceCheck {
    vi.mocked(matchItemMods).mockReturnValueOnce([
      ...defaultFilters(FIXTURES.ring).filter((f) => !extra.some((e) => e.id === f.id)),
      ...extra,
    ])
    const pc = buildPriceCheck(parse(FIXTURES.ring), LEAGUE)
    if (!pc) throw new Error('null price check')
    return pc
  }

  it('ships a Yes chip at its default state with ops for No and Any', () => {
    const pc = withRows([chip('misc.corrupted', 'yes', 'Corrupted'), chip('misc.mirrored', 'yes', 'Mirrored')])
    const corrupted = pc.rows.find((r) => r.id === 'misc.corrupted')
    expect(corrupted).toMatchObject({ text: 'Corrupted', locked: false, chip: { mode: 'yesno', default: 'yes' } })
    expect(corrupted?.chip?.states.no).toEqual([
      { op: 'set', path: ['query', 'filters', 'misc_filters', 'filters', 'corrupted', 'option'], value: 'false' },
    ])
    const misc = (pc.body.query as { filters: { misc_filters: { filters: Record<string, unknown> } } }).filters
      .misc_filters.filters
    expect(misc.corrupted).toEqual({ option: 'true' })
  })

  it('locks an ilvl row enabled with both min and max (no chip state matches it)', () => {
    const ilvl: StatFilter = {
      id: 'misc.ilvl',
      text: 'ilvl: 83',
      type: 'misc',
      value: 83,
      min: 80,
      max: 85,
      enabled: true,
    }
    const row = withRows([ilvl]).rows.find((r) => r.id === 'misc.ilvl')
    expect(row).toMatchObject({ locked: true, defaultEnabled: true, offOps: [], text: 'ilvl: 83 (80 to 85)' })
    expect(row?.chip).toBeUndefined()
  })

  it('drops the earlier of two chips that the later one overrides', () => {
    const pc = withRows([chip('misc.corrupted', 'yes', 'Corrupted'), chip('misc.corrupted', 'no', 'Corrupted')])
    const rows = pc.rows.filter((r) => r.id === 'misc.corrupted')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ locked: false, chip: { default: 'no' } })
  })

  it('appends option labels', () => {
    const row: StatFilter = { ...chip('map.map_completion_reward', undefined, 'Reward'), option: 'Foo' }
    const out = withRows([{ ...row, displayValue: 'Bar' }]).rows.find((r) => r.id === row.id)
    // Either the row is active (labelled with the display value) or has no effect (dropped).
    if (out) expect(out.text).toBe('Reward: Bar')
  })

  it('labels locked Yes/No chip rows unless the text already says so', () => {
    const f = (text: string, chipState: StatFilter['chipState']) => chip('misc.x', chipState, text)
    expect(lockedSuffix(f('Corrupted', 'yes'))).toBe(': Yes')
    expect(lockedSuffix(f('Corrupted: Yes', 'yes'))).toBe('')
    expect(lockedSuffix(f('Corrupted:  yes', 'yes'))).toBe('')
    expect(lockedSuffix(f('Corrupted', 'no'))).toBe(': No')
    expect(lockedSuffix(f('Corrupted: No', 'no'))).toBe('')
    expect(lockedSuffix(f('ilvl: 83', 'min'))).toBe(' (min)')
  })

  it('drops a locked row that has no effect on the query', () => {
    const pc = withRows([chip('misc.not_a_real_filter', 'yes')])
    expect(pc.rows.some((r) => r.id === 'misc.not_a_real_filter')).toBe(false)
  })

  it('never leaves a locked row unchecked', () => {
    for (const name of Object.keys(FIXTURES)) {
      expect(check(name).rows.filter((r) => r.locked && !r.defaultEnabled)).toEqual([])
    }
    const unid = buildPriceCheck(parse(unidRingText), LEAGUE)
    expect(unid!.rows.filter((r) => r.locked && !r.defaultEnabled)).toEqual([])
  })
})

describe('null results', () => {
  it('logs the item and reason when there are no rows', () => {
    process.env.SCALPEL_DEBUG_LOG = '1'
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(matchItemMods).mockReturnValueOnce([])
    expect(buildPriceCheck(parse(FIXTURES.ring), LEAGUE)).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0].join(' '))).toMatch(/Gold Ring.*no matched rows/)
    warn.mockRestore()
    delete process.env.SCALPEL_DEBUG_LOG
  })
})

describe('duplicate-element hazard', () => {
  it('drops the later of two rows that duplicate a stat filter', () => {
    const life: StatFilter = {
      id: 'explicit.stat_life',
      text: '+72 to maximum Life',
      type: 'explicit',
      value: 72,
      min: 72,
      max: null,
      enabled: false,
    }
    vi.mocked(matchItemMods).mockReturnValueOnce([life, { ...life }])
    const pc = buildPriceCheck(parse(FIXTURES.ring), LEAGUE)
    expect(pc).not.toBeNull()
    // The builder dedups identical filters, so the twin has no effect and is dropped.
    expect(pc!.rows.map((r) => r.locked)).toEqual([false])
    expect(pc!.rows[0].offOps).toEqual([{ op: 'disable', path: ['query', 'stats', 0, 'filters', 0] }])
    expect((pc!.body.query as { stats: Array<{ filters: unknown[] }> }).stats[0].filters).toHaveLength(1)
  })
})

describe('duplicateOpLocks', () => {
  it('locks the later of two rows whose ops share a path', () => {
    const disable = (n: number): QueryOp => ({ op: 'disable', path: ['query', 'stats', 0, 'filters', n] })
    const opsByRow = new Map<number, QueryOp[]>([
      [0, [disable(0)]],
      [2, [disable(1)]],
      [5, [disable(0)]],
      [7, [{ op: 'delete', path: ['query', 'filters', 'misc_filters', 'filters', 'ilvl'] }]],
    ])
    expect(duplicateOpLocks(opsByRow)).toEqual([5])
  })

  it('locks the later row when an earlier row deletes an ancestor of its path', () => {
    const opsByRow = new Map<number, QueryOp[]>([
      [1, [{ op: 'delete', path: ['query', 'filters', 'type_filters'] }]],
      [3, [{ op: 'delete', path: ['query', 'filters', 'type_filters', 'filters', 'quality'] }]],
    ])
    expect(duplicateOpLocks(opsByRow)).toEqual([3])
  })

  it('locks nothing when every path is distinct', () => {
    const opsByRow = new Map<number, QueryOp[]>([
      [0, [{ op: 'delete', path: ['a'] }]],
      [1, [{ op: 'delete', path: ['b'] }]],
    ])
    expect(duplicateOpLocks(opsByRow)).toEqual([])
  })
})

// The live trade2 stat entries the real character's rows match (a 96-entry slice of
// /api/trade2/data/stats); every item builds byte-identically to the full live list.
// With the old 8 KB cap the rare mace (8.4 KB) and bow (9.6 KB) both came out null.
describe('real poe.ninja character', () => {
  const equipped = NinjaCharacterSchema.parse(characterJson).items.map((e) => NinjaItemDataSchema.parse(e.itemData))

  beforeEach(() => {
    _setStatEntriesForTests(characterStats as Parameters<typeof _setStatEntriesForTests>[0])
  })

  it.each(equipped.map((d) => [d.inventoryId ?? d.typeLine, d] as const))('price-checks %s', (_slot, d) => {
    const text = ninjaItemText(d)
    if (text === null) return
    const item = parse(text)
    const pc = buildPriceCheck(item, LEAGUE)
    expect(pc, d.typeLine).not.toBeNull()
    expect(Buffer.byteLength(JSON.stringify(pc), 'utf8')).toBeLessThanOrEqual(MAX_PRICE_CHECK_BYTES)
  })

  it('covers both weapons', () => {
    const slots = equipped.map((d) => d.inventoryId)
    expect(slots).toEqual(expect.arrayContaining(['Weapon', 'Weapon2']))
  })
})
