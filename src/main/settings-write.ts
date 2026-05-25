/** Single source of truth for "what happens when a setting is written":
 *  side effects and broadcast to other windows. Profile-backed fields
 *  (filterPath, league, etc.) are handled directly by profile management
 *  code; this module only deals with global AppSettings keys. */

import type { WebContents } from 'electron'
import type Store from 'electron-store'
import { getOverlayWindow, setCloseOnClickOutside } from './overlay'
import { withPluginHotkeys } from './app-macros'
import { getAppWindow } from './app-window'
import { applyCheatSheetHotkeys, getCheatSheetsOverlay } from './cheat-sheets'
import { reEvaluateLastItem, setOpenSide } from './evaluation'
import { setPoeVersion } from './game-state'
import { setAppMacros, setChatCommands, setHotkey, setPriceCheckHotkey, setStashScrollEnabled } from './hotkeys'
import { applyPinnedZoneEnabled, getPinnedZoneOverlay } from './pinned-zone'
import { refreshPrices } from './trade/prices'
import { setUpdateChannel } from './update/updater'
import type { AppSettings } from '../shared/types'
import {
  ACTIVE_PROFILE_ID_KEY,
  PROFILE_VERSION_KEY,
  getEffectiveSettings,
  hydrateActiveProfileSettings,
  isProfileBackedKey,
  switchActiveProfileByGameVariant,
  switchActiveProfileById,
  writeActiveProfileSetting,
  type ProfileBackedKey,
  type ProfileChangedSetting,
  type SettingChangeKey,
  type SettingValue,
} from './profile-settings'

/** Send `setting-updated` to every window except the sender. */
export function broadcastSettingUpdate(sender: WebContents | null, key: SettingChangeKey, value: SettingValue<SettingChangeKey>): void {
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
    .catch(() => {
      // whiteboard module unavailable; nothing to notify.
    })
}
function sideEffect(setting: ProfileChangedSetting, prevAppSettings?: AppSettings): void {
  const { key, value } = setting

  switch (key) {
    case PROFILE_VERSION_KEY:
      setPoeVersion(value)
      break
    case 'hotkey':
      setHotkey(value)
      break
    case 'priceCheckHotkey':
      setPriceCheckHotkey(value)
      break
    case 'closeOnClickOutside':
      setCloseOnClickOutside(value)
      break
    case 'league':
      refreshPrices(value)
      break
    case 'chatCommands':
      setChatCommands(value)
      break
    case 'appMacros':
      setAppMacros(withPluginHotkeys(value))
      break
    case 'stashScrollEnabled':
      setStashScrollEnabled(value)
      break
    case 'openSide':
      setOpenSide(value)
      break
    case 'updateChannel':
      setUpdateChannel(value)
      break
    case 'useCurrentZoneAreaLevel':
      if (prevAppSettings && value !== prevAppSettings.useCurrentZoneAreaLevel) {
        reEvaluateLastItem()
      }
      break
  }
}

export function applyProfileHydrationSideEffects(
  changes: ProfileChangedSetting[],
  previous: AppSettings,
): void {
  for (const change of changes) {
    sideEffect(change, previous)
  }
}

export function broadcastSettingUpdates(sender: WebContents | null, changes: ProfileChangedSetting[]): void {
  for (const { key, value } of changes) {
    broadcastSettingUpdate(sender, key, value)
  }
}

function capturePreviousSettings(store: Store<AppSettings>): AppSettings {
  return getEffectiveSettings(store)
}

/** Persist a setting + dispatch any side effects + broadcast.
 *  Pass `sender` from the IPC event so the originating window doesn't echo
 *  its own write. Pass `null` when the write didn't originate from a window
 *  (e.g. main-side migrations). */
export function applySetting<K extends keyof AppSettings>(
  store: Store<AppSettings>,
  key: K,
  value: AppSettings[K],
  sender: WebContents | null,
): void {
  const previous = capturePreviousSettings(store)
  let changes: ProfileChangedSetting[]

  if (key === ACTIVE_PROFILE_ID_KEY && value) {
    changes = switchActiveProfileById(store, value)
  } else if (key === PROFILE_VERSION_KEY) {
    changes = switchActiveProfileByGameVariant(store, value)
  } else {
    store.set(key, value)
    changes = [{ key, value }]
  }

  if (key === ACTIVE_PROFILE_ID_KEY && changes.length === 0) {
    changes = hydrateActiveProfileSettings(store)
  }

  applyProfileHydrationSideEffects(changes, previous)
  broadcastSettingUpdates(sender, changes)
}

/** Write a profile-backed setting to the active profile, dispatch side
 *  effects, and broadcast changes to windows. Used when the write originates
 *  from a main-process handler (e.g. file picker, cheat sheet overlay). */
export function applyProfileBackedSetting<K extends ProfileBackedKey>(
  store: Store<AppSettings>,
  key: K,
  value: Parameters<typeof writeActiveProfileSetting<K>>[2],
  sender: WebContents | null,
  loadFilterFn?: (path: string) => void,
  updateOnlineSyncDirFn?: (dir: string) => void,
): void {
  const previous = getEffectiveSettings(store)
  const changes = writeActiveProfileSetting(store, key, value)

  if (key === 'filterPath' && loadFilterFn) {
    if (value) loadFilterFn(value)
  }
  if (key === 'filterDir' && updateOnlineSyncDirFn) {
    updateOnlineSyncDirFn(value)
  }
  if (key === 'league') {
    refreshPrices(value)
  }

  applyProfileHydrationSideEffects(changes, previous)
  broadcastSettingUpdates(sender, changes)
}
