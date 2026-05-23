/** Single source of truth for "what happens when a setting is written":
 *  per-version mirror, side effects, and broadcast to other windows.
 *
 *  The set-setting IPC handler is the canonical caller, but we also write
 *  filterPath/filterDir from the file-pick handlers and broadcast league
 *  changes after refreshLeagues -- everyone goes through here so the mirror
 *  table and broadcast targets stay in lockstep. */

import type { WebContents } from 'electron'
import Store from 'electron-store'
import { clearFilterState, loadFilter } from './filter-state'
import { getOverlayWindow, setCloseOnClickOutside } from './overlay'
import type Store from 'electron-store'
import { withPluginHotkeys } from './app-macros'
import { getAppWindow } from './app-window'
import { applyCheatSheetHotkeys, getCheatSheetsOverlay } from './cheat-sheets'
import { reEvaluateLastItem, setOpenSide } from './evaluation'
import { loadFilter } from './filter-state'
import { setAppMacros, setChatCommands, setHotkey, setPriceCheckHotkey, setStashScrollEnabled } from './hotkeys'
import { getOverlayWindow, setCloseOnClickOutside } from './overlay'
import { applyPinnedZoneEnabled, getPinnedZoneOverlay } from './pinned-zone'
import { refreshPrices } from './trade/prices'
import { setUpdateChannel } from './update/updater'
import type { AppSettings, GameVariant } from '../shared/types'
import {
  hydrateActiveProfileSettings,
  isProfileBackedKey,
  switchActiveProfileByGameVariant,
  switchActiveProfileById,
  writeActiveProfileSetting,
  type ProfileChangedSetting,
} from './profile-settings'

/** Send `setting-updated` to every window except the sender. */
export function broadcastSettingUpdate(sender: WebContents | null, key: keyof AppSettings, value: unknown): void {
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

function sideEffect<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
  prev: AppSettings[K] | undefined,
): void {
  if (key === 'filterPath' && value !== prev) {
    const path = value as string
    if (path) loadFilter(path, 'Switched Filters')
    else clearFilterState()
  }
  if (key === 'hotkey') setHotkey(value as string)
  if (key === 'priceCheckHotkey') setPriceCheckHotkey(value as string)
  if (key === 'closeOnClickOutside') setCloseOnClickOutside(value as boolean)
  if (key === 'league') refreshPrices(value as string)
  if (key === 'chatCommands') setChatCommands(value as AppSettings['chatCommands'])
  if (key === 'appMacros') setAppMacros(withPluginHotkeys(value as AppSettings['appMacros']))
  if (key === 'stashScrollEnabled') setStashScrollEnabled(value as boolean)
  if (key === 'openSide') setOpenSide(value as AppSettings['openSide'])
  if (key === 'updateChannel') setUpdateChannel(value as string)
  if (key === 'useCurrentZoneAreaLevel' && value !== prev) reEvaluateLastItem()
  if (key === 'cheatSheets') {
    const next = value as AppSettings['cheatSheets']
    applyCheatSheetHotkeys(next)
    const prevCs = prev as AppSettings['cheatSheets'] | undefined
    if ((next?.pinned ?? false) !== (prevCs?.pinned ?? false)) {
      applyPinnedZoneEnabled(next?.pinned === true)
    }
  }
}

export function applyProfileHydrationSideEffects(
  changes: ProfileChangedSetting[],
  previous: Partial<AppSettings>,
): void {
  for (const { key, value } of changes) {
    sideEffect(key, value, previous[key])
  }
}

export function broadcastSettingUpdates(sender: WebContents | null, changes: ProfileChangedSetting[]): void {
  for (const { key, value } of changes) {
    broadcastSettingUpdate(sender, key, value)
  }
}

function capturePreviousSettings(store: Store<AppSettings>, key: keyof AppSettings): Partial<AppSettings> {
  return {
    [key]: store.get(key),
    filterPath: store.get('filterPath'),
    league: store.get('league'),
    cheatSheets: store.get('cheatSheets'),
  }
}

/** Persist a setting + mirror it + dispatch any side effects + broadcast.
 *  Pass `sender` from the IPC event so the originating window doesn't echo
 *  its own write. Pass `null` when the write didn't originate from a window
 *  (e.g. main-side migrations). */
export function applySetting<K extends keyof AppSettings>(
  store: Store<AppSettings>,
  key: K,
  value: AppSettings[K],
  sender: WebContents | null,
): void {
  const previous = capturePreviousSettings(store, key)
  let changes: ProfileChangedSetting[]

  if (key === 'activeProfileId' && value) {
    changes = switchActiveProfileById(store, value as string)
  } else if (key === 'poeVersion') {
    changes = switchActiveProfileByGameVariant(store, value as GameVariant)
  } else if (isProfileBackedKey(key)) {
    changes = writeActiveProfileSetting(store, key, value as AppSettings[typeof key])
  } else {
    store.set(key, value)
    changes = [{ key, value }]
  }

  if (key === 'activeProfileId' && changes.length === 0) {
    changes = hydrateActiveProfileSettings(store)
  }

  applyProfileHydrationSideEffects(changes, previous)
  broadcastSettingUpdates(sender, changes)
}
