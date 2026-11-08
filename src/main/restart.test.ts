import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [] as string[])
const app = vi.hoisted(() => ({
  isPackaged: true,
  on: vi.fn(),
  relaunch: vi.fn(() => calls.push('relaunch')),
  quit: vi.fn(() => calls.push('quit')),
  exit: vi.fn(() => calls.push('exit')),
}))
const shutdown = vi.hoisted(() =>
  vi.fn(async () => {
    calls.push('native-stop')
  }),
)
const stopAllNow = vi.hoisted(() => vi.fn(() => calls.push('native-stop-now')))
const flushAll = vi.hoisted(() => vi.fn(() => calls.push('storage-flush')))

vi.mock('electron', () => ({ app }))
vi.mock('./diagnostics', () => ({ recordMainBreadcrumb: vi.fn(), recordMainDiagnostic: vi.fn() }))
vi.mock('./plugins/native-backend', () => ({ pluginNativeBackends: { shutdown, stopAllNow } }))
vi.mock('./plugins/storage', () => ({ flushAll }))

describe('gracefulRestart', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.useRealTimers()
    calls.length = 0
    vi.clearAllMocks()
    shutdown.mockImplementation(async () => {
      calls.push('native-stop')
    })
    vi.resetModules()
  })

  it('schedules relaunch then stops native workers and flushes storage before quitting', async () => {
    const { gracefulRestart } = await import('./restart')

    await expect(gracefulRestart()).resolves.toEqual({ ok: true })
    expect(calls).toEqual(['storage-flush', 'relaunch', 'native-stop', 'storage-flush', 'quit'])
  })

  it('preserves the outer AppImage and arguments and waits for workers before quitting', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    vi.stubEnv('APPIMAGE', '/opt/Scalpel With Spaces.AppImage')
    let release!: () => void
    shutdown.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const { gracefulRestart } = await import('./restart')

    const restart = gracefulRestart()
    await gracefulRestart()
    expect(app.relaunch).toHaveBeenCalledExactlyOnceWith({
      execPath: '/opt/Scalpel With Spaces.AppImage',
      args: process.argv.slice(1),
    })
    expect(app.quit).not.toHaveBeenCalled()
    expect(app.exit).not.toHaveBeenCalled()

    release()
    await expect(restart).resolves.toEqual({ ok: true })
    expect(app.quit).toHaveBeenCalledOnce()
  })

  it('supports updater exit without bypassing graceful shutdown', async () => {
    const { gracefulRestart } = await import('./restart')

    await gracefulRestart({ exitImmediately: true })
    expect(calls).toEqual(['storage-flush', 'relaunch', 'native-stop', 'storage-flush', 'exit'])
  })

  it('runs graceful shutdown only once and falls back to forced teardown on failure', async () => {
    shutdown.mockRejectedValueOnce(new Error('worker stuck'))
    const { gracefulShutdown } = await import('./restart')

    const first = gracefulShutdown()
    const second = gracefulShutdown()

    expect(first).toBe(second)
    await first
    expect(shutdown).toHaveBeenCalledOnce()
    expect(stopAllNow).toHaveBeenCalledOnce()
    expect(flushAll).toHaveBeenCalledOnce()
  })

  it('delays normal quit until graceful shutdown completes', async () => {
    let release!: () => void
    shutdown.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          calls.push('native-stop')
          release = resolve
        }),
    )
    let beforeQuit: ((event: { preventDefault(): void }) => void) | undefined
    app.on.mockImplementation((event: string, handler: (event: { preventDefault(): void }) => void) => {
      if (event === 'before-quit') beforeQuit = handler
      return app
    })
    const { registerGracefulQuit } = await import('./restart')
    registerGracefulQuit()
    const preventDefault = vi.fn()

    beforeQuit?.({ preventDefault })
    beforeQuit?.({ preventDefault })
    expect(preventDefault).toHaveBeenCalledTimes(2)
    expect(app.quit).not.toHaveBeenCalled()

    release()
    await vi.waitFor(() => expect(app.quit).toHaveBeenCalledOnce())

    const finalPreventDefault = vi.fn()
    beforeQuit?.({ preventDefault: finalPreventDefault })
    expect(finalPreventDefault).not.toHaveBeenCalled()
  })

  it('forces teardown and resumes quit when serialized lifecycle work stalls', async () => {
    vi.useFakeTimers()
    shutdown.mockImplementationOnce(() => new Promise<void>(() => {}))
    let beforeQuit: ((event: { preventDefault(): void }) => void) | undefined
    app.on.mockImplementation((event: string, handler: (event: { preventDefault(): void }) => void) => {
      if (event === 'before-quit') beforeQuit = handler
      return app
    })
    const { registerGracefulQuit } = await import('./restart')
    registerGracefulQuit()

    beforeQuit?.({ preventDefault: vi.fn() })
    await vi.advanceTimersByTimeAsync(3_000)

    expect(stopAllNow).toHaveBeenCalledOnce()
    expect(app.quit).toHaveBeenCalledOnce()
  })
})
