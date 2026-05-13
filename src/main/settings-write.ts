/** Single source of truth for "what happens when a setting is written":
 *  per-version mirror, side effects, and broadcast to other windows.
 *
 *  The set-setting IPC handler is the canonical caller, but we also write
 *  filterPath/filterDir from the file-pick handlers and broadcast league
 *  changes after refreshLeagues -- everyone goes through here so the mirror
 *  table and broadcast targets stay in lockstep. */

import type { WebContents } from 'electron'
import Store from 'electron-store'
import { loadFilter } from './filter-state'
import { getOverlayWindow, setCloseOnClickOutside } from './overlay'
import { getAppWindow } from './app-window'
import { applyCheatSheetHotkeys, getCheatSheetsOverlay } from './cheat-sheets'
import { applyPinnedZoneEnabled, getPinnedZoneOverlay } from './pinned-zone'
import { setHotkey, setPriceCheckHotkey, setChatCommands, setAppMacros, setStashScrollEnabled } from './hotkeys'
import { withPluginHotkeys } from './app-macros'
import { setOpenSide, reEvaluateLastItem } from './evaluation'
import { refreshPrices } from './trade/prices'
import { setUpdateChannel } from './update/updater'
import type { AppSettings } from '../shared/types'

/** Flat active key -> per-version mirror keys (PoE1, PoE2). When a flat key is
 *  written we also write to the mirror entry matching the current `poeVersion`,
 *  so consumers can keep reading the flat field while the per-version data
 *  stays current for the eventual game switch. */
const MIRROR_KEYS = {
  league: ['leaguePoe1', 'leaguePoe2'],
  filterPath: ['filterPathPoe1', 'filterPathPoe2'],
  filterDir: ['filterDirPoe1', 'filterDirPoe2'],
  tradePriceOption: ['tradePriceOptionPoe1', 'tradePriceOptionPoe2'],
  cheatSheets: ['cheatSheetsPoe1', 'cheatSheetsPoe2'],
} as const satisfies Partial<Record<keyof AppSettings, readonly [keyof AppSettings, keyof AppSettings]>>

/** Send `setting-updated` to every window except the sender. */
export function broadcastSettingUpdate(sender: WebContents | null, key: keyof AppSettings, value: unknown): void {
  const csWin = getCheatSheetsOverlay()?.getWindow() ?? null
  const pinnedWin = getPinnedZoneOverlay()?.getWindow() ?? null
  for (const win of [getOverlayWindow(), getAppWindow(), csWin, pinnedWin]) {
    if (win && win.webContents !== sender) {
      win.webContents.send('setting-updated', key, value)
    }
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
  const prev = store.get(key)
  store.set(key, value)
  const mirror = MIRROR_KEYS[key as keyof typeof MIRROR_KEYS]
  if (mirror) {
    const v = store.get('poeVersion')
    store.set(mirror[v === 2 ? 1 : 0], value as AppSettings[(typeof mirror)[number]])
  }
  if (key === 'filterPath' && value !== prev) loadFilter(value as string, 'Switched Filters')
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

  broadcastSettingUpdate(sender, key, value)
}
