import { app, ipcMain } from 'electron'
import type Store from 'electron-store'
import type { AppSettings, PoeProfile } from '@shared/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestGameSwitch } from './game-switch'
import { stableGameSwitchCoordinator } from './experimental/stable'
import { getAppWindow } from './app-window'
import { getProfileById, persistProfileSwitchForRestart } from './profiles/profile-settings'
import { gracefulRestart } from './restart'
import { applySetting } from './settings-write'

vi.mock('electron', () => ({
  app: { isPackaged: true, relaunch: vi.fn(), quit: vi.fn() },
  ipcMain: { on: vi.fn() },
}))
vi.mock('./app-window', () => ({
  getAppWindow: vi.fn(),
  showAppWindow: vi.fn(),
}))
vi.mock('./overlay', () => ({ getOverlayAttachedVersion: vi.fn() }))
vi.mock('./settings-write', () => ({ applySetting: vi.fn() }))
vi.mock('./restart', () => ({ gracefulRestart: vi.fn() }))
vi.mock('./profiles/profile-settings', () => ({
  getProfileById: vi.fn(),
  persistProfileSwitchForRestart: vi.fn(),
}))

// Capture the import-time listener before clearing call history between tests.
const respond = vi.mocked(ipcMain.on).mock.calls.find(([channel]) => channel === 'game-switch-response')![1]
const profile = { id: 'poe2-profile', gameVariant: 2 } as PoeProfile
let store: Store<AppSettings>

beforeEach(() => {
  vi.resetAllMocks()
  store = { get: vi.fn(() => 1) } as unknown as Store<AppSettings>
  vi.mocked(getProfileById).mockReturnValue(profile)
  vi.mocked(gracefulRestart).mockResolvedValue({ ok: true })
})

afterEach(() => {
  expect(app.relaunch).not.toHaveBeenCalled()
  expect(app.quit).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

describe('stable fallback profile switch restart wiring', () => {
  it.each([
    { restart: { ok: true }, result: { ok: true, restarting: true } },
    { restart: { ok: false, error: 'spawn failed' }, result: { ok: false, error: 'spawn failed' } },
    { restart: { ok: false }, result: { ok: false, error: 'Restart failed' } },
  ])('persists the target before one graceful restart and returns $result', async ({ restart, result }) => {
    vi.mocked(gracefulRestart).mockImplementation(async () => {
      expect(persistProfileSwitchForRestart).toHaveBeenCalledExactlyOnceWith(store, profile)
      return restart
    })

    await expect(stableGameSwitchCoordinator.applyProfileSwitch(store, profile.id, true, null)).resolves.toEqual(result)

    expect(gracefulRestart).toHaveBeenCalledExactlyOnceWith()
    expect(applySetting).not.toHaveBeenCalled()
  })

  it('requires confirmation without persisting or restarting', async () => {
    await expect(stableGameSwitchCoordinator.applyProfileSwitch(store, profile.id, false, null)).resolves.toEqual({
      ok: false,
      requiresRestart: true,
      targetGame: 2,
    })
    expect(persistProfileSwitchForRestart).not.toHaveBeenCalled()
    expect(gracefulRestart).not.toHaveBeenCalled()
    expect(applySetting).not.toHaveBeenCalled()
  })
})

describe('prompted game switch restart wiring', () => {
  it.each([true, false])('persists the selected game before graceful restart (restart ok: %s)', async (ok) => {
    const send = vi.fn()
    vi.mocked(getAppWindow).mockReturnValue({ webContents: { send } } as unknown as Electron.BrowserWindow)
    vi.mocked(gracefulRestart).mockImplementation(async () => {
      expect(applySetting).toHaveBeenCalledExactlyOnceWith(store, 'poeVersion', 2, null)
      return { ok, ...(ok ? {} : { error: 'spawn failed' }) }
    })

    const switching = requestGameSwitch(store, 2)
    expect(send).toHaveBeenCalledExactlyOnceWith('game-switch-prompt', 2)
    expect(applySetting).not.toHaveBeenCalled()
    expect(gracefulRestart).not.toHaveBeenCalled()
    respond({} as Electron.IpcMainEvent, 'restart')

    await expect(switching).resolves.toBeUndefined()
    expect(gracefulRestart).toHaveBeenCalledExactlyOnceWith()
  })
})
