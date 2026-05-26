import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Store from 'electron-store'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { getPoeVersion, setPoeVersion } from './game-state'
import {
  ACTIVE_PROFILE_ID_KEY,
  LAST_PROFILE_ID_POE1_KEY,
  LAST_PROFILE_ID_POE2_KEY,
  PROFILE_VERSION_KEY,
  type ProfileChangedSetting,
} from './profiles/profile-settings'
import { initProfileStore } from './profiles/store'
import type { AppSettings, PoeProfile } from '../shared/types'

function makeStore(initial: Record<string, unknown>): Store<AppSettings> {
  const data: Record<string, unknown> = { ...initial }
  return {
    get: (key: string) => data[key],
    set: (key: string, value: unknown) => {
      data[key] = value
    },
    store: data,
  } as unknown as Store<AppSettings>
}

function setupProfiles(): ReturnType<typeof initProfileStore> {
  return initProfileStore(mkdtempSync(join(tmpdir(), 'scalpel-edit-fx-')))
}

vi.mock('./filter-state', () => ({
  clearFilterState: vi.fn(),
  loadFilter: vi.fn(),
}))

vi.mock('./overlay', () => ({
  getOverlayWindow: vi.fn(() => null),
  setCloseOnClickOutside: vi.fn(),
}))

vi.mock('./whiteboard', () => ({
  getWhiteboardOverlay: vi.fn(() => null),
}))

vi.mock('./app-macros', () => ({
  withPluginHotkeys: vi.fn((value) => value),
}))

vi.mock('./app-window', () => ({
  getAppWindow: vi.fn(() => null),
}))

vi.mock('./cheat-sheets', () => ({
  applyCheatSheetHotkeys: vi.fn(),
  getCheatSheetsOverlay: vi.fn(() => null),
}))

vi.mock('./evaluation', () => ({
  reEvaluateLastItem: vi.fn(),
  setOpenSide: vi.fn(),
}))

vi.mock('./hotkeys', () => ({
  setAppMacros: vi.fn(),
  setChatCommands: vi.fn(),
  setHotkey: vi.fn(),
  setPriceCheckHotkey: vi.fn(),
  setStashScrollEnabled: vi.fn(),
}))

vi.mock('./online-sync', () => ({
  updateOnlineSyncDir: vi.fn(),
}))

vi.mock('./pinned-zone', () => ({
  applyPinnedZoneEnabled: vi.fn(),
  getPinnedZoneOverlay: vi.fn(() => null),
}))

vi.mock('./trade/prices', () => ({
  refreshPrices: vi.fn(),
}))

vi.mock('./update/updater', () => ({
  setUpdateChannel: vi.fn(),
}))

describe('settings-write side effects', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
  })

  it('updates process game state before refreshing prices during profile activation', async () => {
    const { refreshPrices } = await import('./trade/prices')
    const { applyProfileHydrationSideEffects } = await import('./settings-write')
    const observedVersions: number[] = []
    vi.mocked(refreshPrices).mockImplementation(() => {
      observedVersions.push(getPoeVersion())
      return Promise.resolve()
    })

    setPoeVersion(2)

    const changes: ProfileChangedSetting[] = [
      { key: PROFILE_VERSION_KEY, value: 1 },
      {
        key: 'activeProfile',
        value: {
          league: 'Mirage',
          cheatSheets: { globalHotkey: '', categories: [], pinned: false },
        } as unknown as PoeProfile,
        reason: 'activation',
      },
    ]
    applyProfileHydrationSideEffects(changes, { [PROFILE_VERSION_KEY]: 2 } as unknown as AppSettings)

    expect(observedVersions).toEqual([1])
  })

  it('refreshes prices on profile activation', async () => {
    const { refreshPrices } = await import('./trade/prices')
    const { applyProfileHydrationSideEffects } = await import('./settings-write')

    const changes: ProfileChangedSetting[] = [
      {
        key: 'activeProfile',
        value: {
          league: 'Mirage',
          filterDir: '',
          cheatSheets: { globalHotkey: '', categories: [], pinned: false },
        } as unknown as PoeProfile,
        reason: 'activation',
      },
    ]
    applyProfileHydrationSideEffects(changes, {} as unknown as AppSettings)

    expect(refreshPrices).toHaveBeenCalledWith('Mirage')
  })

  it('updates online sync directory on profile activation', async () => {
    const { updateOnlineSyncDir } = await import('./online-sync')
    const { applyProfileHydrationSideEffects } = await import('./settings-write')

    const changes: ProfileChangedSetting[] = [
      {
        key: 'activeProfile',
        value: {
          league: '',
          filterDir: 'C:\\filters',
          cheatSheets: { globalHotkey: '', categories: [], pinned: false },
        } as unknown as PoeProfile,
        reason: 'activation',
      },
    ]
    applyProfileHydrationSideEffects(changes, {} as unknown as AppSettings)

    expect(updateOnlineSyncDir).toHaveBeenCalledWith('C:\\filters')
  })

  it('applies cheat sheet hotkeys on profile activation', async () => {
    const { applyCheatSheetHotkeys } = await import('./cheat-sheets')
    const { applyProfileHydrationSideEffects } = await import('./settings-write')

    const cheatSheets = { globalHotkey: 'Ctrl+X', categories: [], pinned: false }
    const changes: ProfileChangedSetting[] = [
      {
        key: 'activeProfile',
        value: { league: '', filterDir: '', cheatSheets } as unknown as PoeProfile,
        reason: 'activation',
      },
    ]
    applyProfileHydrationSideEffects(changes, {} as unknown as AppSettings)

    expect(applyCheatSheetHotkeys).toHaveBeenCalledWith(cheatSheets)
  })

  it('applies pinned zone enabled state on profile activation', async () => {
    const { applyPinnedZoneEnabled } = await import('./pinned-zone')
    const { applyProfileHydrationSideEffects } = await import('./settings-write')

    const changes: ProfileChangedSetting[] = [
      {
        key: 'activeProfile',
        value: {
          league: '',
          filterDir: '',
          cheatSheets: { globalHotkey: '', categories: [], pinned: true },
        } as unknown as PoeProfile,
        reason: 'activation',
      },
    ]
    applyProfileHydrationSideEffects(changes, {} as unknown as AppSettings)

    expect(applyPinnedZoneEnabled).toHaveBeenCalledWith(true)
  })

  it('loads filter state on profile activation', async () => {
    const { loadFilter } = await import('./filter-state')
    const { applyProfileHydrationSideEffects } = await import('./settings-write')

    const changes: ProfileChangedSetting[] = [
      {
        key: 'activeProfile',
        value: {
          league: '',
          filterDir: '',
          filterPath: 'C:\\filters\\test.filter',
          cheatSheets: { globalHotkey: '', categories: [], pinned: false },
        } as unknown as PoeProfile,
        reason: 'activation',
      },
    ]
    applyProfileHydrationSideEffects(changes, {} as unknown as AppSettings)

    expect(loadFilter).toHaveBeenCalledWith('C:\\filters\\test.filter', 'Profile Activation')
  })

  it('does NOT run profile-backed side effects for edit reason', async () => {
    const { refreshPrices } = await import('./trade/prices')
    const { updateOnlineSyncDir } = await import('./online-sync')
    const { applyCheatSheetHotkeys } = await import('./cheat-sheets')
    const { applyPinnedZoneEnabled } = await import('./pinned-zone')
    const { loadFilter } = await import('./filter-state')
    const { applyProfileHydrationSideEffects } = await import('./settings-write')

    const changes: ProfileChangedSetting[] = [
      {
        key: 'activeProfile',
        value: {
          league: 'Mirage',
          filterDir: 'C:\\filters',
          filterPath: 'C:\\filters\\test.filter',
          cheatSheets: { globalHotkey: 'Ctrl+X', categories: [], pinned: true },
        } as unknown as PoeProfile,
        reason: 'edit',
      },
    ]
    applyProfileHydrationSideEffects(changes, {} as unknown as AppSettings)

    expect(refreshPrices).not.toHaveBeenCalled()
    expect(updateOnlineSyncDir).not.toHaveBeenCalled()
    expect(applyCheatSheetHotkeys).not.toHaveBeenCalled()
    expect(applyPinnedZoneEnabled).not.toHaveBeenCalled()
    expect(loadFilter).not.toHaveBeenCalled()
  })

  it('does NOT run profile-backed side effects for migration reason', async () => {
    const { refreshPrices } = await import('./trade/prices')
    const { updateOnlineSyncDir } = await import('./online-sync')
    const { applyCheatSheetHotkeys } = await import('./cheat-sheets')
    const { applyPinnedZoneEnabled } = await import('./pinned-zone')
    const { loadFilter } = await import('./filter-state')
    const { applyProfileHydrationSideEffects } = await import('./settings-write')

    const changes: ProfileChangedSetting[] = [
      {
        key: 'activeProfile',
        value: {
          league: 'Mirage',
          cheatSheets: { globalHotkey: '', categories: [], pinned: false },
        } as unknown as PoeProfile,
        reason: 'migration',
      },
    ]
    applyProfileHydrationSideEffects(changes, {} as unknown as AppSettings)

    expect(refreshPrices).not.toHaveBeenCalled()
    expect(updateOnlineSyncDir).not.toHaveBeenCalled()
    expect(applyCheatSheetHotkeys).not.toHaveBeenCalled()
    expect(applyPinnedZoneEnabled).not.toHaveBeenCalled()
    expect(loadFilter).not.toHaveBeenCalled()
  })

  it('still runs flat-setting side effects regardless of activeProfile reason', async () => {
    const { setCloseOnClickOutside } = await import('./overlay')
    const { applyProfileHydrationSideEffects } = await import('./settings-write')

    const changes: ProfileChangedSetting[] = [{ key: 'closeOnClickOutside', value: true }]
    applyProfileHydrationSideEffects(changes, {} as unknown as AppSettings)

    expect(setCloseOnClickOutside).toHaveBeenCalledWith(true)
  })

  it('clears filter state when activation profile has no filterPath', async () => {
    const { clearFilterState } = await import('./filter-state')
    const { applyProfileHydrationSideEffects } = await import('./settings-write')

    const changes: ProfileChangedSetting[] = [
      {
        key: 'activeProfile',
        value: {
          league: '',
          filterDir: '',
          filterPath: '',
          cheatSheets: { globalHotkey: '', categories: [], pinned: false },
        } as unknown as PoeProfile,
        reason: 'activation',
      },
    ]
    applyProfileHydrationSideEffects(changes, {} as unknown as AppSettings)

    expect(clearFilterState).toHaveBeenCalled()
  })

  it('clears filter state and online sync when activation profile is null', async () => {
    const { clearFilterState } = await import('./filter-state')
    const { updateOnlineSyncDir } = await import('./online-sync')
    const { applyPinnedZoneEnabled } = await import('./pinned-zone')
    const { applyProfileHydrationSideEffects } = await import('./settings-write')

    const changes: ProfileChangedSetting[] = [
      {
        key: 'activeProfile',
        value: null,
        reason: 'activation',
      },
    ]
    applyProfileHydrationSideEffects(changes, {} as unknown as AppSettings)

    expect(clearFilterState).toHaveBeenCalled()
    expect(updateOnlineSyncDir).toHaveBeenCalledWith('')
    expect(applyPinnedZoneEnabled).toHaveBeenCalledWith(false)
  })

  it('updates online sync dir even when filterDir is empty string on activation', async () => {
    const { updateOnlineSyncDir } = await import('./online-sync')
    const { applyProfileHydrationSideEffects } = await import('./settings-write')

    const changes: ProfileChangedSetting[] = [
      {
        key: 'activeProfile',
        value: {
          league: '',
          filterDir: '',
          cheatSheets: { globalHotkey: '', categories: [], pinned: false },
        } as unknown as PoeProfile,
        reason: 'activation',
      },
    ]
    applyProfileHydrationSideEffects(changes, {} as unknown as AppSettings)

    expect(updateOnlineSyncDir).toHaveBeenCalledWith('')
  })

  it('broadcasts league-updated when active profile league changes', async () => {
    const { getOverlayWindow } = await import('./overlay')
    const { broadcastSettingUpdates } = await import('./settings-write')
    const send = vi.fn()
    vi.mocked(getOverlayWindow).mockReturnValue({ webContents: { send } } as never)

    broadcastSettingUpdates(
      null,
      [{ key: 'activeProfile', value: { league: 'Mercenaries' } as PoeProfile, reason: 'edit' }],
      { activeProfile: { league: 'Standard' } as PoeProfile } as never,
      { activeProfile: { league: 'Mercenaries' } as PoeProfile } as never,
    )

    expect(send).toHaveBeenCalledWith('setting-updated', 'activeProfile', { league: 'Mercenaries' })
    expect(send).toHaveBeenCalledWith('league-updated', 'Mercenaries')
  })

  it('does not broadcast league-updated for unrelated active profile edits', async () => {
    const { getOverlayWindow } = await import('./overlay')
    const { broadcastSettingUpdates } = await import('./settings-write')
    const send = vi.fn()
    vi.mocked(getOverlayWindow).mockReturnValue({ webContents: { send } } as never)

    broadcastSettingUpdates(
      null,
      [{ key: 'activeProfile', value: { league: 'Standard', filterPath: 'a.filter' } as PoeProfile, reason: 'edit' }],
      { activeProfile: { league: 'Standard', filterPath: '' } as PoeProfile } as never,
      { activeProfile: { league: 'Standard', filterPath: 'a.filter' } as PoeProfile } as never,
    )

    expect(send).toHaveBeenCalledWith('setting-updated', 'activeProfile', {
      league: 'Standard',
      filterPath: 'a.filter',
    })
    expect(send).not.toHaveBeenCalledWith('league-updated', expect.any(String))
  })
})

describe('applyProfileSettingForGame edit side effects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reloads the in-memory filter when the active profile filterPath is edited', async () => {
    const { loadFilter } = await import('./filter-state')
    const { applyProfileSettingForGame } = await import('./settings-write')
    const profiles = setupProfiles()
    const poe1 = { ...profiles.createDefault(1), filterPath: 'C:\\old.filter' }
    profiles.saveProfile(poe1)
    const store = makeStore({
      [PROFILE_VERSION_KEY]: 1,
      [ACTIVE_PROFILE_ID_KEY]: poe1.id,
      [LAST_PROFILE_ID_POE1_KEY]: poe1.id,
    })

    applyProfileSettingForGame(store, 1, 'filterPath', 'C:\\new.filter', null)

    expect(loadFilter).toHaveBeenCalledWith('C:\\new.filter', 'Switched Filters')
    expect(profiles.getProfile(poe1.id)?.filterPath).toBe('C:\\new.filter')
  })

  it('clears filter state when the active profile filterPath is edited to empty', async () => {
    const { loadFilter, clearFilterState } = await import('./filter-state')
    const { applyProfileSettingForGame } = await import('./settings-write')
    const profiles = setupProfiles()
    const poe1 = { ...profiles.createDefault(1), filterPath: 'C:\\old.filter' }
    profiles.saveProfile(poe1)
    const store = makeStore({
      [PROFILE_VERSION_KEY]: 1,
      [ACTIVE_PROFILE_ID_KEY]: poe1.id,
      [LAST_PROFILE_ID_POE1_KEY]: poe1.id,
    })

    applyProfileSettingForGame(store, 1, 'filterPath', '', null)

    expect(loadFilter).not.toHaveBeenCalled()
    expect(clearFilterState).toHaveBeenCalled()
  })

  it('re-points online sync when the active profile filterDir is edited', async () => {
    const { updateOnlineSyncDir } = await import('./online-sync')
    const { applyProfileSettingForGame } = await import('./settings-write')
    const profiles = setupProfiles()
    const poe1 = profiles.createDefault(1)
    profiles.saveProfile(poe1)
    const store = makeStore({
      [PROFILE_VERSION_KEY]: 1,
      [ACTIVE_PROFILE_ID_KEY]: poe1.id,
      [LAST_PROFILE_ID_POE1_KEY]: poe1.id,
    })

    applyProfileSettingForGame(store, 1, 'filterDir', 'C:\\filters', null)

    expect(updateOnlineSyncDir).toHaveBeenCalledWith('C:\\filters')
  })

  it('re-registers cheat-sheet hotkeys and pinned zone when the active profile cheatSheets is edited', async () => {
    const { applyCheatSheetHotkeys } = await import('./cheat-sheets')
    const { applyPinnedZoneEnabled } = await import('./pinned-zone')
    const { applyProfileSettingForGame } = await import('./settings-write')
    const profiles = setupProfiles()
    const poe1 = profiles.createDefault(1)
    profiles.saveProfile(poe1)
    const store = makeStore({
      [PROFILE_VERSION_KEY]: 1,
      [ACTIVE_PROFILE_ID_KEY]: poe1.id,
      [LAST_PROFILE_ID_POE1_KEY]: poe1.id,
    })
    const cheatSheets = { globalHotkey: 'Ctrl+X', categories: [], pinned: true }

    applyProfileSettingForGame(store, 1, 'cheatSheets', cheatSheets, null)

    expect(applyCheatSheetHotkeys).toHaveBeenCalledWith(cheatSheets)
    expect(applyPinnedZoneEnabled).toHaveBeenCalledWith(true)
  })

  it('does not run side effects when editing the inactive game profile', async () => {
    const { loadFilter } = await import('./filter-state')
    const { updateOnlineSyncDir } = await import('./online-sync')
    const { applyProfileSettingForGame } = await import('./settings-write')
    const profiles = setupProfiles()
    const poe1 = profiles.createDefault(1)
    const poe2 = profiles.createDefault(2)
    profiles.saveProfile(poe1)
    profiles.saveProfile(poe2)
    const store = makeStore({
      [PROFILE_VERSION_KEY]: 1,
      [ACTIVE_PROFILE_ID_KEY]: poe1.id,
      [LAST_PROFILE_ID_POE1_KEY]: poe1.id,
      [LAST_PROFILE_ID_POE2_KEY]: poe2.id,
    })

    applyProfileSettingForGame(store, 2, 'filterPath', 'C:\\poe2.filter', null)

    expect(loadFilter).not.toHaveBeenCalled()
    expect(updateOnlineSyncDir).not.toHaveBeenCalled()
    expect(profiles.getProfile(poe2.id)?.filterPath).toBe('C:\\poe2.filter')
  })
})
