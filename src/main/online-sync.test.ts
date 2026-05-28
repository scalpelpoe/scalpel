import { createHash } from 'node:crypto'
import { describe, expect, it, vi, beforeAll } from 'vitest'
import type { BrowserWindow } from 'electron'

const mockReadDir = vi.fn()
const mockReadFile = vi.fn()
const mockExistsSync = vi.fn()
const mockStatSync = vi.fn()

vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readdirSync: (...args: unknown[]) => mockReadDir(...args),
  readFileSync: (...args: unknown[]) => mockReadFile(...args),
  statSync: (...args: unknown[]) => mockStatSync(...args),
}))

vi.mock('electron', () => ({
  BrowserWindow: class {},
}))

let checkForChanges: (filterDir: string) => void
let scanOnlineFilters: (filterDir: string) => Array<{ path: string; name: string; hash: string }>
let updateOnlineSyncDir: (filterDir: string) => void
let checkOnlineSyncNow: () => void
let startOnlineSync: (filterDir: string, windowProvider: () => BrowserWindow[]) => void
let stopOnlineSync: () => void

beforeAll(async () => {
  const mod = await import('./online-sync')
  checkForChanges = mod.checkForChanges
  scanOnlineFilters = mod.scanOnlineFilters
  updateOnlineSyncDir = mod.updateOnlineSyncDir
  checkOnlineSyncNow = mod.checkOnlineSyncNow
  startOnlineSync = mod.startOnlineSync
  stopOnlineSync = mod.stopOnlineSync
})

function md5(content: string): string {
  return createHash('md5').update(content, 'utf-8').digest('hex')
}

function setupFs(files: Array<{ name: string; content: string }>): void {
  const onlineDirName = 'OnlineFilters'
  mockReadDir.mockImplementation((dir: string) => {
    if (dir.toLowerCase().endsWith('onlinefilters')) return files.map((f) => f.name)
    return [onlineDirName]
  })
  mockExistsSync.mockReturnValue(true)
  mockStatSync.mockReturnValue({ isDirectory: () => false })
  mockReadFile.mockImplementation((path: string) => {
    const name = String(path).replace(/^.*[\\/]/, '')
    const f = files.find((x) => x.name === name)
    if (!f) throw new Error(`file not found: ${name}`)
    return f.content
  })
}

function makeWin(): BrowserWindow {
  return { webContents: { send: vi.fn() } } as unknown as BrowserWindow
}

describe('scanOnlineFilters', () => {
  it('returns empty when no onlinefilters subfolder exists', () => {
    mockReadDir.mockReturnValue([])
    expect(scanOnlineFilters('/filters')).toEqual([])
  })

  it('returns an entry per file with name from #name: header', () => {
    setupFs([
      { name: 'abc123', content: '#name: NeverSink\nShow\n' },
      { name: 'def456', content: '#name: FilterBlast\nHide\n' },
    ])
    const result = scanOnlineFilters('/filters')
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('NeverSink')
    expect(result[1].name).toBe('FilterBlast')
    expect(result[0].hash).toBe(md5('#name: NeverSink\nShow\n'))
  })

  it('falls back to filename when #name: header is absent', () => {
    setupFs([{ name: 'rawfile', content: 'Show\n' }])
    const result = scanOnlineFilters('/filters')
    expect(result[0].name).toBe('rawfile')
  })
})

describe('checkForChanges', () => {
  it('detects a new file as changed', () => {
    stopOnlineSync()
    const win = makeWin()

    setupFs([{ name: 'existing', content: 'Show\n' }])
    updateOnlineSyncDir('/filters')

    startOnlineSync('/filters', () => [win])

    setupFs([
      { name: 'existing', content: 'Show\n' },
      { name: 'newfile', content: '#name: Fresh\nHide\n' },
    ])

    checkForChanges('/filters')

    const sendCalls = vi.mocked(win.webContents.send).mock.calls.filter((c) => c[0] === 'online-filter-changed')
    expect(sendCalls.length).toBeGreaterThanOrEqual(1)
    const changed = sendCalls[0][1] as Array<{ path: string; name: string }>
    expect(changed.some((c) => c.name === 'Fresh')).toBe(true)
  })

  it('detects a modified file as changed', () => {
    stopOnlineSync()
    const win = makeWin()

    setupFs([{ name: 'modfile', content: '#name: Old\nv1\n' }])
    updateOnlineSyncDir('/filters')

    startOnlineSync('/filters', () => [win])

    setupFs([{ name: 'modfile', content: '#name: Old\nv2\n' }])

    checkForChanges('/filters')

    const sendCalls = vi.mocked(win.webContents.send).mock.calls.filter((c) => c[0] === 'online-filter-changed')
    expect(sendCalls.length).toBeGreaterThanOrEqual(1)
    const changed = sendCalls[0][1] as Array<{ path: string; name: string }>
    expect(changed.some((c) => c.name === 'Old')).toBe(true)
  })

  it('does not notify when nothing changed', () => {
    stopOnlineSync()
    const win = makeWin()

    const files = [{ name: 'stable', content: '#name: Stable\nv1\n' }]
    setupFs(files)
    updateOnlineSyncDir('/filters')

    startOnlineSync('/filters', () => [win])

    setupFs(files)

    checkForChanges('/filters')

    const sendCalls = vi.mocked(win.webContents.send).mock.calls.filter((c) => c[0] === 'online-filter-changed')
    expect(sendCalls.length).toBe(0)
  })
})

describe('updateOnlineSyncDir lifecycle', () => {
  it('survives switching from empty to a different dir', () => {
    stopOnlineSync()
    const win = makeWin()

    setupFs([{ name: 'original', content: '#name: Original\noriginal\n' }])
    updateOnlineSyncDir('/old-dir')
    startOnlineSync('/old-dir', () => [win])

    updateOnlineSyncDir('')

    setupFs([{ name: 'fresh', content: '#name: Fresh\nfresh\n' }])
    updateOnlineSyncDir('/new-dir')
    startOnlineSync('/new-dir', () => [win])

    checkForChanges('/new-dir')

    expect(true).toBe(true)
  })

  it('does not throw when startOnlineSync is called with empty dir', () => {
    stopOnlineSync()
    expect(() => startOnlineSync('', () => [])).not.toThrow()
    expect(() => checkOnlineSyncNow()).not.toThrow()
  })
})
