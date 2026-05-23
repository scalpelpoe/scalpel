import type { Stats } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs', () => ({
  statSync: vi.fn(),
  watchFile: vi.fn(),
  unwatchFile: vi.fn(),
  openSync: vi.fn(),
  readSync: vi.fn(),
  closeSync: vi.fn(),
}))

import * as fs from 'node:fs'
import { _resetForTests, startWatcher } from './watcher'

function fakeStats(size: number, mtimeMs: number): Stats {
  return { size, mtime: new Date(mtimeMs), mtimeMs } as unknown as Stats
}

type ReadSyncMock = {
  mockImplementation: (
    impl: (fd: number, buffer: Buffer, offset: number, length: number, position: number | null) => number,
  ) => void
}

function mockReadSync(
  impl: (fd: number, buffer: Buffer, offset: number, length: number, position: number | null) => number,
): void {
  ;(vi.mocked(fs.readSync) as unknown as ReadSyncMock).mockImplementation(impl)
}

describe('watcher', () => {
  let watchCb: ((curr: Stats, prev: Stats) => void) | null = null

  beforeEach(() => {
    _resetForTests()
    watchCb = null
    vi.mocked(fs.watchFile).mockImplementation(((_p, _opts, cb) => {
      watchCb = cb as typeof watchCb
    }) as typeof fs.watchFile)
    vi.mocked(fs.openSync).mockReturnValue(42 as unknown as number)
    vi.mocked(fs.closeSync).mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('seeks to end on initial attach (no replay)', () => {
    vi.mocked(fs.statSync).mockReturnValue(fakeStats(1000, 1))
    const onLine = vi.fn()
    startWatcher('C:/fake/Client.txt', onLine)
    expect(fs.watchFile).toHaveBeenCalledWith('C:/fake/Client.txt', { interval: 500 }, expect.any(Function))
    expect(fs.readSync).not.toHaveBeenCalled()
    expect(onLine).not.toHaveBeenCalled()
  })

  it('reads only appended bytes on change', () => {
    vi.mocked(fs.statSync).mockReturnValue(fakeStats(100, 1))
    const onLine = vi.fn()
    startWatcher('C:/fake/Client.txt', onLine)

    mockReadSync((_fd, buffer, _offset, length, _pos) => {
      Buffer.from('first\nsecond\n').copy(buffer, 0, 0, length)
      return length
    })

    watchCb?.(fakeStats(113, 2), fakeStats(100, 1))

    expect(fs.openSync).toHaveBeenCalledWith('C:/fake/Client.txt', 'r')
    expect(fs.readSync).toHaveBeenCalledWith(42, expect.any(Buffer), 0, 13, 100)
    expect(fs.closeSync).toHaveBeenCalledWith(42)
    expect(onLine).toHaveBeenCalledWith('first')
    expect(onLine).toHaveBeenCalledWith('second')
  })

  it('resets position on truncation', () => {
    vi.mocked(fs.statSync).mockReturnValue(fakeStats(1000, 1))
    const onLine = vi.fn()
    startWatcher('C:/fake/Client.txt', onLine)

    mockReadSync((_fd, buffer, _offset, length) => {
      Buffer.from('fresh\n').copy(buffer, 0, 0, length)
      return length
    })

    watchCb?.(fakeStats(6, 2), fakeStats(1000, 1))

    expect(fs.readSync).toHaveBeenCalledWith(42, expect.any(Buffer), 0, 6, 0)
    expect(onLine).toHaveBeenCalledWith('fresh')
  })

  it('skips the read when mtime did not advance', () => {
    vi.mocked(fs.statSync).mockReturnValue(fakeStats(100, 1))
    const onLine = vi.fn()
    startWatcher('C:/fake/Client.txt', onLine)
    watchCb?.(fakeStats(100, 1), fakeStats(100, 1))
    expect(fs.readSync).not.toHaveBeenCalled()
  })

  it('caps reads at 1 MB after long idle', () => {
    vi.mocked(fs.statSync).mockReturnValue(fakeStats(0, 1))
    const onLine = vi.fn()
    startWatcher('C:/fake/Client.txt', onLine)

    mockReadSync((_fd, _b, _o, length) => length)

    const huge = 5_000_000
    watchCb?.(fakeStats(huge, 2), fakeStats(0, 1))

    expect(fs.readSync).toHaveBeenCalledWith(42, expect.any(Buffer), 0, 1_000_000, huge - 1_000_000)
  })

  it('ignores empty lines', () => {
    vi.mocked(fs.statSync).mockReturnValue(fakeStats(0, 1))
    const onLine = vi.fn()
    startWatcher('C:/fake/Client.txt', onLine)

    mockReadSync((_fd, buffer, _o, length) => {
      Buffer.from('\n\nreal\n\n').copy(buffer, 0, 0, length)
      return length
    })

    watchCb?.(fakeStats(8, 2), fakeStats(0, 1))
    expect(onLine).toHaveBeenCalledTimes(1)
    expect(onLine).toHaveBeenCalledWith('real')
  })
})
