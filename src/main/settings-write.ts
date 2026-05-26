import type { WebContents } from 'electron'
import type Store from 'electron-store'
import { getOverlayWindow, setCloseOnClickOutside } from './overlay'
import { withPluginHotkeys } from './app-macros'
import { getAppWindow } from './app-window'
import { applyCheatSheetHotkeys, getCheatSheetsOverlay } from './cheat-sheets'
import { reEvaluateLastItem, setOpenSide } from './evaluation'
import { clearFilterState, loadFilter } from './filter-state'
import { setPoeVersion } from './game-state'
import { setAppMacros, setChatCommands, setHotkey, setPriceCheckHotkey, setStashScrollEnabled } from './hotkeys'
import { applyPinnedZoneEnabled, getPinnedZoneOverlay } from './pinned-zone'
import { updateOnlineSyncDir } from './online-sync'
import { refreshPrices } from './trade/prices'
import { setUpdateChannel } from './update/updater'
import type { AppSettings, CheatSheetsSettings, GameVariant, PoeProfile, RuntimeSettings } from '../shared/types'
import {
  ACTIVE_PROFILE_ID_KEY,
  PROFILE_VERSION_KEY,
  getEffectiveSettings,
  hydrateActiveProfileSettings,
  switchActiveProfileByGameVariant,
  switchActiveProfileById,
  writeLastUsedProfileSettingByGameVariant,
  type ProfileChangedSetting,
  type ProfileSettingKey,
  type ProfileSettingValue,
  type SettingChangeKey,
} from './profiles/profile-settings'

export function broadcastSettingUpdate(sender: WebContents | null, key: SettingChangeKey, value: unknown): void {
  const csWin = getCheatSheetsOverlay()?.getWindow() ?? null
  const pinnedWin = getPinnedZoneOverlay()?.getWindow() ?? null
  for (const win of [getOverlayWindow(), getAppWindow(), csWin, pinnedWin]) {
    if (win && win.webContents !== sender) {
      win.webContents.send('setting-updated', key, value)
    }
  }
  void import('./whiteboard')
    .then(({ getWhiteboardOverlay }) => {
      const wbWin = getWhiteboardOverlay()?.getWindow() ?? null
      if (wbWin && wbWin.webContents !== sender) {
        wbWin.webContents.send('setting-updated', key, value)
      }
    })
    .catch(() => {})
}

function sideEffect(setting: ProfileChangedSetting, prevAppSettings?: AppSettings): void {
  const { key, value } = setting

  if (key === 'activeProfile') {
    if (setting.reason === 'activation') {
      const profile = value as PoeProfile | null
      if (profile) {
        if (profile.league) refreshPrices(profile.league)
        updateOnlineSyncDir(profile.filterDir)
        if (profile.cheatSheets) applyCheatSheetHotkeys(profile.cheatSheets)
        if (profile.filterPath) loadFilter(profile.filterPath, 'Profile Activation')
        else clearFilterState()
        applyPinnedZoneEnabled(profile.cheatSheets?.pinned === true)
      } else {
        clearFilterState()
        updateOnlineSyncDir('')
        applyPinnedZoneEnabled(false)
      }
      return
    }
    return
  }

  if (key === PROFILE_VERSION_KEY) {
    setPoeVersion(value as GameVariant)
  } else if (key === 'hotkey') {
    setHotkey(value as string)
  } else if (key === 'priceCheckHotkey') {
    setPriceCheckHotkey(value as string)
  } else if (key === 'closeOnClickOutside') {
    setCloseOnClickOutside(value as boolean)
  } else if (key === 'chatCommands') {
    setChatCommands(value as AppSettings['chatCommands'])
  } else if (key === 'appMacros') {
    setAppMacros(withPluginHotkeys(value as AppSettings['appMacros']))
  } else if (key === 'stashScrollEnabled') {
    setStashScrollEnabled(value as boolean)
  } else if (key === 'openSide') {
    setOpenSide(value as AppSettings['openSide'])
  } else if (key === 'updateChannel') {
    setUpdateChannel(value as string)
  } else if (key === 'useCurrentZoneAreaLevel') {
    if (prevAppSettings && value !== prevAppSettings.useCurrentZoneAreaLevel) {
      reEvaluateLastItem()
    }
  }
}

export function applyProfileHydrationSideEffects(changes: ProfileChangedSetting[], previous: AppSettings): void {
  for (const change of changes) {
    sideEffect(change, previous)
  }
}

export function broadcastSettingUpdates(
  sender: WebContents | null,
  changes: ProfileChangedSetting[],
  previous?: RuntimeSettings,
  current?: RuntimeSettings,
): void {
  for (const change of changes) {
    broadcastSettingUpdate(sender, change.key, change.value)
  }

  if (changes.some((change) => change.key === 'activeProfile')) {
    const previousLeague = previous?.activeProfile?.league ?? ''
    const changedProfile = changes.find((change) => change.key === 'activeProfile')?.value as
      | PoeProfile
      | null
      | undefined
    const currentLeague = current?.activeProfile?.league ?? changedProfile?.league ?? ''
    if (!previous || previousLeague !== currentLeague) broadcastLeagueUpdate(sender, currentLeague)
  }
}

export function broadcastLeagueUpdate(sender: WebContents | null, league: string): void {
  const csWin = getCheatSheetsOverlay()?.getWindow() ?? null
  const pinnedWin = getPinnedZoneOverlay()?.getWindow() ?? null
  for (const win of [getOverlayWindow(), getAppWindow(), csWin, pinnedWin]) {
    if (win && win.webContents !== sender) {
      win.webContents.send('league-updated', league)
    }
  }
  void import('./whiteboard')
    .then(({ getWhiteboardOverlay }) => {
      const wbWin = getWhiteboardOverlay()?.getWindow() ?? null
      if (wbWin && wbWin.webContents !== sender) {
        wbWin.webContents.send('league-updated', league)
      }
    })
    .catch(() => {})
}

function capturePreviousSettings(store: Store<AppSettings>): RuntimeSettings {
  return getEffectiveSettings(store)
}

export function applySetting<K extends keyof AppSettings>(
  store: Store<AppSettings>,
  key: K,
  value: AppSettings[K],
  sender: WebContents | null,
): void {
  const previous = capturePreviousSettings(store)
  let changes: ProfileChangedSetting[]

  if (key === ACTIVE_PROFILE_ID_KEY && value) {
    changes = switchActiveProfileById(store, value as string)
  } else if (key === PROFILE_VERSION_KEY) {
    changes = switchActiveProfileByGameVariant(store, value as GameVariant)
  } else {
    store.set(key, value)
    changes = [{ key, value } as ProfileChangedSetting]
  }

  if (key === ACTIVE_PROFILE_ID_KEY && changes.length === 0) {
    changes = hydrateActiveProfileSettings(store)
  }

  applyProfileHydrationSideEffects(changes, previous)
  broadcastSettingUpdates(sender, changes, previous, getEffectiveSettings(store))
}

/** Dispatch the imperative main-process side effect for a single profile-backed
 *  field edit. This is what applySetting() used to do for the old flat keys:
 *  a filter pick reloads the in-memory filter, a folder change re-points online
 *  sync, and cheat-sheet edits re-register hotkeys + the pinned-zone overlay.
 *  league/tradePriceOption need no eager effect (consumers read them lazily). */
export function applyProfileEditSideEffect<K extends ProfileSettingKey>(key: K, value: ProfileSettingValue<K>): void {
  if (key === 'filterPath') {
    const path = value as string
    if (path) loadFilter(path, 'Switched Filters')
    else clearFilterState()
  } else if (key === 'filterDir') {
    updateOnlineSyncDir(value as string)
  } else if (key === 'cheatSheets') {
    const cs = value as CheatSheetsSettings
    applyCheatSheetHotkeys(cs)
    applyPinnedZoneEnabled(cs?.pinned === true)
  } else if (key === 'league') {
    refreshPrices(value as string)
  }
}

/** Write a profile-backed setting to the given game's last-used profile, then --
 *  only when that edit targeted the *active* profile -- run the field side effect
 *  and broadcast. The set-profile-setting-for-game IPC handler delegates here so
 *  a filter/dir/cheat-sheet change takes effect immediately rather than waiting
 *  for the next profile activation. Editing the inactive game's profile (the
 *  onboarding "both games" league step) writes silently with no side effect. */
export function applyProfileSettingForGame<K extends ProfileSettingKey>(
  store: Store<AppSettings>,
  variant: GameVariant,
  key: K,
  value: ProfileSettingValue<K>,
  sender: WebContents | null,
): RuntimeSettings {
  const previous = capturePreviousSettings(store)
  const changes = writeLastUsedProfileSettingByGameVariant(store, variant, key, value)
  if (changes.length > 0) {
    applyProfileEditSideEffect(key, value)
    broadcastSettingUpdates(sender, changes, previous, getEffectiveSettings(store))
  }
  return getEffectiveSettings(store)
}
