import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, powerMonitor, screen } from 'electron'

// Prevent unhandled JS exceptions from crashing the native overlay thread
// electron-overlay-window's tsfn_to_js_proxy calls napi_fatal_error if napi_call_function
// returns non-ok, which happens when there's a pending exception on the JS isolate
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT]', err)
})
process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]', err)
})

import { existsSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import Store from 'electron-store'
import {
  createOverlayWindow,
  hideOverlay,
  showOverlay,
  getOverlayWindow,
  setCloseOnClickOutside,
  setGameFocusHandlers,
} from './overlay'
import { createAppWindow, showAppWindow, getAppWindow } from './app-window'
import {
  startHotkeyListener,
  setHotkey,
  setPriceCheckHotkey,
  setPriceCheckHandler,
  setEscapeHandler,
  stopHotkeyListener,
  setChatCommands,
  setAppMacros,
  setAppMacroHandler,
  suspendHotkeys,
  resumeHotkeys,
  setStashScrollEnabled,
} from './hotkeys'
import { refreshPrices, invalidatePriceCache } from './trade/prices'
import { onRateLimitUpdate } from './trade/trade'
import { startOnlineSync, stopOnlineSync } from './online-sync'
import { initUpdater } from './update/updater'
import { applyPendingUpdate } from './update/update-swap'
import { loadFilter } from './filter-state'
import { createHotkeyHandler, createPriceCheckHandler, setOpenSide } from './evaluation'
import { snapshotClipboard } from './clipboard-preserve'
import * as tradeHandlers from './handlers/trade'
import * as settingsHandlers from './handlers/settings'
import * as filesHandlers from './handlers/files'
import * as editingHandlers from './handlers/editing'
import * as versionsHandlers from './handlers/versions'
import * as onlineSyncHandlers from './handlers/online-sync'
import * as pricesHandlers from './handlers/prices'
import type { AppSettings } from '../shared/types'

// ---- Elevation detection ---------------------------------------------------

function isElevated(): boolean {
  try {
    execSync('net session', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// ---- Persistent settings ---------------------------------------------------

const store = new Store<AppSettings>({
  defaults: {
    filterPath: '',
    filterDir: '',
    hotkey: 'CommandOrControl+Shift+D',
    priceCheckHotkey: 'CommandOrControl+Shift+A',
    overlayOpacity: 0.95,
    overlayScale: 1,
    openSide: 'both',
    closeOnClickOutside: false,
    league: 'Mirage',
    reloadOnSave: true,
    updateChannel: 'stable',
    tradeStatus: 'any',
    tradePriceOption: 'chaos_divine',
    priceCheckDefaultPercent: 90,
    tradeDefaultToBase: false,
    chatCommands: [],
    appMacros: [],
    stashScrollEnabled: false,
    poeVersion: 1,
    regexPresets: [],
  },
})

// Backfill defaults for keys added after initial release
if (store.get('reloadOnSave') === undefined) store.set('reloadOnSave', true)
if (store.get('stashScrollEnabled') === undefined) store.set('stashScrollEnabled', false)
if (store.get('openSide') === undefined) store.set('openSide', 'both')
// Migrate legacy tradeStatus 'available' -> 'any' (renamed to match chip-row options)
if ((store.get('tradeStatus') as string) === 'available') store.set('tradeStatus', 'any')
// Force poeVersion to 1 -- previous test builds defaulted to 2
store.set('poeVersion', 1)

// Auto-detect overlay scale on first run (deferred until app ready since screen API requires it)
app.whenReady().then(() => {
  if (store.get('overlayScale') === 1 && !store.get('overlayScaleSet' as keyof AppSettings)) {
    const height = screen.getPrimaryDisplay().workAreaSize.height
    if (height >= 2160)
      store.set('overlayScale', 2) // 4K
    else if (height >= 1440) store.set('overlayScale', 1.5) // 1440p
    // 1080p and below stays at 1
    store.set('overlayScaleSet' as keyof AppSettings, true)
  }
})

// Migrate: derive filterDir from existing filterPath for users upgrading
if (!store.get('filterDir') && store.get('filterPath')) {
  const { dirname } = require('path')
  store.set('filterDir', dirname(store.get('filterPath')))
} else if (!store.get('filterDir')) {
  store.set('filterDir', '')
}

// ---- Register IPC handlers -------------------------------------------------

tradeHandlers.register(store)
settingsHandlers.register(store)
filesHandlers.register(store)
editingHandlers.register(store)
versionsHandlers.register(store)
onlineSyncHandlers.register(store)
pricesHandlers.register(store)

ipcMain.on('close-overlay', () => hideOverlay())
ipcMain.on('open-devtools', (event) => {
  // Only open devtools on the app window (overlay devtools breaks the transparent overlay)
  const app = getAppWindow()
  if (app && !app.isDestroyed()) {
    app.webContents.openDevTools({ mode: 'detach' })
  } else {
    event.sender.openDevTools({ mode: 'detach' })
  }
})

// ---- System tray -----------------------------------------------------------

let tray: Tray | null = null

function getAppIcon(): Electron.NativeImage {
  // In packaged app, resources/ is at process.resourcesPath; in dev, it's at project root
  const iconExt = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  const devPath = join(__dirname, '../../resources', iconExt)
  const prodPath = join(process.resourcesPath, iconExt)
  const iconPath = app.isPackaged ? prodPath : devPath
  return nativeImage.createFromPath(iconPath)
}

function createTray(): void {
  const icon = getAppIcon()
  tray = new Tray(icon)
  tray.setToolTip('Scalpel')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Settings',
      click: () => showAppWindow(),
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ])
  tray.setContextMenu(contextMenu)

  // Left-click opens app window
  tray.on('click', () => showAppWindow())
}

// ---- App lifecycle ---------------------------------------------------------

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showAppWindow())
}

const installDir = applyPendingUpdate()

app.whenReady().then(() => {
  createOverlayWindow(store.get('poeVersion') ?? 2)
  createAppWindow()
  createTray()

  // Broadcast rate limit state to overlay
  onRateLimitUpdate((state) => {
    getOverlayWindow()?.webContents.send('rate-limit', state)
  })

  const filterPath = store.get('filterPath')
  if (filterPath) loadFilter(filterPath, 'App Launch')

  // Start low-level keyboard hook
  const onHotkeyFired = createHotkeyHandler(store, isElevated)
  const onPriceCheckFired = createPriceCheckHandler(store, isElevated)
  const hotkey = store.get('hotkey')
  startHotkeyListener(onHotkeyFired)
  setHotkey(hotkey)
  setPriceCheckHandler(onPriceCheckFired)
  setPriceCheckHotkey(store.get('priceCheckHotkey'))
  setEscapeHandler(() => hideOverlay())
  setChatCommands(store.get('chatCommands') ?? [])
  let currentRegex = ''
  ipcMain.on('report-regex', (_event, regex: string) => {
    currentRegex = regex
  })
  const APP_MACRO_VIEWS: Record<string, string> = {
    openSettings: 'setup',
    openDust: 'dust',
    openDivCards: 'divcards',
    openRegex: 'regex',
  }
  const pasteRegexToSearch = (regex: string): void => {
    const { clipboard } = require('electron') as typeof import('electron')
    const restoreClip = snapshotClipboard()
    clipboard.writeText(regex)
    const { uIOhook, UiohookKey } = require('uiohook-napi') as typeof import('uiohook-napi')
    // Open search box first (Ctrl+F)
    uIOhook.keyToggle(UiohookKey.Ctrl, 'down')
    uIOhook.keyTap(UiohookKey.F)
    uIOhook.keyToggle(UiohookKey.Ctrl, 'up')
    // Paste the regex
    uIOhook.keyToggle(UiohookKey.Ctrl, 'down')
    uIOhook.keyTap(UiohookKey.V)
    uIOhook.keyToggle(UiohookKey.Ctrl, 'up')
    // Restore the user's previous clipboard after PoE consumes the paste
    setTimeout(restoreClip, 100)
  }

  setAppMacroHandler((action, tag) => {
    if (action === 'pasteRegex') {
      if (currentRegex) pasteRegexToSearch(currentRegex)
      return
    }
    if (action === 'useSavedRegex') {
      if (!tag) return
      const presets = (store.get('regexPresets') as import('../shared/types').RegexPreset[] | undefined) ?? []
      const preset = presets.find((p) => p.tags?.some((t) => t.text === tag && (!t.source || t.source === 'custom')))
      if (preset?.regex) pasteRegexToSearch(preset.regex)
      return
    }
    if (action === 'closeOverlay') {
      hideOverlay()
      return
    }
    const overlayWin = getOverlayWindow()
    if (!overlayWin || overlayWin.isDestroyed()) return
    if (action === 'openAudit') {
      onHotkeyFired()
      overlayWin.webContents.send('open-view', 'audit')
    } else {
      const view = APP_MACRO_VIEWS[action] ?? 'setup'
      overlayWin.webContents.send('open-view', view)
      showOverlay()
    }
  })
  setAppMacros(store.get('appMacros') ?? [])
  setStashScrollEnabled(store.get('stashScrollEnabled') ?? false)
  setOpenSide(store.get('openSide') ?? 'both')

  // Suspend/resume hotkeys while the hotkey recorder is active
  ipcMain.on('suspend-hotkeys', () => suspendHotkeys())
  ipcMain.on('resume-hotkeys', () => resumeHotkeys())

  // Apply close-on-click-outside setting
  setCloseOnClickOutside(store.get('closeOnClickOutside'))
  setGameFocusHandlers(
    () => resumeHotkeys(),
    () => suspendHotkeys(),
  )

  // Start with hotkeys suspended until PoE actually gains focus.
  // Without this, hotkeys fire globally (e.g. in other games) before PoE opens.
  suspendHotkeys()

  // Fetch prices in background, refresh every 10 minutes
  refreshPrices(store.get('league'))
  setInterval(() => refreshPrices(store.get('league')), 10 * 60 * 1000)

  // After the OS wakes from sleep, Electron's network stack often bails on pending
  // requests with ERR_NETWORK_IO_SUSPENDED. Invalidate the price cache and re-fetch so
  // we don't sit on stale/empty prices for up to 10 minutes.
  powerMonitor.on('resume', () => {
    invalidatePriceCache()
    refreshPrices(store.get('league'))
  })

  // Auto-update check (skip in dev mode to avoid overwriting source with packaged ASAR)
  const overlayWin = getOverlayWindow()
  if (overlayWin && !process.env['ELECTRON_RENDERER_URL'])
    initUpdater([getOverlayWindow, getAppWindow], installDir, store.get('updateChannel'), () => showOverlay())

  if (process.env.NODE_ENV === 'development') {
    const ow = getOverlayWindow()
    ow?.webContents.openDevTools({ mode: 'detach' })
    ow?.webContents.on('context-menu', (_e, params) => {
      ow.webContents.inspectElement(params.x, params.y)
    })
  }

  // Start online filter sync
  const filterDir = store.get('filterDir')
  if (filterDir) {
    startOnlineSync(filterDir, () => {
      const wins: BrowserWindow[] = []
      const ow = getOverlayWindow()
      const aw = getAppWindow()
      if (ow) wins.push(ow)
      if (aw) wins.push(aw)
      return wins
    })
  }

  // Show onboarding on first launch, otherwise stay in tray
  if (!filterPath) {
    showAppWindow()
  }
})

app.on('will-quit', () => {
  stopHotkeyListener()
  stopOnlineSync()
})

// Keep app alive even with no windows (overlay hides, not closes)
app.on('window-all-closed', () => {
  /* intentional - overlay is hidden, not destroyed */
})
