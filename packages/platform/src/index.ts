export { OVERLAY_WINDOW_OPTS } from 'electron-overlay-window'
export {
  applyPlatformDefaults,
  applyPlatformPreference,
  preparePlatformLaunch,
  restartPlatformArgs,
  startPlatform,
} from './boot'
export type { PlatformPreferences } from './boot'
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
  setGameTitleOverrides,
} from './common/game-window-identity'
export { Key } from './common/input'
export { overlayBoundsAreLogical } from './linux/common/native-overlay'
export {
  isWaylandGameFocused,
  onWaylandGameFocusChange,
  readRecentWindowHints,
  readWaylandGameFocus,
} from './linux/common/wayland/focus'
export { isNativeWayland } from './linux/common/display'
export { detectPlatformGameMode } from './linux/game-mode'
export { getLinuxGameDisplayModeStatus } from './linux/common/game-display-mode'
export { getLinuxDesktop } from './linux/common/desktop'
export { platform } from './platform'
export { platformSettingsView } from './settings-view'
export { currentEnv, relaunchArgs, selectBackend } from './select'
export type {
  PlatformBanner,
  PlatformBannerAction,
  PlatformBannerTone,
  PlatformDesktopPreference,
  PlatformDisplayMode,
  PlatformGameDisplayModePreference,
  PlatformSettingAvailability,
  PlatformSettingDescriptor,
  PlatformSettingId,
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
export type {
  AttachEvent,
  BackendId,
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
export { resolveLinuxEffectiveBackendsSnapshot } from './linux/effective-backends'
