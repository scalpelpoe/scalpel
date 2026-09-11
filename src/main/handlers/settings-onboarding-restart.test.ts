import { app, ipcMain } from 'electron'
import type Store from 'electron-store'
import type { AppSettings } from '@shared/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { register } from './settings'
import { getOverlayAttachedVersion } from '../overlay'
import { pluginNativeBackends } from '../plugins/native-backend'
import { gracefulRestart } from '../restart'
import { applySetting } from '../settings-write'

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return true
    },
    relaunch: vi.fn(),
    quit: vi.fn(),
  },
  ipcMain: { handle: vi.fn() },
}))
vi.mock('../restart', () => ({ gracefulRestart: vi.fn() }))
vi.mock('../overlay', () => ({ getOverlayAttachedVersion: vi.fn() }))
vi.mock('../plugins/native-backend', () => ({ pluginNativeBackends: { isRestartRequired: vi.fn() } }))
vi.mock('../settings-write', () => ({ applySetting: vi.fn() }))
vi.mock('../window-broadcast', () => ({}))
vi.mock('../filter-state', () => ({}))
vi.mock('../trade/prices', () => ({}))
vi.mock('../trade/leagues', () => ({}))
vi.mock('../profiles/profile-settings', () => ({}))
vi.mock('../experimental', () => ({}))

describe('finish-onboarding restart wiring', () => {
  let store: Store<AppSettings>
  let finish: (event: Electron.IpcMainInvokeEvent) => Promise<unknown>
  const event = { sender: {} } as Electron.IpcMainInvokeEvent

  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(app, 'isPackaged', 'get').mockReturnValue(true)
    vi.mocked(getOverlayAttachedVersion).mockReturnValue(1)
    vi.mocked(pluginNativeBackends.isRestartRequired).mockReturnValue(false)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const data: Record<string, unknown> = {
      poeVersion: 1,
      onboardingCompleted: false,
      onboardingStep: 'plugins',
    }
    store = {
      get: (key: string) => data[key],
      set: (key: string, value: unknown) => {
        data[key] = value
      },
    } as unknown as Store<AppSettings>
    vi.mocked(applySetting).mockImplementation((target, key, value) => target.set(key, value))
    vi.mocked(gracefulRestart).mockImplementation(async () => {
      expect(store.get('onboardingCompleted')).toBe(true)
      expect(store.get('onboardingStep')).toBe('')
      return { ok: true }
    })
    register(store)
    finish = vi.mocked(ipcMain.handle).mock.calls.find(([channel]) => channel === 'finish-onboarding')![1]
  })

  afterEach(() => {
    expect(app.relaunch).not.toHaveBeenCalled()
    expect(app.quit).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it.each([
    { reason: 'overlay mismatch', active: 2, pluginRestart: false },
    { reason: 'plugin restart latch alone', active: 1, pluginRestart: true },
    { reason: 'both restart triggers', active: 2, pluginRestart: true },
  ] as const)('persists onboarding before exactly one graceful restart for $reason', async ({
    active,
    pluginRestart,
  }) => {
    store.set('poeVersion', active)
    vi.mocked(pluginNativeBackends.isRestartRequired).mockReturnValue(pluginRestart)

    await expect(finish(event)).resolves.toEqual({ ok: true, restarting: true })

    expect(applySetting).toHaveBeenCalledTimes(2)
    expect(applySetting).toHaveBeenNthCalledWith(1, store, 'onboardingCompleted', true, event.sender)
    expect(applySetting).toHaveBeenNthCalledWith(2, store, 'onboardingStep', '', event.sender)
    expect(gracefulRestart).toHaveBeenCalledExactlyOnceWith()
  })

  it.each([false, true])('signals manual restart on failure (plugin latch: %s)', async (pluginRestart) => {
    store.set('poeVersion', pluginRestart ? 1 : 2)
    vi.mocked(pluginNativeBackends.isRestartRequired).mockReturnValue(pluginRestart)
    vi.mocked(gracefulRestart).mockImplementation(async () => {
      expect(store.get('onboardingCompleted')).toBe(true)
      expect(store.get('onboardingStep')).toBe('')
      return { ok: false, error: 'spawn failed' }
    })

    await expect(finish(event)).resolves.toEqual({ ok: true, devRestartRequired: true })
    expect(gracefulRestart).toHaveBeenCalledExactlyOnceWith()
    expect(console.error).toHaveBeenCalledWith('[onboarding] restart failed: spawn failed')
    expect(store.get('onboardingCompleted')).toBe(true)
  })

  it.each([
    { packaged: true, active: 1, pluginRestart: false, result: { ok: true } },
    { packaged: false, active: 2, pluginRestart: false, result: { ok: true, devRestartRequired: true } },
    { packaged: false, active: 1, pluginRestart: true, result: { ok: true, devRestartRequired: true } },
    { packaged: false, active: 2, pluginRestart: true, result: { ok: true, devRestartRequired: true } },
  ] as const)('does not restart for packaged=$packaged active=$active pluginLatch=$pluginRestart', async ({
    packaged,
    active,
    pluginRestart,
    result,
  }) => {
    vi.spyOn(app, 'isPackaged', 'get').mockReturnValue(packaged)
    store.set('poeVersion', active)
    vi.mocked(pluginNativeBackends.isRestartRequired).mockReturnValue(pluginRestart)

    await expect(finish(event)).resolves.toEqual(result)
    expect(gracefulRestart).not.toHaveBeenCalled()
    expect(store.get('onboardingCompleted')).toBe(true)
    expect(store.get('onboardingStep')).toBe('')
  })
})
