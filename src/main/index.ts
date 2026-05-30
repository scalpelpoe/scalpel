import {
  app,
  type BrowserWindow,
  clipboard,
  crashReporter,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  powerMonitor,
  screen,
} from 'electron'
import {
  createAndOpenBugReport,
  installEarlyDiagnostics,
  recordMainBreadcrumb,
  recordMainDiagnostic,
  registerDiagnostics,
} from './diagnostics'

// Prevent unhandled JS exceptions from crashing the native overlay thread
// electron-overlay-window's tsfn_to_js_proxy calls napi_fatal_error if napi_call_function
// returns non-ok, which happens when there's a pending exception on the JS isolate.
// Note: this only covers exceptions Node routes to uncaughtException. A throw
// inside a uiohook/overlay-window event listener is dispatched from native code
// and does NOT reach here -- those listeners are wrapped with guardNativeListener.
// The e2e harness boots a gutted app (no overlay, hotkeys, tray, or network).
// Gate on !app.isPackaged so a shipped release ignores SCALPEL_E2E entirely and
// only the unpacked dev/CI binary the harness launches honors it.
const IS_E2E = process.env.SCALPEL_E2E === '1' && !app.isPackaged
if (IS_E2E && process.env.SCALPEL_E2E_USER_DATA) {
  app.setPath('userData', process.env.SCALPEL_E2E_USER_DATA)
}

installEarlyDiagnostics()

// Capture native aborts (the tsfn proxy calling napi_fatal_error, etc.) as local
// minidumps under userData/Crashpad. A C-level abort never reaches the JS
// uncaughtException handler, so this is the only trace it leaves on Windows.
crashReporter.start({ uploadToServer: false })

import { join } from 'node:path'
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
  setStashScrollModifier,
} from './hotkeys'
import { refreshPrices, invalidatePriceCache } from './trade/prices'
import { onRateLimitUpdate } from './trade/trade'
import { refreshLeagues } from './trade/leagues'
import { requestGameSwitch } from './game-switch'
import { startOnlineSync, stopOnlineSync } from './online-sync'
import { initUpdater } from './update/updater'
import { applyPendingUpdate } from './update/update-swap'
import { getCurrentFilter, loadFilter, onFilterLoaded } from './filter-state'
import {
  createHotkeyHandler,
  createPriceCheckHandler,
  reEvaluateLastItem,
  setOpenSide,
  setEvaluationStore,
} from './evaluation'
import { initLearning } from './learning'
import { snapshotClipboard } from './clipboard-preserve'
import * as tradeHandlers from './handlers/trade'
import * as settingsHandlers from './handlers/settings'
import * as learningHandlers from './handlers/learning'
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
import { registerClientLogHandlers } from './handlers/client-log'
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
import { togglePluginOverlay } from './plugin-overlay'
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
import { runRegexMacroMigration } from './regex-macro-migration'
import type { AppSettings, CheatSheetsSettings, GameVariant, LegacyAppSettings, RegexPreset } from '../shared/types'
import { initProfileStore } from './profiles/store'
import {
  ACTIVE_PROFILE_ID_KEY,
  LAST_PROFILE_ID_POE1_KEY,
  LAST_PROFILE_ID_POE2_KEY,
  PROFILE_VERSION_KEY,
  getProfileBackedSetting,
  hydrateActiveProfileSettings,
  writeActiveProfileSetting,
} from './profiles/profile-settings'

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
    hotkey: 'CommandOrControl+Shift+D',
    priceCheckHotkey: 'CommandOrControl+Shift+A',
    overlayOpacity: 0.95,
    overlayScale: 1,
    openSide: 'both',
    closeOnClickOutside: false,
    currencyLabelsAsText: false,
    useCurrentZoneAreaLevel: false,
    reloadOnSave: true,
    updateChannel: 'stable',
    tradeStatus: 'available',
    tradeCollapseListings: true,
    previewVolume: 0.25,
    priceCheckDefaultPercent: 90,
    adaptiveDefaultsMode: 'eager',
    tradeDefaultToBase: false,
    chatCommands: [],
    appMacros: [],
    stashScrollEnabled: false,
    stashScrollModifier: 'Ctrl',
    poeVersion: 1,
    regexPresetsPoe1: [],
    regexPresetsPoe2: [],
    leaguesPoe1: [],
    leaguesPoe2: [],
    developerMode: false,
    themeId: 'default',
    customThemePalette: null,
    pluginRegistryUrl: undefined,
    startInTray: true,
    appWindowPosition: undefined,
    [ACTIVE_PROFILE_ID_KEY]: '',
    [LAST_PROFILE_ID_POE1_KEY]: '',
    [LAST_PROFILE_ID_POE2_KEY]: '',
    onboardingCompleted: false,
  },
})

// Backfill defaults for keys added after initial release
if (store.get('reloadOnSave') === undefined) store.set('reloadOnSave', true)
if (store.get('useCurrentZoneAreaLevel') === undefined) store.set('useCurrentZoneAreaLevel', false)
if (store.get('stashScrollEnabled') === undefined) store.set('stashScrollEnabled', false)
if (store.get('stashScrollModifier') === undefined) store.set('stashScrollModifier', 'Ctrl')
if (store.get('openSide') === undefined) store.set('openSide', 'both')
if ((store.get('tradeStatus') as string) === 'any') store.set('tradeStatus', 'available')
if (store.get('themeId') === undefined) store.set('themeId', 'default')
if (store.get('customThemePalette') === undefined) store.set('customThemePalette', null)
if (store.get('adaptiveDefaultsMode') === undefined) store.set('adaptiveDefaultsMode', 'eager')
if (store.get('startInTray') === undefined) store.set('startInTray', true)

const profileStore = initProfileStore(app.getPath('userData'))

// Backfill new profile/onboarding keys for existing users
if (store.get(ACTIVE_PROFILE_ID_KEY) === undefined) store.set(ACTIVE_PROFILE_ID_KEY, '')
if (store.get(LAST_PROFILE_ID_POE1_KEY) === undefined) store.set(LAST_PROFILE_ID_POE1_KEY, '')
if (store.get(LAST_PROFILE_ID_POE2_KEY) === undefined) store.set(LAST_PROFILE_ID_POE2_KEY, '')
if (store.get('onboardingCompleted') === undefined) store.set('onboardingCompleted', false)

// Auto-detect overlay scale on first run (deferred until app ready since screen API requires it)
if (!IS_E2E)
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

// Legacy profile-backed settings are read once by migrateFromLegacy(). After
// profiles exist, only active-profile references remain in electron-store.

// Migrate: regex presets used to be a single flat `regexPresets` array. Now
// they're per-version. Existing users only ever ran PoE1 (regex tool was off
// for PoE2), so seed the PoE1 slot with whatever's in the legacy key.
{
  const legacyStore = store as Store<AppSettings & { regexPresets?: RegexPreset[] }>
  const legacy = legacyStore.get('regexPresets')
  const poe1Empty = (store.get('regexPresetsPoe1') ?? []).length === 0
  if (legacy && legacy.length > 0 && poe1Empty) store.set('regexPresetsPoe1', legacy)
}

// Migrate: seed profiles from per-version mirror keys. Creates one profile per
// game in the profiles/ directory under userData. Determines whether onboarding
// was already completed (any legacy filter path set). Sets activeProfileId to
// match the current poeVersion. Runs once -- guarded by empty activeProfileId.
if (!store.get(ACTIVE_PROFILE_ID_KEY)) {
  const profiles = profileStore.migrateFromLegacy(store)
  const version = store.get(PROFILE_VERSION_KEY)
  const active = profiles.find((profile) => profile.gameVariant === version) ?? profiles[0] ?? null
  store.set(ACTIVE_PROFILE_ID_KEY, active?.id ?? '')
  store.set(LAST_PROFILE_ID_POE1_KEY, profiles.find((profile) => profile.gameVariant === 1)?.id ?? '')
  store.set(LAST_PROFILE_ID_POE2_KEY, profiles.find((profile) => profile.gameVariant === 2)?.id ?? '')
  const legacyStore = store as unknown as Store<AppSettings & LegacyAppSettings>
  const hadFilter = Boolean(
    legacyStore.get('filterPathPoe1') || legacyStore.get('filterPathPoe2') || legacyStore.get('filterPath'),
  )
  store.set('onboardingCompleted', hadFilter)
}

{
  const profiles = profileStore.listProfiles()
  const activeProfile = profileStore.getProfile(store.get(ACTIVE_PROFILE_ID_KEY))
  if (!store.get(LAST_PROFILE_ID_POE1_KEY)) {
    const fallback = activeProfile?.gameVariant === 1 ? activeProfile : profiles.find((p) => p.gameVariant === 1)
    store.set(LAST_PROFILE_ID_POE1_KEY, fallback?.id ?? '')
  }
  if (!store.get(LAST_PROFILE_ID_POE2_KEY)) {
    const fallback = activeProfile?.gameVariant === 2 ? activeProfile : profiles.find((p) => p.gameVariant === 2)
    store.set(LAST_PROFILE_ID_POE2_KEY, fallback?.id ?? '')
  }
}

// On every startup, hydrate store keys from the active profile (lastProfileId,
// poeVersion, regexPresets). Profile-backed fields (league, filterPath, etc.)
// live only in the profile JSON files and are read via getProfileBackedSetting.
hydrateActiveProfileSettings(store)

// Fire-and-forget league refresh on launch. Updates persist + auto-migrate the
// user's selected league if their old challenge league rotated out. Deferred
// until app-ready since electron's net.request requires it. `force: true`
// bypasses the cooldown gate so a long-running app picks up new leagues each
// time it's relaunched.
if (!IS_E2E)
  app.whenReady().then(() => {
    refreshLeagues(store, undefined, { force: true }).catch((err) =>
      console.error('[leagues] launch refresh failed:', err),
    )
  })

runRegexMacroMigration(store)
setEvaluationStore(store)
initLearning(store, store.get('poeVersion'))
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
learningHandlers.register()
registerClientLogHandlers()
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

  const current = store.get(PROFILE_VERSION_KEY) === 2 ? 2 : 1
  const other: GameVariant = current === 1 ? 2 : 1

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

const gotLock = IS_E2E || app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showAppWindow())
}

const installDir = IS_E2E ? process.cwd() : applyPendingUpdate()

// Live services skipped under the e2e harness (SCALPEL_E2E): game-focus handlers,
// background network refreshers, the updater, devtools, and online filter sync.
// Each needs native/network access the harness deliberately avoids. Called once
// after the app window and IPC handlers are wired.
function startLiveServices(): void {
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

  // Start online filter sync. The poll interval is kept alive regardless of
  // whether filterDir is set yet so a folder picked after onboarding can begin
  // watching without requiring a separate poll-start call.
  const filterDir = getProfileBackedSetting(store, 'filterDir') as string
  startOnlineSync(filterDir, () => {
    const wins: BrowserWindow[] = []
    const ow = getOverlayWindow()
    const aw = getAppWindow()
    if (ow) wins.push(ow)
    if (aw) wins.push(aw)
    return wins
  })
}

app.whenReady().then(() => {
  // Seed the overlay with the last-known game version so attachByTitle waits for
  // that window. The hotkey handler re-detects the focused PoE on every fire and
  // relaunches to swap versions if needed (ensureCorrectGameForHotkey).
  if (!IS_E2E) createOverlayWindow((store.get(PROFILE_VERSION_KEY) as GameVariant) ?? 1)
  // Let the secondary-overlay system know about the main overlay window so its
  // isAnyScalpelWindowFocused predicate can include it.
  setMainOverlayGetter(getOverlayWindow)
  // When focus leaves Scalpel via the PoE -> overlay -> other-app path
  // (which the PoE-blur handler can't catch), suspend hotkeys so they don't
  // fire in the destination app.
  if (!IS_E2E) setOnLeaveScalpel(() => suspendHotkeys())
  createAppWindow(store)
  if (!IS_E2E) createTray()

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

  // Keep open overlay views (item view, dust/div explorers) in sync whenever the
  // filter reloads -- filter switch, online update, version restore -- without a
  // fresh hotkey press. reEvaluateLastItem is a no-op until an item is analyzed,
  // and re-sending the same item never switches the view or pops the overlay, so
  // this is non-intrusive.
  onFilterLoaded(() => {
    getOverlayWindow()?.webContents.send('filter-changed')
    if (getCurrentFilter()) reEvaluateLastItem()
  })

  const filterPath = getProfileBackedSetting(store, 'filterPath')
  if (!IS_E2E && filterPath) loadFilter(filterPath, 'App Launch')

  // Start low-level keyboard hook
  const onHotkeyFired = createHotkeyHandler(store, isElevated)
  const onPriceCheckFired = createPriceCheckHandler(store, isElevated)
  const hotkey = store.get('hotkey')
  if (!IS_E2E) {
    startHotkeyListener(onHotkeyFired)
    setHotkey(hotkey)
    setPriceCheckHandler(onPriceCheckFired)
    setPriceCheckHotkey(store.get('priceCheckHotkey'))
    setEscapeHandler(() => hideOverlay())
    setChatCommands(store.get('chatCommands') ?? [])
  }
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

  setAppMacroHandler((action, tag, presetId) => {
    if (action === 'pasteRegex') {
      if (currentRegex) pasteRegexToSearch(currentRegex)
      return
    }
    if (action === 'useSavedRegex') {
      if (!tag && !presetId) return
      const key = store.get(PROFILE_VERSION_KEY) === 2 ? 'regexPresetsPoe2' : 'regexPresetsPoe1'
      const presets = store.get(key) ?? []
      const preset = presetId
        ? presets.find((p) => p.id === presetId)
        : presets.find((p) => p.tags?.some((t) => t.text === tag && (!t.source || t.source === 'custom')))
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
    if (action.startsWith('plugin-overlay:')) {
      togglePluginOverlay(action.slice('plugin-overlay:'.length))
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
  // anchor persists into the active profile's cheatSheets.windowAnchor; the
  // system handles window lifecycle, snap, alt-tab guard, etc. and the helper
  // below feeds global + per-category hotkeys into the shared system.
  const patchCheatSheets = (patch: Partial<CheatSheetsSettings>): void => {
    const cs = getProfileBackedSetting(store, 'cheatSheets') ?? { globalHotkey: '', categories: [], pinned: false }
    const next: CheatSheetsSettings = { ...cs, ...patch }
    writeActiveProfileSetting(store, 'cheatSheets', next)
  }
  registerCheatSheetsOverlay({
    storedAnchor: () => getProfileBackedSetting(store, 'cheatSheets')?.windowAnchor,
    onAnchorChanged: (anchor) => patchCheatSheets({ windowAnchor: anchor }),
  })
  // Hide the main overlay before showing the cheat sheet (keeps things tidy if
  // the user hotkeys the cheat sheet while the main overlay was open).
  setCheatSheetsBeforeShow(() => hideOverlay())
  applyCheatSheetHotkeys(getProfileBackedSetting(store, 'cheatSheets'))
  registerWhiteboardOverlay()
  registerPinnedZoneOverlay({
    storedAnchor: () => getProfileBackedSetting(store, 'cheatSheets')?.pinnedAnchor,
    onAnchorChanged: (anchor) => patchCheatSheets({ pinnedAnchor: anchor }),
  })
  applyPinnedZoneEnabled(getProfileBackedSetting(store, 'cheatSheets')?.pinned === true)
  subscribeToPoeMoves()
  setStashScrollEnabled(store.get('stashScrollEnabled') ?? false)
  setStashScrollModifier(store.get('stashScrollModifier') ?? 'Ctrl')
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

  if (!IS_E2E) startLiveServices()

  // Show onboarding/settings on first launch, otherwise respect startInTray.
  // E2E harness always shows the window so the Playwright test can interact.
  if (IS_E2E || !store.get('onboardingCompleted') || !store.get('startInTray')) {
    showAppWindow()
  }
})

app.on('before-quit', () => {
  recordMainBreadcrumb('before-quit')
  // Release the single-instance lock before will-quit runs the blocking
  // uIOhook.stop() join. If that join wedges and this process lingers, a
  // manually relaunched instance can still acquire the lock and start, instead
  // of silently quitting at the gotLock check above.
  try {
    app.releaseSingleInstanceLock()
  } catch (err) {
    recordMainDiagnostic('release-lock', err)
  }
  try {
    flushPluginStorage()
  } catch {
    // best-effort
  }
})

app.on('will-quit', () => {
  recordMainBreadcrumb('will-quit')
  stopHotkeyListener()
  stopOnlineSync()
  recordMainBreadcrumb('will-quit complete')
  // electron-overlay-window never releases its ref'd threadsafe function or
  // stops its X11 thread (empty AddonCleanUp, no stop API), which keeps the
  // Linux process alive after an otherwise-clean quit -- the app appears to
  // hang on close. Our own teardown is done here (uiohook stopped above, plugin
  // storage flushed in before-quit, electron-store writes synchronously), so a
  // forced exit loses nothing. Linux-only: Windows closes cleanly without it.
  if (process.platform === 'linux') app.exit(0)
})

// Keep app alive even with no windows (overlay hides, not closes)
app.on('window-all-closed', () => {
  /* intentional - overlay is hidden, not destroyed */
})
