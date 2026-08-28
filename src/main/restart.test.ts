import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [] as string[])
const app = vi.hoisted(() => ({
  isPackaged: true,
  relaunch: vi.fn(() => calls.push('relaunch')),
  quit: vi.fn(() => calls.push('quit')),
  exit: vi.fn(() => calls.push('exit')),
}))
const shutdown = vi.hoisted(() => vi.fn(async () => calls.push('native-stop')))
const flushAll = vi.hoisted(() => vi.fn(() => calls.push('storage-flush')))

vi.mock('electron', () => ({ app }))
vi.mock('./diagnostics', () => ({ recordMainBreadcrumb: vi.fn(), recordMainDiagnostic: vi.fn() }))
vi.mock('./plugins/native-backend', () => ({ pluginNativeBackends: { shutdown, stopAllNow: vi.fn() } }))
vi.mock('./plugins/storage', () => ({ flushAll }))

describe('gracefulRestart', () => {
  beforeEach(() => {
    calls.length = 0
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('stops native workers and flushes plugin storage before relaunch', async () => {
    const { gracefulRestart } = await import('./restart')

    await expect(gracefulRestart()).resolves.toEqual({ ok: true })
    expect(calls).toEqual(['storage-flush', 'relaunch', 'native-stop', 'quit'])
  })

  it('supports updater exit without bypassing graceful shutdown', async () => {
    const { gracefulRestart } = await import('./restart')

    await gracefulRestart({ exitImmediately: true })
    expect(calls).toEqual(['storage-flush', 'relaunch', 'native-stop', 'exit'])
  })
})
