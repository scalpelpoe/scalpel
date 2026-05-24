import { app, type BrowserWindow, clipboard, ipcMain, Tray, Menu, nativeImage, powerMonitor, screen } from 'electron'
import {
  createAndOpenBugReport,
  installEarlyDiagnostics,
  recordMainDiagnostic,
  registerDiagnostics,
} from './diagnostics'

// Prevent unhandled JS exceptions from crashing the native overlay thread
// electron-overlay-window's tsfn_to_js_proxy calls napi_fatal_error if napi_call_function
// returns non-ok, which happens when there's a pending exception on the JS isolate
installEarlyDiagnostics()

import { dirname, join } from 'node:path'
import { execSync } from 'node:child_process'
import { uIOhook, UiohookKey } from 'uiohook-napi'
import Store from 'electron-store'
import {
  createOverlayWindow,
  hideOverlay,
  showOverlay,
  getOverlayWindow,
  setCloseOnClickOutside,
  setGameFocusHandlers,
  setWindowInputFocused,
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
import { refreshLeagues } from './trade/leagues'
import { requestGameSwitch } from './game-switch'
import { startOnlineSync, stopOnlineSync } from './online-sync'
import { initUpdater } from './update/updater'
import { applyPendingUpdate } from './update/update-swap'
import { loadFilter } from './filter-state'
import { createHotkeyHandler, createPriceCheckHandler, setOpenSide, setEvaluationStore } from './evaluation'
import { snapshotClipboard } from './clipboard-preserve'
import * as tradeHandlers from './handlers/trade'
import * as settingsHandlers from './handlers/settings'
import * as filesHandlers from './handlers/files'
import * as editingHandlers from './handlers/editing'
import * as versionsHandlers from './handlers/versions'
import * as onlineSyncHandlers from './handlers/online-sync'
import * as pricesHandlers from './handlers/prices'
import { register as registerCheatSheets } from './handlers/cheat-sheets'
import { register as registerWhiteboard } from './handlers/whiteboard'
import { register as registerClipboard } from './handlers/clipboard'
import { register as registerManifest } from './handlers/manifest'
import { register as registerPlugins } from './handlers/plugins'
import { flushAll as flushPluginStorage } from './plugins/storage'
import { refreshManifest } from './manifest'
import { registerCheatSheetProtocol } from './cheat-sheet-protocol'
import { registerScalpelInternalProtocol, registerScalpelInternalSchemePrivileges } from './plugins/protocol'
import { registerScalpelPluginProtocol, registerScalpelPluginSchemePrivileges } from './plugins/plugin-protocol'
import {
  registerCheatSheetsOverlay,
  applyCheatSheetHotkeys,
  setCheatSheetsBeforeShow,
  getCheatSheetsOverlay,
} from './cheat-sheets'
import { registerWhiteboardOverlay, toggleWhiteboard } from './whiteboard'
import { registerPinnedZoneOverlay, applyPinnedZoneEnabled } from './pinned-zone'
import {
  hideAllOnPoeBlur,
  restoreAllOnPoeFocus,
  isAnyScalpelWindowFocused,
  setMainOverlayGetter,
  setOnLeaveScalpel,
  subscribeToPoeMoves,
} from './windowing'
import { initAppMacrosRefresh, withPluginHotkeys } from './app-macros'
import type { AppSettings, CheatSheetsSettings, RegexPreset } from '../shared/types'

// ---- Linux display-server setup --------------------------------------------

// Electron defaults to the Wayland Ozone backend on Wayland sessions, but
// Scalpel's overlay attach (electron-overlay-window) and global input hook
// (uiohook-napi) are X11-only. Relaunch under XWayland so they work at all,
// mirroring awakened-poe-trade. Skip when a platform was already forced.
if (
  process.platform === 'linux' &&
  process.env.WAYLAND_DISPLAY &&
  !process.argv.some((a) => a.startsWith('--ozone-platform='))
) {
  app.relaunch({ args: [...process.argv.slice(1), '--ozone-platform=x11'] })
  app.exit(0)
}

// Compositor GPU acceleration breaks the transparent click-through overlay on
// Linux (renders black instead of transparent). Disable it there only --
// Windows keeps hardware acceleration untouched.
if (process.platform === 'linux') {
  app.disableHardwareAcceleration()
}

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
    filterPathPoe1: '',
    filterPathPoe2: '',
    filterDirPoe1: '',
    filterDirPoe2: '',
    league: 'Mirage',
    leaguePoe1: 'Mirage',
    leaguePoe2: 'Fate of the Vaal',
    hotkey: 'CommandOrControl+Shift+D',
    priceCheckHotkey: 'CommandOrControl+Shift+A',
    overlayOpacity: 0.95,
    overlayScale: 1,
    openSide: 'both',
    closeOnClickOutside: false,
    useCurrentZoneAreaLevel: false,
    reloadOnSave: true,
    updateChannel: 'stable',
    tradeStatus: 'available',
    tradeCollapseListings: true,
    previewVolume: 0.25,
    tradePriceOption: 'chaos_divine',
    tradePriceOptionPoe1: 'chaos_divine',
    tradePriceOptionPoe2: 'exalted_divine',
    priceCheckDefaultPercent: 90,
    tradeDefaultToBase: false,
    chatCommands: [],
    appMacros: [],
    cheatSheets: { globalHotkey: '', categories: [], pinned: false },
    cheatSheetsPoe1: { globalHotkey: '', categories: [], pinned: false },
    cheatSheetsPoe2: { globalHotkey: '', categories: [], pinned: false },
    stashScrollEnabled: false,
    poeVersion: 1,
    regexPresetsPoe1: [],
    regexPresetsPoe2: [],
    leaguesPoe1: [],
    leaguesPoe2: [],
    developerMode: false,
    themeId: 'default',
    customThemePalette: null,
    pluginRegistryUrl: undefined,
  },
})

// Backfill defaults for keys added after initial release
if (store.get('reloadOnSave') === undefined) store.set('reloadOnSave', true)
if (store.get('useCurrentZoneAreaLevel') === undefined) store.set('useCurrentZoneAreaLevel', false)
if (store.get('stashScrollEnabled') === undefined) store.set('stashScrollEnabled', false)
if (store.get('openSide') === undefined) store.set('openSide', 'both')
if ((store.get('tradeStatus') as string) === 'any') store.set('tradeStatus', 'available')
if (store.get('themeId') === undefined) store.set('themeId', 'default')
if (store.get('customThemePalette') === undefined) store.set('customThemePalette', null)

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
  store.set('filterDir', dirname(store.get('filterPath')))
} else if (!store.get('filterDir')) {
  store.set('filterDir', '')
}

// Migrate: seed per-version fields from the pre-existing flat values. Before this
// change everyone had a single league/filter/price-option -- treat that as their
// PoE1 setup. Guarded by empty-check so we only migrate once.
if (!store.get('leaguePoe1')) store.set('leaguePoe1', store.get('league'))
if (!store.get('filterPathPoe1')) store.set('filterPathPoe1', store.get('filterPath'))
if (!store.get('filterDirPoe1')) store.set('filterDirPoe1', store.get('filterDir'))
if (!store.get('tradePriceOptionPoe1')) store.set('tradePriceOptionPoe1', store.get('tradePriceOption'))

// Migrate: regex presets used to be a single flat `regexPresets` array. Now
// they're per-version. Existing users only ever ran PoE1 (regex tool was off
// for PoE2), so seed the PoE1 slot with whatever's in the legacy key.
{
  const legacyStore = store as Store<AppSettings & { regexPresets?: RegexPreset[] }>
  const legacy = legacyStore.get('regexPresets')
  const poe1Empty = (store.get('regexPresetsPoe1') ?? []).length === 0
  if (legacy && legacy.length > 0 && poe1Empty) store.set('regexPresetsPoe1', legacy)
}

// On startup, sync the flat active fields to match whichever version is current.
// The relaunch-on-game-switch flow (ensureCorrectGameForHotkey) means this runs
// with the right version after the user confirms a switch in the modal. Writes
// from the settings UI mirror in the other direction -- see handlers/settings.ts.
{
  const suffix: 'Poe1' | 'Poe2' = store.get('poeVersion') === 2 ? 'Poe2' : 'Poe1'
  store.set('league', store.get(`league${suffix}`))
  store.set('filterPath', store.get(`filterPath${suffix}`))
  store.set('filterDir', store.get(`filterDir${suffix}`))
  store.set('tradePriceOption', store.get(`tradePriceOption${suffix}`))
  store.set('cheatSheets', store.get(`cheatSheets${suffix}`))
}

// Fire-and-forget league refresh on launch. Updates persist + auto-migrate the
// user's selected league if their old challenge league rotated out. Deferred
// until app-ready since electron's net.request requires it. `force: true`
// bypasses the cooldown gate so a long-running app picks up new leagues each
// time it's relaunched.
app.whenReady().then(() => {
  refreshLeagues(store, undefined, { force: true }).catch((err) =>
    console.error('[leagues] launch refresh failed:', err),
  )
})

setEvaluationStore(store)
initAppMacrosRefresh(() => store.get('appMacros') ?? [])

// ---- Register IPC handlers -------------------------------------------------

tradeHandlers.register(store)
settingsHandlers.register(store)
filesHandlers.register(store)
editingHandlers.register(store)
versionsHandlers.register(store)
onlineSyncHandlers.register(store)
pricesHandlers.register(store)
registerCheatSheets()
registerWhiteboard()
registerClipboard()
registerManifest()
registerPlugins(store, isElevated)
registerDiagnostics({ store, getAppWindow, showAppWindow })

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

  const current = store.get('poeVersion') === 2 ? 2 : 1
  const other: 1 | 2 = current === 1 ? 2 : 1

  const contextMenu = Menu.buildFromTemplate([
    { label: `Current Game: PoE${current}`, enabled: false },
    {
      label: `Switch to PoE${other}`,
      click: () => {
        // requestGameSwitch shows the app window and sends the prompt; the
        // renderer's GameSwitchModal handles the user's response.
        requestGameSwitch(store, other)
      },
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => showAppWindow(),
    },
    {
      label: 'Report a Bug',
      click: () => {
        createAndOpenBugReport().catch((err) => recordMainDiagnostic('bug-report', err))
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ])
  tray.setContextMenu(contextMenu)

  // Left-click opens app window
  tray.on('click', () => showAppWindow())
}

// Must run before app is ready -- registers scheme privileges with Chromium
registerScalpelInternalSchemePrivileges()
registerScalpelPluginSchemePrivileges()

// ---- App lifecycle ---------------------------------------------------------

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showAppWindow())
}

const installDir = applyPendingUpdate()

app.whenReady().then(() => {
  // Seed the overlay with the last-known game version so attachByTitle waits for
  // that window. The hotkey handler re-detects the focused PoE on every fire and
  // relaunches to swap versions if needed (ensureCorrectGameForHotkey).
  createOverlayWindow(store.get('poeVersion') ?? 1)
  // Let the secondary-overlay system know about the main overlay window so its
  // isAnyScalpelWindowFocused predicate can include it.
  setMainOverlayGetter(getOverlayWindow)
  // When focus leaves Scalpel via the PoE -> overlay -> other-app path
  // (which the PoE-blur handler can't catch), suspend hotkeys so they don't
  // fire in the destination app.
  setOnLeaveScalpel(() => suspendHotkeys())
  createAppWindow()
  createTray()

  // Serve plugin-facing built-in modules (React, SDK) via a custom scheme so
  // plugins can import them without bundling their own copies.
  registerScalpelInternalProtocol()

  // Serve installed plugin entry files via a custom scheme. Required so the
  // overlay renderer can dynamic-import() them in dev (where the renderer
  // lives on http://localhost and Chromium blocks file:// resource loads).
  registerScalpelPluginProtocol()

  registerCheatSheetProtocol()

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
    const restoreClip = snapshotClipboard()
    clipboard.writeText(regex)
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
      const key = store.get('poeVersion') === 2 ? 'regexPresetsPoe2' : 'regexPresetsPoe1'
      const presets = store.get(key) ?? []
      const preset = presets.find((p) => p.tags?.some((t) => t.text === tag && (!t.source || t.source === 'custom')))
      if (preset?.regex) pasteRegexToSearch(preset.regex)
      return
    }
    if (action === 'closeOverlay') {
      hideOverlay()
      return
    }
    if (action === 'toggleWhiteboard') {
      const main = getOverlayWindow()
      if (main && !main.isDestroyed() && main.isVisible()) hideOverlay()
      getCheatSheetsOverlay()?.hide()
      toggleWhiteboard()
      return
    }
    if (action.startsWith('plugin:')) {
      const overlayWin = getOverlayWindow()
      if (!overlayWin || overlayWin.isDestroyed()) return
      overlayWin.webContents.send('plugin-macro', action)
      return
    }
    const overlayWin = getOverlayWindow()
    if (!overlayWin || overlayWin.isDestroyed()) return
    if (action === 'openAudit') {
      onHotkeyFired()
      overlayWin.webContents.send('open-view', 'audit')
    } else if (action === 'openWiki' || action === 'openPoeDb') {
      onHotkeyFired()
      const target = action === 'openWiki' ? 'wiki' : 'poedb'
      overlayWin.webContents.send('open-link-pending', target)
    } else {
      const view = APP_MACRO_VIEWS[action] ?? 'setup'
      overlayWin.webContents.send('open-view', view)
      showOverlay()
    }
  })
  setAppMacros(withPluginHotkeys((store.get('appMacros') as AppSettings['appMacros']) ?? []))
  // Register the cheat-sheets overlay with the secondary-overlay system. The
  // anchor persists into settings.cheatSheets.windowAnchor; the system handles
  // window lifecycle, snap, alt-tab guard, etc. and the wireCheatSheetHotkeys
  // helper below feeds the global + per-category hotkeys into the shared system.
  // Persist a partial cheatSheets update from a main-side callback (anchor
  // drag, etc.). Mirrors the flat write to the active game's per-version slot
  // so the user's change survives a game switch. The IPC settings path
  // (set-setting -> applySetting) does this via MIRROR_KEYS for renderer-
  // initiated writes; this is the parallel path for main-initiated ones.
  const patchCheatSheets = (patch: Partial<CheatSheetsSettings>): void => {
    const cs = store.get('cheatSheets') ?? { globalHotkey: '', categories: [], pinned: false }
    const next: CheatSheetsSettings = { ...cs, ...patch }
    store.set('cheatSheets', next)
    const v = store.get('poeVersion')
    store.set(v === 2 ? 'cheatSheetsPoe2' : 'cheatSheetsPoe1', next)
  }
  registerCheatSheetsOverlay({
    storedAnchor: () => store.get('cheatSheets')?.windowAnchor,
    onAnchorChanged: (anchor) => patchCheatSheets({ windowAnchor: anchor }),
  })
  // Hide the main overlay before showing the cheat sheet (keeps things tidy if
  // the user hotkeys the cheat sheet while the main overlay was open).
  setCheatSheetsBeforeShow(() => hideOverlay())
  applyCheatSheetHotkeys(store.get('cheatSheets'))
  registerWhiteboardOverlay()
  registerPinnedZoneOverlay({
    storedAnchor: () => store.get('cheatSheets')?.pinnedAnchor,
    onAnchorChanged: (anchor) => patchCheatSheets({ pinnedAnchor: anchor }),
  })
  applyPinnedZoneEnabled(store.get('cheatSheets')?.pinned === true)
  subscribeToPoeMoves()
  setStashScrollEnabled(store.get('stashScrollEnabled') ?? false)
  setOpenSide(store.get('openSide') ?? 'both')

  // Suspend/resume hotkeys while the hotkey recorder is active
  ipcMain.on('suspend-hotkeys', () => suspendHotkeys())
  ipcMain.on('resume-hotkeys', () => resumeHotkeys())

  // Renderer pushes whether an editable element inside the overlay has focus.
  // Suspend globalShortcut while typing so the keystroke reaches the input
  // (otherwise registered single-key hotkeys consume the key OS-side and the
  // text field never sees it). The flag also lets uIOhook-routed hotkeys gate
  // themselves via isTypingInOverlay() since uIOhook isn't suspended.
  ipcMain.on('overlay-input-focused', (e, focused: boolean) => {
    setWindowInputFocused(e.sender.id, focused)
    if (focused) suspendHotkeys()
    else resumeHotkeys()
  })

  // Apply close-on-click-outside setting
  setCloseOnClickOutside(store.get('closeOnClickOutside'))
  setGameFocusHandlers(
    () => {
      resumeHotkeys()
      restoreAllOnPoeFocus()
    },
    () => {
      // PoE blurred. If focus moved to any Scalpel window (main or secondary),
      // it's an in-app interaction - keep hotkeys armed and leave overlays up.
      // Only treat it as "user left the app" when focus is somewhere else.
      if (isAnyScalpelWindowFocused()) return
      suspendHotkeys()
      hideAllOnPoeBlur()
    },
  )

  // Start with hotkeys suspended until PoE actually gains focus.
  // Without this, hotkeys fire globally (e.g. in other games) before PoE opens.
  suspendHotkeys()

  // Fetch manifest in background; bundled copy is the offline fallback
  refreshManifest().catch(() => {})

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

  // Wire the updater unconditionally so broadcasts (update-available, update-rescinded)
  // can fire in dev for fake-update testing. The periodic GitHub check and destructive
  // install actions internally bail when ELECTRON_RENDERER_URL is set so a dev session
  // doesn't overwrite source with a packaged ASAR.
  const overlayWin = getOverlayWindow()
  if (overlayWin)
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

app.on('before-quit', () => {
  try {
    flushPluginStorage()
  } catch {
    // best-effort
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
