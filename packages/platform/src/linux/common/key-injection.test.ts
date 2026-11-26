import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UiohookKey } from 'uiohook-napi'

const execFile = vi.fn((_tool: string, _args: string[], _opts: unknown, cb: (err: Error | null) => void) => cb(null))
const execFileSync = vi.fn()
const reportDiagnostic = vi.fn()
const reportBreadcrumb = vi.fn()

vi.mock('node:child_process', () => ({ execFile, execFileSync }))
vi.mock('../../common/diagnostics', () => ({ reportDiagnostic, reportBreadcrumb }))

describe('key-injection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('probes again for a tool that was missing at first', async () => {
    vi.useFakeTimers()
    try {
      const { preferredTool } = await import('./key-injection')
      execFileSync.mockImplementation(() => {
        throw new Error('not running')
      })
      expect(preferredTool()).toBeNull()

      execFileSync.mockReset()
      expect(preferredTool()).toBeNull()
      vi.advanceTimersByTime(30_000)
      expect(preferredTool()).toBe('ydotool')
    } finally {
      vi.useRealTimers()
    }
  })

  it('taps ydotool with evdev keycodes', async () => {
    const { tapWithTool } = await import('./key-injection')
    tapWithTool('ydotool', UiohookKey.A)
    await Promise.resolve()
    await Promise.resolve()
    expect(execFile).toHaveBeenCalledWith('ydotool', ['key', '30:1', '30:0'], { timeout: 5000 }, expect.any(Function))
  })

  it('toggles ydotool keys with direction', async () => {
    const { toggleWithTool } = await import('./key-injection')
    toggleWithTool('ydotool', UiohookKey.ArrowLeft, 'down')
    await Promise.resolve()
    await Promise.resolve()
    expect(execFile).toHaveBeenCalledWith('ydotool', ['key', '105:1'], { timeout: 5000 }, expect.any(Function))
  })

  it('reports unsupported wtype key', async () => {
    const { tapWithTool } = await import('./key-injection')
    tapWithTool('wtype', 9999)
    await Promise.resolve()
    expect(reportDiagnostic).toHaveBeenCalledWith('key-injection', expect.any(Error))
  })

  it('refuses wtype hold and reports diagnostic', async () => {
    const { toggleWithTool } = await import('./key-injection')
    toggleWithTool('wtype', UiohookKey.A, 'down')
    await Promise.resolve()
    expect(reportDiagnostic).toHaveBeenCalledWith('key-injection', expect.any(Error))
  })

  it('sends a wtype combo as one coherent invocation', async () => {
    const { tapCombo } = await import('./key-injection')
    await tapCombo('wtype', [UiohookKey.Ctrl, UiohookKey.C])
    expect(execFile).toHaveBeenCalledWith(
      'wtype',
      ['-M', 'ctrl', '-k', 'c', '-m', 'ctrl'],
      { timeout: 5000 },
      expect.any(Function),
    )
  })
})
