import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const execFileMock = vi.hoisted(() => vi.fn())
const spawnSyncMock = vi.hoisted(() => vi.fn(() => ({ status: 0 })))
const reportDiagnosticMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  spawnSync: spawnSyncMock,
}))
vi.mock('./support', () => ({ ydotoolEnv: () => ({ YDOTOOL_SOCKET: '/run/ydotoold/socket' }) }))
vi.mock('@platform/common/diagnostics', () => ({ reportDiagnostic: reportDiagnosticMock }))

import { __resetKWinInputForTests, injectKWinCombo, sendKWinKey } from './input'

type ExecCallback = (error: Error | null) => void

let calls: string[][]
let callbacks: ExecCallback[]

beforeEach(() => {
  vi.useFakeTimers()
  calls = []
  callbacks = []
  execFileMock.mockReset()
  execFileMock.mockImplementation((_file: string, args: string[], _options: unknown, callback: ExecCallback) => {
    calls.push(args)
    callbacks.push(callback)
  })
  spawnSyncMock.mockClear()
  reportDiagnosticMock.mockClear()
  __resetKWinInputForTests()
})

afterEach(() => {
  __resetKWinInputForTests()
  vi.useRealTimers()
})

describe('KWin ydotool input queue', () => {
  it('sends queued keys one at a time, in order', async () => {
    sendKWinKey(30, true)
    sendKWinKey(31, true)
    sendKWinKey(31, false)

    expect(calls).toEqual([['key', '--key-delay=0', '30:1']])

    callbacks.shift()?.(null)
    await vi.advanceTimersByTimeAsync(10)
    expect(calls[1]).toEqual(['key', '--key-delay=0', '31:1'])

    callbacks.shift()?.(null)
    await vi.advanceTimersByTimeAsync(10)
    expect(calls[2]).toEqual(['key', '--key-delay=0', '31:0'])

    callbacks.shift()?.(null)
    await vi.advanceTimersByTimeAsync(10)
    expect(calls).toHaveLength(3)
  })

  it('retries a failed release ahead of newer keys', async () => {
    sendKWinKey(30, false)
    sendKWinKey(31, true)

    callbacks.shift()?.(new Error('ydotool failed'))
    await vi.advanceTimersByTimeAsync(10)
    expect(calls[1]).toEqual(['key', '--key-delay=0', '30:0'])
    expect(reportDiagnosticMock).toHaveBeenCalledTimes(1)

    callbacks.shift()?.(null)
    await vi.advanceTimersByTimeAsync(10)
    expect(calls[2]).toEqual(['key', '--key-delay=0', '31:1'])
  })

  it('does not retry a failed press', async () => {
    sendKWinKey(32, true)
    sendKWinKey(33, true)

    callbacks.shift()?.(new Error('ydotool failed'))
    await vi.advanceTimersByTimeAsync(10)
    expect(calls[1]).toEqual(['key', '--key-delay=0', '33:1'])
  })

  it('drops a release after the retry limit instead of looping forever', async () => {
    sendKWinKey(34, false)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      callbacks.shift()?.(new Error('ydotool failed'))
      await vi.advanceTimersByTimeAsync(10)
    }
    const sent = calls.length
    expect(sent).toBe(3)
    callbacks.shift()?.(new Error('ydotool failed'))
    await vi.advanceTimersByTimeAsync(10)
    expect(calls).toHaveLength(sent)
  })

  it('releases stale modifiers first and releases everything after the main key', async () => {
    execFileMock.mockImplementation((_file: string, args: string[], _options: unknown, callback: ExecCallback) => {
      calls.push(args)
      callback(null)
    })
    const combo = injectKWinCombo([29, 42, 30])
    await vi.runAllTimersAsync()
    await combo

    expect(calls.map((args) => args[2])).toEqual(['29:0', '42:0', '29:1', '42:1', '30:1', '30:0', '42:0', '29:0'])
  })

  it('ignores an empty combo', async () => {
    await injectKWinCombo([])
    expect(execFileMock).not.toHaveBeenCalled()
  })
})
