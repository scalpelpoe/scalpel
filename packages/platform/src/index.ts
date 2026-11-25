export { OVERLAY_WINDOW_OPTS } from 'electron-overlay-window'
export { applyPlatformDefaults, preparePlatformLaunch, restartPlatformArgs, startNativeWaylandSupport } from './boot'
export {
  PLATFORM_GAME_MODE_POLL_MS,
  PLATFORM_SETTING_IDS,
  capturePlatformStartupValues,
  findPlatformSetting,
  platformBanners,
  platformRestartRequired,
} from './common/platform-settings'
export { setBreadcrumbReporter, setDiagnosticReporter } from './common/diagnostics'
export {
  REGULAR_WINDOW_HEIGHT,
  REGULAR_WINDOW_PANEL_MARGIN,
  REGULAR_WINDOW_PANEL_TOP,
  REGULAR_WINDOW_PANEL_WIDTH,
  REGULAR_WINDOW_SISTER_GAP,
  REGULAR_WINDOW_SISTER_WIDTH,
  REGULAR_WINDOW_WIDTH,
} from './common/window-layout'
export {
  getAllGameTitles,
  getGameTitleForVariant,
  getGameTitlesForVariant,
  resetGameTitleOverridesForTests,
  setGameTitleOverrides,
} from './common/game-window-identity'
export { getGameIdentityHints } from './common/game-window-identity'
export type { GameTitleOverrides, GameWindowIdentityHint } from './common/game-window-identity'
export { Key } from './common/input'
export { createLinuxClipboard } from './linux/common/clipboard'
export {
  getLinuxClipboardBackend,
  setLinuxClipboardBackend,
} from './linux/common/clipboard-backend'
export {
  getLinuxInputBackend,
  setLinuxInputBackend,
} from './linux/common/input-backend'
export {
  enablePortalShortcuts,
  getLinuxShortcutBackend,
  platformShortcuts,
  setLinuxNativeShortcuts,
  setLinuxShortcutBackend,
  toLinuxShortcutBackend,
} from './linux/common/global-shortcuts'
export {
  adoptOverlayWindow,
  captureOverlayGame,
  nativeOverlayActive,
  nativeOverlayBackendId,
  nativeOverlayFeature,
  overlayBoundsAreLogical,
  overlayCanCapture,
  overlayGameHasKeyboardFocus,
  overlayPointerPosition,
  overlayWebPreferences,
  refreshOverlayPointer,
  registerNativeOverlayBackend,
  setOverlayInputRects,
  unregisterNativeOverlayBackend,
} from './linux/common/native-overlay'
export {
  evdevToUiohook,
  markNativeShortcutKey,
  nativeShortcutHandles,
  uiohookToEvdev,
} from './linux/common/native-input'
export { registerCompositorClipboard } from './linux/common/wayland/compositor-clipboard'
export {
  isWaylandGameFocused,
  onRecentWindowHintsChange,
  onWaylandGameFocusChange,
  readRecentWindowHints,
  readWaylandGameFocus,
  startWaylandFocusTracking,
} from './linux/common/wayland/focus'
export {
  effectiveLinuxDisplayMode,
  explicitLinuxDisplayMode,
  isNativeWayland,
  MANAGED_OZONE_ENV,
  ozoneArgsForMode,
} from './linux/common/display'
export { detectPlatformGameMode, gameModeFromClients } from './linux/game-mode'
export { getLinuxGameDisplayModeStatus, setLinuxGameDisplayModeOverride } from './linux/common/game-display-mode'
export { getLinuxDesktop, setLinuxDesktop } from './linux/common/desktop'
export {
  defaultLinuxLayerShellCapability,
  resolveLinuxWindowingMode,
  toLinuxWindowingMode,
} from './linux/common/layer-shell/windowing'
export { platform } from './platform'
export { platformSettingsView } from './settings-view'
export { currentEnv, detectDesktopEnvironment, detectOperatingSystem, relaunchArgs, selectBackend } from './select'
export type {
  PlatformBanner,
  PlatformBannerAction,
  PlatformBannerTone,
  PlatformDesktopPreference,
  PlatformDisplayMode,
  PlatformGameDisplayModePreference,
  PlatformSettingAvailability,
  PlatformSettingDescriptor,
  PlatformSettingNotice,
  PlatformSettingOption,
  PlatformSettingResult,
  PlatformSettingsPayload,
  PlatformSettingsSection,
  PlatformSettingsView,
  PlatformClipboardBackend,
  PlatformInputBackend,
  PlatformShortcutBackend,
  PlatformWindowingMode,
} from './common/platform-settings'
export type { PlatformSettingsInput } from './settings-view'
export type {
  AttachEvent,
  BackendId,
  BackendServices,
  CaptureFailure,
  CaptureFrame,
  CaptureOptions,
  CaptureResult,
  Clipboard,
  Cursor,
  FullscreenEvent,
  GameCapture,
  GameWindowSource,
  GlobalShortcuts,
  InputEvents,
  InputHook,
  InputKeyEvent,
  InputMouseEvent,
  InputWheelEvent,
  MoveresizeEvent,
  Platform,
  PlatformEnv,
  TrackerEventMap,
  TrackerEvents,
  Traits,
  WindowTracker,
} from './types'
export type { PlatformGameMode } from './linux/game-mode'
export type { LinuxClipboard, LinuxClipboardSource } from './linux/common/clipboard'
export type { LinuxClipboardBackend } from './linux/common/clipboard-backend'
export type { LinuxInputBackend } from './linux/common/input-backend'
export type { LinuxDisplayMode } from './linux/common/display'
export type { LinuxEffectiveBackendsSnapshot } from './linux/effective-backends'
export { resolveLinuxEffectiveBackendsSnapshot } from './linux/effective-backends'
export type {
  ConcreteLinuxShortcutBackend,
  LinuxShortcutBackend,
} from './linux/common/global-shortcuts'
export type { WaylandGameFocus } from './linux/common/wayland/focus'
export type {
  NativeInputEvent,
  NativeOverlayServices,
  OverlayRect,
} from './linux/common/native-overlay'
export type {
  LinuxLayerShellCapability,
  LinuxWindowingFacts,
  LinuxWindowingResolution,
  LinuxWindowingWarning,
} from './linux/common/layer-shell/windowing'
export type { DesktopEnvironment, OperatingSystem } from './select'
