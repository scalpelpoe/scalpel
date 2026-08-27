import { app, crashReporter, ipcMain, screen } from 'electron'
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
import Store from 'electron-store'
import { OverlayController } from 'electron-overlay-window'
import { hideOverlay, showOverlay, getOverlayWindow, setCloseOnClickOutside, setWindowInputFocused } from './overlay'
import { createAppWindow, showAppWindow, getAppWindow } from './app-window'
import {
  startHotkeyListener,
  setHotkey,
  setPriceCheckHotkey,
  setLauncherHotkey,
  setLauncherHandler,
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
  pasteRegexToPoESearch,
  sendChatCommand,
} from './hotkeys'
import { refreshLeagues } from './trade/leagues'
import { resolvePresetRegex } from './trade/beast-preset'
import { getBeastPrices, peekBeastPrices } from './trade/beast-prices'
import { fetchJson } from './trade/prices'
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
import { flushAll as flushPluginStorage } from './plugins/storage'
import { registerCheatSheetProtocol } from './cheat-sheet-protocol'
import { registerScalpelInternalProtocol, registerScalpelInternalSchemePrivileges } from './plugins/protocol'
import { registerScalpelPluginProtocol, registerScalpelPluginSchemePrivileges } from './plugins/plugin-protocol'
import { getRegisteredPluginTabs } from './plugins/tab-registry'
import { getInstalledPlugins } from './plugins/manager'
import {
  registerCheatSheetsOverlay,
  applyCheatSheetHotkeys,
  setCheatSheetsBeforeShow,
  getCheatSheetsOverlay,
  toggleCheatSheets,
} from './cheat-sheets'
import { registerWhiteboardOverlay, toggleWhiteboard } from './whiteboard'
import { togglePluginOverlay } from './plugin-overlay'
import { initLauncher, registerLauncherOverlay, showLauncherAtCursor } from './launcher'
import { normalizeLauncherStyle } from '@shared/launcher'
import { registerPinnedZoneOverlay, applyPinnedZoneEnabled } from './pinned-zone'
import { getOverlayAnchor, setMainOverlayGetter, setOnLeaveScalpel, subscribeToPoeMoves } from './windowing'
import { initAppMacrosRefresh, withPluginHotkeys } from './app-macros'
import { runRadialPluginIconMigration, runRadialScaleMigration } from './radial-scale-migration'
import { runRegexMacroMigration } from './regex-macro-migration'
import {
  applyRegexPreset,
  getRegexRemoteOverlay,
  leftDockFracX,
  registerRegexRemoteOverlay,
  toggleRegexRemote,
} from './regex-remote'
import { detectPanelStateOnce, getCurrentPanelState } from './panel-detection'
import {
  registerRadialMenuOverlay,
  toggleRadialMenu,
  fireRadialSlice,
  cancelRadialMenu,
  getPendingRadialState,
} from './radial-menu'
import { captureRadialBackdrop } from './radial-backdrop'
import { warpCursorTo } from './cursor-warp'
import { getGameCursorPosition } from './screen-capture/cursor'
import { pluginSliceIcon, RADIAL_MACRO_ACTION, type RadialMenuSettings } from '@shared/contracts/radial'
import { IPC_CHANNELS } from '@shared/contracts/ipc'
import type { AppSettings, CheatSheetsSettings, GameVariant, LegacyAppSettings, RegexPreset } from '@shared/types'
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
import { getOverlayAttachStrategy } from './experimental'

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
    launcherHotkey: 'Grave',
    launcherSliceMode: 'names',
    launcherStyle: 'classic',
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
    tradeAffixesPrechecked: 'default',
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
    pluginAutoUpdate: false,
    appWindowPosition: undefined,
    radialMenu: { slices: [] },
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
if (store.get('pluginAutoUpdate') === undefined) store.set('pluginAutoUpdate', false)
if (store.get('locale') === undefined) store.set('locale', 'en')
if (store.get('radialMenu') === undefined) store.set('radialMenu', { slices: [] })
if (store.get('launcherHotkey') === undefined) store.set('launcherHotkey', 'Grave')
if (store.get('launcherSliceMode') === undefined) store.set('launcherSliceMode', 'names')
if (store.get('launcherStyle') === undefined) store.set('launcherStyle', 'classic')
if ((store.get('launcherStyle') as string | undefined) === 'fan') store.set('launcherStyle', 'hub')
{
  const macros = store.get('appMacros') ?? []
  const launcherMacro = macros.find((m) => m.action === 'openLauncher')
  if (launcherMacro?.hotkey && launcherMacro.hotkey !== 'CommandOrControl+Shift+Space') {
    store.set('launcherHotkey', launcherMacro.hotkey)
  }
  const withoutLauncher = macros.filter((m) => m.action !== 'openLauncher')
  if (withoutLauncher.length !== macros.length) store.set('appMacros', withoutLauncher)
}

// tradeDefaultToBase (boolean) became tradeAffixesPrechecked (three-way). Gate on the OLD
// key's presence, not on the new one being undefined: the new key is in `defaults`, so
// store.get() always resolves it and an undefined-check would never fire. The old key is
// present in every pre-migration config and absent on a fresh install, and the delete
// makes this a one-shot.
{
  const legacyStore = store as Store<AppSettings & { tradeDefaultToBase?: boolean }>
  const legacyBase = legacyStore.get('tradeDefaultToBase')
  if (legacyBase !== undefined) {
    if (legacyBase === true) store.set('tradeAffixesPrechecked', 'base')
    legacyStore.delete('tradeDefaultToBase')
  }
}

initMainLocale(store, () => refreshTrayMenu())

const profileStore = initProfileStore(app.getPath('userData'), (variant) =>
  store.get(variant === 2 ? 'leaguesPoe2' : 'leaguesPoe1'),
)

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
// Before any renderer reads settings: the ring's base geometry absorbed a legacy
// 0.7 scale, so a stored scale has to be un-multiplied or the menu halves.
runRadialScaleMigration(store)
// Same window, same reason: the ring's plugin-art precedence flipped, so stored
// plugin slices have to be re-pointed before anything renders them.
runRadialPluginIconMigration(store)
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
  recordMainBreadcrumb('session-start')
  if (!IS_E2E)
    getOverlayAttachStrategy(store).createInitialOverlay((store.get(PROFILE_VERSION_KEY) as GameVariant) ?? 1)
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
    setLauncherHandler(() => {
      const main = getOverlayWindow()
      if (main && !main.isDestroyed() && main.isVisible()) hideOverlay()
      getCheatSheetsOverlay()?.hide()
      showLauncherAtCursor()
    })
    setLauncherHotkey(store.get('launcherHotkey'))
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

  // Beasts presets re-derive against cached poe.ninja prices so a hotkey bound
  // weeks ago still pastes today's valuable beasts. A cold cache pastes the
  // stored regex immediately and warms in the background, so a keypress never
  // waits on the network.
  const beastPresetDeps = {
    peek: peekBeastPrices,
    warm: (league: string): void => {
      void getBeastPrices(league, fetchJson)
    },
  }
  const presetRegex = (preset: RegexPreset): string | undefined =>
    resolvePresetRegex(preset, getProfileBackedSetting(store, 'league'), beastPresetDeps)

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
      paste: (regex) => {
        void pasteRegexToPoESearch(regex)
      },
      defer: (fn) => setTimeout(fn, 50),
      resolveRegex: presetRegex,
    })
  })
  ipcMain.on('regex-remote:close', () => getRegexRemoteOverlay()?.hide())
  ipcMain.on('regex-remote:hand-focus', () => {
    try {
      OverlayController.focusTarget()
    } catch {}
  })

  const dispatchAppMacro = (action: string, tag?: string, presetId?: string): void => {
    if (action === RADIAL_MACRO_ACTION) {
      toggleRadialMenu()
      return
    }
    if (action === 'openLauncher') {
      const main = getOverlayWindow()
      if (main && !main.isDestroyed() && main.isVisible()) hideOverlay()
      getCheatSheetsOverlay()?.hide()
      showLauncherAtCursor()
      return
    }
    if (action === 'pasteRegex') {
      if (currentRegex) void pasteRegexToPoESearch(currentRegex)
      return
    }
    if (action === 'useSavedRegex') {
      if (!tag && !presetId) return
      const key = store.get(PROFILE_VERSION_KEY) === 2 ? 'regexPresetsPoe2' : 'regexPresetsPoe1'
      const presets = store.get(key) ?? []
      const preset = presetId
        ? presets.find((p) => p.id === presetId)
        : presets.find((p) => p.tags?.some((t) => t.text === tag && (!t.source || t.source === 'custom')))
      const regex = preset ? presetRegex(preset) : undefined
      if (regex) void pasteRegexToPoESearch(regex)
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
  }
  setAppMacroHandler(dispatchAppMacro)
  initLauncher({
    dispatch: dispatchAppMacro,
    getSliceMode: () => store.get('launcherSliceMode') ?? 'names',
    getStyle: () => normalizeLauncherStyle(store.get('launcherStyle')),
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
  registerLauncherOverlay()
  registerRadialMenuOverlay({
    getSlices: () => (store.get('radialMenu') as RadialMenuSettings | undefined)?.slices ?? [],
    getScale: () => (store.get('radialMenu') as RadialMenuSettings | undefined)?.scale,
    isDev: () => store.get('developerMode') === true,
    getGameCursor: getGameCursorPosition,
    getScreenCursor: () => screen.getCursorScreenPoint(),
    // Tab icon, else the manifest's - see pluginSliceIcon. Resolved at open
    // rather than stored, so an install or an in-place update is picked up
    // without anything having to invalidate a cache.
    getPluginIcon: (pluginId) =>
      pluginSliceIcon(
        getRegisteredPluginTabs().get(pluginId)?.icon,
        getInstalledPlugins().find((p) => p.manifest.id === pluginId)?.manifest.iconUrl,
      ),
    captureBackdrop: captureRadialBackdrop,
    warpTo: warpCursorTo,
    focusGame: () => {
      try {
        OverlayController.focusTarget()
      } catch {}
    },
    defer: (fn) => setTimeout(fn, 50),
    fire: {
      filter: () => void onHotkeyFired(),
      pricecheck: () => void onPriceCheckFired(),
      appmacro: (action, presetId) => dispatchAppMacro(action, undefined, presetId),
      // Same fire-and-forget contract as the chat hotkey path: a paste that
      // never got focus (or the clipboard) rejects, and that is a diagnostic.
      chat: (command, autoSubmit) => {
        sendChatCommand(command, autoSubmit).catch((e) => recordMainDiagnostic('chat-command', e))
      },
      cheatsheet: (categoryId) => toggleCheatSheets(categoryId),
    },
  })
  ipcMain.on(IPC_CHANNELS.RADIAL.FIRE, (_event, sliceId: string) => fireRadialSlice(String(sliceId)))
  ipcMain.on(IPC_CHANNELS.RADIAL.CANCEL, () => cancelRadialMenu())
  ipcMain.handle(IPC_CHANNELS.RADIAL.PENDING, () => getPendingRadialState())
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

  // Plugin dev quality-of-life: a fully-reload requires an app relaunch
  // (plugin code is loaded once at start). Surface a button in the Developer
  // settings section so plugin authors don't have to close + reopen by hand.
  // Dev builds skip the relaunch step since electron-vite dev won't come back
  // after app.quit() — same caveat as game-switch.ts.
  ipcMain.on('app-restart', () => {
    if (!app.isPackaged) {
      console.warn('[app-restart] dev build — close and `npm run dev` to re-attach')
      return
    }
    app.relaunch()
    app.quit()
  })

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
