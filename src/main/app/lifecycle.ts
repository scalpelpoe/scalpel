/**
 * App lifecycle hooks and live services.
 *
 * Live services require network, native access, and window handles, so they
 * start after app.whenReady(). This module wires run-time background tasks:
 * game-focus handlers, price refreshers, the updater, online filter sync, and
 * dev-tool setup. It also registers the quit-sequence hooks.
 */

import { type BrowserWindow, powerMonitor } from 'electron'
import type Store from 'electron-store'
import type { AppSettings, GameVariant } from '../../shared/types'
import { refreshPrices, invalidatePriceCache } from '../trade/prices'
import { onRateLimitUpdate } from '../trade/trade'
import { startOnlineSync } from '../online-sync'
import { initUpdater } from '../update/updater'
import { getOverlayWindow, showOverlay, setGameFocusHandlers } from '../overlay'
import { getAppWindow } from '../app-window'
import { resumeHotkeys, suspendHotkeys } from '../hotkeys'
import { hideAllOnPoeBlur, restoreAllOnPoeFocus, isAnyScalpelWindowFocused } from '../windowing'
import { refreshManifest } from '../manifest'
import { getProfileBackedSetting } from '../profiles/profile-settings'

export interface LiveServicesDeps {
  store: Store<AppSettings>
  installDir: string
}

export function startLiveServices(deps: LiveServicesDeps): void {
  const { store } = deps

  setGameFocusHandlers(
    () => {
      resumeHotkeys()
      restoreAllOnPoeFocus()
    },
    () => {
      if (isAnyScalpelWindowFocused()) return
      suspendHotkeys()
      hideAllOnPoeBlur()
    },
  )

  suspendHotkeys()

  refreshManifest().catch(() => {})

  refreshPrices(getProfileBackedSetting(store, 'league'))
  setInterval(() => refreshPrices(getProfileBackedSetting(store, 'league')), 10 * 60 * 1000)

  powerMonitor.on('resume', () => {
    invalidatePriceCache()
    refreshPrices(getProfileBackedSetting(store, 'league'))
  })

  const overlayWin = getOverlayWindow()
  if (overlayWin)
    initUpdater([getOverlayWindow, getAppWindow], deps.installDir, store.get('updateChannel'), () => showOverlay())

  if (process.env.NODE_ENV === 'development') {
    const ow = getOverlayWindow()
    ow?.webContents.openDevTools({ mode: 'detach' })
    ow?.webContents.on('context-menu', (_e, params) => {
      ow.webContents.inspectElement(params.x, params.y)
    })
  }

  const filterDir = getProfileBackedSetting(store, 'filterDir') as string
  startOnlineSync(filterDir, () => {
    const wins: BrowserWindow[] = []
    const ow = getOverlayWindow()
    const aw = getAppWindow()
    if (ow) wins.push(ow)
    if (aw) wins.push(aw)
    return wins
  })

  // Broadcast rate limit state to overlay
  onRateLimitUpdate((state) => {
    getOverlayWindow()?.webContents.send('rate-limit', state)
  })
}

// App lifecycle hooks (window-all-closed, etc.) remain in index.ts as they are
// simple one-liners that serve as documentation of runtime intent.
