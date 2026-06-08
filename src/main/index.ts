import { app, type BrowserWindow, clipboard, crashReporter, ipcMain, screen } from 'electron'
import { installEarlyDiagnostics, recordMainBreadcrumb, recordMainDiagnostic } from './diagnostics'

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

// Dev/QA: run against a throwaway userData dir so first-run onboarding can be
// exercised without touching the real install. Honored only in unpacked builds,
// and never when the E2E harness already redirected userData above.
if (!IS_E2E && !app.isPackaged && process.env.SCALPEL_USER_DATA_DIR) {
  app.setPath('userData', process.env.SCALPEL_USER_DATA_DIR)
}

installEarlyDiagnostics()

// Capture native aborts (the tsfn proxy calling napi_fatal_error, etc.) as local
// minidumps under userData/Crashpad. A C-level abort never reaches the JS
// uncaughtException handler, so this is the only trace it leaves on Windows.
crashReporter.start({ uploadToServer: false })

import { execSync } from 'node:child_process'
import { uIOhook, UiohookKey } from 'uiohook-napi'
import Store from 'electron-store'
import { OverlayController } from 'electron-overlay-window'
import {
  createOverlayWindow,
  hideOverlay,
  showOverlay,
  getOverlayWindow,
  setCloseOnClickOutside,
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
import { refreshLeagues } from './trade/leagues'
import { stopOnlineSync } from './online-sync'
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
import { initMainLocale } from './locale'
import { snapshotClipboard } from './clipboard-preserve'
import { flushAll as flushPluginStorage } from './plugins/storage'
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
  getOverlayAnchor,
  hideAllOnPoeBlur,
  restoreAllOnPoeFocus,
  isAnyScalpelWindowFocused,
  setMainOverlayGetter,
  setOnLeaveScalpel,
  subscribeToPoeMoves,
} from './windowing'
import { initAppMacrosRefresh, withPluginHotkeys } from './app-macros'
import { runRegexMacroMigration } from './regex-macro-migration'
import {
  applyRegexPreset,
  getRegexRemoteOverlay,
  leftDockFracX,
  registerRegexRemoteOverlay,
  toggleRegexRemote,
} from './regex-remote'
import { detectPanelStateOnce, getCurrentPanelState } from './panel-detection'
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
import { registerAllIpc } from './app/register-ipc'
import { createTray, refreshTrayMenu } from './app/tray'
import { startLiveServices } from './app/lifecycle'

// ---- Linux display-server setup --------------------------------------------

if (
  process.platform === 'linux' &&
  process.env.WAYLAND_DISPLAY &&
  !process.argv.some((a) => a.startsWith('--ozone-platform='))
) {
  app.relaunch({ args: [...process.argv.slice(1), '--ozone-platform=x11'] })
  app.exit(0)
}

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
    hotkey: 'CommandOrControl+D',
    priceCheckHotkey: 'CommandOrControl+A',
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
    tradePoe2CraftingReadyDefault: true,
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
    locale: 'en',
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
if (store.get('locale') === undefined) store.set('locale', 'en')

initMainLocale(store, () => refreshTrayMenu())

const profileStore = initProfileStore(app.getPath('userData'))

if (store.get(ACTIVE_PROFILE_ID_KEY) === undefined) store.set(ACTIVE_PROFILE_ID_KEY, '')
if (store.get(LAST_PROFILE_ID_POE1_KEY) === undefined) store.set(LAST_PROFILE_ID_POE1_KEY, '')
if (store.get(LAST_PROFILE_ID_POE2_KEY) === undefined) store.set(LAST_PROFILE_ID_POE2_KEY, '')
if (store.get('onboardingCompleted') === undefined) store.set('onboardingCompleted', false)

if (!IS_E2E)
  app.whenReady().then(() => {
    if (store.get('overlayScale') === 1 && !store.get('overlayScaleSet' as keyof AppSettings)) {
      const height = screen.getPrimaryDisplay().workAreaSize.height
      if (height >= 2160) store.set('overlayScale', 2)
      else if (height >= 1440) store.set('overlayScale', 1.5)
      store.set('overlayScaleSet' as keyof AppSettings, true)
    }
  })

{
  const legacyStore = store as Store<AppSettings & { regexPresets?: RegexPreset[] }>
  const legacy = legacyStore.get('regexPresets')
  const poe1Empty = (store.get('regexPresetsPoe1') ?? []).length === 0
  if (legacy && legacy.length > 0 && poe1Empty) store.set('regexPresetsPoe1', legacy)
}

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

hydrateActiveProfileSettings(store)

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

registerAllIpc({ store, isElevated, getAppWindow, showAppWindow, hideOverlay })

// ---- Protocol scheme privileges (must run before app ready) ----------------

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

app.whenReady().then(() => {
  if (!IS_E2E) createOverlayWindow((store.get(PROFILE_VERSION_KEY) as GameVariant) ?? 1)
  setMainOverlayGetter(getOverlayWindow)
  if (!IS_E2E) setOnLeaveScalpel(() => suspendHotkeys())
  createAppWindow(store)
  if (!IS_E2E) createTray({ store, showAppWindow })

  registerScalpelInternalProtocol()
  registerScalpelPluginProtocol()
  registerCheatSheetProtocol()

  onFilterLoaded(() => {
    getOverlayWindow()?.webContents.send('filter-changed')
    if (getCurrentFilter()) reEvaluateLastItem()
  })

  const filterPath = getProfileBackedSetting(store, 'filterPath')
  if (!IS_E2E && filterPath) loadFilter(filterPath, 'App Launch')

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
    uIOhook.keyToggle(UiohookKey.Ctrl, 'down')
    uIOhook.keyTap(UiohookKey.F)
    uIOhook.keyToggle(UiohookKey.Ctrl, 'up')
    uIOhook.keyToggle(UiohookKey.Ctrl, 'down')
    uIOhook.keyTap(UiohookKey.V)
    uIOhook.keyToggle(UiohookKey.Ctrl, 'up')
    setTimeout(restoreClip, 100)
  }

  const REGEX_REMOTE_FLUSH_EPS = 0.01
  function regexRemoteFlushLeft(anchor: { fracX: number } | null): boolean {
    if (!anchor || !getCurrentPanelState().leftPanelOpen) return false
    return Math.abs(anchor.fracX - leftDockFracX(OverlayController.targetBounds)) < REGEX_REMOTE_FLUSH_EPS
  }
  let regexRemoteToggleBusy = false

  ipcMain.handle('regex-remote:mount-state', () => regexRemoteFlushLeft(getOverlayAnchor('regex-remote')))

  ipcMain.on('regex-remote:apply', (_event, presetId: string) => {
    applyRegexPreset(presetId, {
      getPresets: () => {
        const key = store.get(PROFILE_VERSION_KEY) === 2 ? 'regexPresetsPoe2' : 'regexPresetsPoe1'
        return store.get(key) ?? []
      },
      focusGame: () => {
        try {
          OverlayController.focusTarget()
        } catch {}
      },
      paste: pasteRegexToSearch,
      defer: (fn) => setTimeout(fn, 50),
    })
  })
  ipcMain.on('regex-remote:close', () => getRegexRemoteOverlay()?.hide())
  ipcMain.on('regex-remote:hand-focus', () => {
    try {
      OverlayController.focusTarget()
    } catch {}
  })

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
    if (action === 'toggleRegexRemote') {
      if (getRegexRemoteOverlay()?.isVisible()) {
        toggleRegexRemote()
        return
      }
      if (regexRemoteToggleBusy) return
      regexRemoteToggleBusy = true
      const main = getOverlayWindow()
      if (main && !main.isDestroyed() && main.isVisible()) hideOverlay()
      getCheatSheetsOverlay()?.hide()
      void detectPanelStateOnce().finally(() => {
        regexRemoteToggleBusy = false
        toggleRegexRemote()
        getRegexRemoteOverlay()?.send(
          'regex-remote:mount-changed',
          regexRemoteFlushLeft(getOverlayAnchor('regex-remote')),
        )
      })
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

  const patchCheatSheets = (patch: Partial<CheatSheetsSettings>): void => {
    const cs = getProfileBackedSetting(store, 'cheatSheets') ?? { globalHotkey: '', categories: [], pinned: false }
    const next: CheatSheetsSettings = { ...cs, ...patch }
    writeActiveProfileSetting(store, 'cheatSheets', next)
  }
  registerCheatSheetsOverlay({
    storedAnchor: () => getProfileBackedSetting(store, 'cheatSheets')?.windowAnchor,
    onAnchorChanged: (anchor) => patchCheatSheets({ windowAnchor: anchor }),
  })
  setCheatSheetsBeforeShow(() => hideOverlay())
  applyCheatSheetHotkeys(getProfileBackedSetting(store, 'cheatSheets'))
  registerWhiteboardOverlay()
  registerRegexRemoteOverlay({
    onAnchorChanged: (anchor) => {
      getRegexRemoteOverlay()?.send('regex-remote:mount-changed', regexRemoteFlushLeft(anchor))
      try {
        OverlayController.focusTarget()
      } catch {}
    },
    getTargetBounds: () => OverlayController.targetBounds,
    getPanelState: () => getCurrentPanelState(),
  })
  registerPinnedZoneOverlay({
    storedAnchor: () => getProfileBackedSetting(store, 'cheatSheets')?.pinnedAnchor,
    onAnchorChanged: (anchor) => patchCheatSheets({ pinnedAnchor: anchor }),
  })
  applyPinnedZoneEnabled(getProfileBackedSetting(store, 'cheatSheets')?.pinned === true)
  subscribeToPoeMoves()
  setStashScrollEnabled(store.get('stashScrollEnabled') ?? false)
  setStashScrollModifier(store.get('stashScrollModifier') ?? 'Ctrl')
  setOpenSide(store.get('openSide') ?? 'both')

  ipcMain.on('suspend-hotkeys', () => suspendHotkeys())
  ipcMain.on('resume-hotkeys', () => resumeHotkeys())

  ipcMain.on('overlay-input-focused', (e, focused: boolean) => {
    setWindowInputFocused(e.sender.id, focused)
    if (focused) suspendHotkeys()
    else resumeHotkeys()
  })

  setCloseOnClickOutside(store.get('closeOnClickOutside'))

  if (!IS_E2E) startLiveServices({ store, installDir })

  if (IS_E2E || !store.get('onboardingCompleted') || !store.get('startInTray')) {
    showAppWindow()
  }
})

app.on('before-quit', () => {
  recordMainBreadcrumb('before-quit')
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
  if (process.platform === 'linux') app.exit(0)
})

app.on('window-all-closed', () => {
  /* intentional - overlay is hidden, not destroyed */
})
