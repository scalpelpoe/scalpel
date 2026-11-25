/** OS-neutral transport contract, owned by `@scalpel/platform`. The app persists
 *  values under opaque ids and renders the descriptors; it never decides what a
 *  platform-specific setting means. */

export {
  PLATFORM_GAME_MODE_POLL_MS,
  PLATFORM_SETTING_IDS,
  capturePlatformStartupValues,
  findPlatformSetting,
  platformBanners,
  platformRestartRequired,
} from '@scalpel/platform/settings'

export {
  REGULAR_WINDOW_HEIGHT,
  REGULAR_WINDOW_PANEL_MARGIN,
  REGULAR_WINDOW_PANEL_TOP,
  REGULAR_WINDOW_PANEL_WIDTH,
  REGULAR_WINDOW_SISTER_GAP,
  REGULAR_WINDOW_SISTER_WIDTH,
  REGULAR_WINDOW_WIDTH,
} from '@scalpel/platform/settings'

export type {
  PlatformBanner,
  PlatformBannerAction,
  PlatformBannerTone,
  PlatformDesktopPreference,
  PlatformDisplayMode,
  PlatformGameDisplayModePreference,
  PlatformSettingAvailability,
  PlatformSettingDescriptor,
  PlatformSettingOption,
  PlatformSettingNotice,
  PlatformSettingResult,
  PlatformSettingsPayload,
  PlatformSettingsSection,
  PlatformSettingsView,
  PlatformClipboardBackend,
  PlatformInputBackend,
  PlatformShortcutBackend,
  PlatformWindowingMode,
} from '@scalpel/platform/settings'
