/** Stable ids for the values the settings view can return. They are opaque to
 *  the host app: it persists them under its own neutral setting keys. */
export {
  REGULAR_WINDOW_HEIGHT,
  REGULAR_WINDOW_PANEL_MARGIN,
  REGULAR_WINDOW_PANEL_TOP,
  REGULAR_WINDOW_PANEL_WIDTH,
  REGULAR_WINDOW_SISTER_GAP,
  REGULAR_WINDOW_SISTER_WIDTH,
  REGULAR_WINDOW_WIDTH,
} from './window-layout'

export const PLATFORM_SETTING_IDS = {
  displayMode: 'displayMode',
  gameDisplayMode: 'gameDisplayMode',
  desktopEnvironment: 'desktopEnvironment',
  windowingMode: 'windowingMode',
  inputBackend: 'inputBackend',
  clipboardBackend: 'clipboardBackend',
  shortcutBackend: 'shortcutBackend',
} as const

/** Legacy polling interval kept for callers that still poll; native trackers
 *  now push live game-mode updates, so new code should not need it. */
export const PLATFORM_GAME_MODE_POLL_MS = 5000

export type PlatformDisplayMode = 'x11' | 'wayland'
/** User-facing overlay path. Desktop-specific layer-shell adapters stay inside
 *  `@scalpel/platform`; compositors never become separate modes. */
export type PlatformWindowingMode = 'auto' | 'x11' | 'window' | 'layer-shell'
/** `auto` mirrors the display mode selected in Scalpel; `detect` uses live PoE
 *  detection from the compositor once the game opens. */
export type PlatformGameDisplayModePreference = 'auto' | 'detect' | PlatformDisplayMode
export type PlatformDesktopPreference = 'auto' | 'hyprland' | 'kde-plasma' | 'niri' | 'sway' | 'umbriel'
/** Transport shape for the global-shortcut backend selector. The Linux package
 *  decides which values are meaningful on this host. */
export type PlatformShortcutBackend = 'auto' | 'evdev' | 'portal' | 'electron'
/** Transport shape for the Linux clipboard backend selector. */
export type PlatformClipboardBackend = 'auto' | 'wl-clipboard' | 'compositor' | 'native'
/** Transport shape for the Linux input backend selector. */
export type PlatformInputBackend = 'auto' | 'uiohook' | 'ydotool' | 'wtype' | 'compositor'

/** OS-neutral shape of a settings view. The package decides which controls are
 *  meaningful for the current host; the app only renders what it is given.
 *  Label/hint fields are message keys so localization stays in the app. */
export type PlatformSettingAvailability = 'available' | 'disabled' | 'hidden'

export interface PlatformSettingOption {
  readonly id: string
  readonly labelKey: string
  readonly hintKey?: string
  readonly hintParams?: Readonly<Record<string, string>>
  /** Message key used inside an `Auto (<effective>)` label. */
  readonly effectiveLabelKey?: string
}

/** Generic notice actions. The host already owns restart and opaque setting
 *  writes, so notices never need to name an OS or a persisted key. */
export type PlatformBannerAction =
  | { readonly kind: 'restart'; readonly labelKey: string }
  | {
      readonly kind: 'set-setting'
      readonly labelKey: string
      readonly settingId: string
      readonly value: string
    }

export type PlatformBannerTone = 'warn' | 'error' | 'info'

/** A top-of-window notice derived from the platform view. Several can be active
 *  at once (for example a mismatch warning and a pending restart). */
export interface PlatformBanner {
  readonly id: string
  readonly messageKey: string
  readonly params?: Readonly<Record<string, string>>
  readonly tone: PlatformBannerTone
  readonly action?: PlatformBannerAction
}

/** A non-blocking message attached to one setting. The renderer shows these
 *  inline under the selector; the OS-specific text/action comes from the view. */
export interface PlatformSettingNotice {
  readonly messageKey: string
  readonly params?: Readonly<Record<string, string>>
  readonly tone?: PlatformBannerTone
  readonly action?: PlatformBannerAction
}

export interface PlatformSettingDescriptor {
  readonly id: string
  readonly labelKey: string
  /** The saved/user-facing value the selector should show. */
  readonly value: string
  /** The value currently applied by the OS, when it differs from `value`. */
  readonly appliedValue?: string
  readonly options: readonly PlatformSettingOption[]
  readonly availability: PlatformSettingAvailability
  readonly hintKey?: string
  readonly hintParams?: Readonly<Record<string, string>>
  /** Inline notices rendered directly beneath this selector. */
  readonly notices?: readonly PlatformSettingNotice[]
  readonly errorKey?: string
  readonly requiresRestart?: boolean
  /** Resolved value behind an `auto` selection, when one is known. */
  readonly effectiveValue?: string
  readonly effectiveLabelKey?: string
}

export interface PlatformSettingsSection {
  readonly id: string
  readonly labelKey?: string
  readonly collapsed?: boolean
  readonly settings: readonly PlatformSettingDescriptor[]
}

export interface PlatformSettingsView {
  readonly available: boolean
  readonly sections: readonly PlatformSettingsSection[]
  /** Template key for `Auto (value)`-style option labels, supplied by the OS view. */
  readonly optionValueLabelKey?: string
  readonly restartNoticeKey?: string
}

export interface PlatformSettingsPayload {
  readonly view: PlatformSettingsView
  /** Values captured at process startup for settings that need a restart. */
  readonly startupValues: Readonly<Record<string, string>>
  /** All currently active top-window notices, ready to render in order. */
  readonly banners: readonly PlatformBanner[]
  /** Current and previous activated window titles from native Wayland focus. */
  readonly recentWindowTitles?: readonly string[]
}

export interface PlatformSettingResult {
  readonly restartRequired: boolean
  readonly devRestartRequired?: boolean
}

export function findPlatformSetting(view: PlatformSettingsView, id: string): PlatformSettingDescriptor | null {
  for (const section of view.sections) {
    const found = section.settings.find((setting) => setting.id === id)
    if (found) return found
  }
  return null
}

/** What a restart would actually change. Compare applied values, not the raw
 *  selector: `Auto (Generic layer shell)` and `Generic layer shell` resolve to
 *  the same applied backend, so switching between them changes nothing at
 *  runtime and must not show a restart banner. */
function platformAppliedValue(setting: PlatformSettingDescriptor): string {
  return setting.appliedValue ?? setting.value
}

/** Capture only user-changeable restart knobs; an explicit launch flag already
 *  controls the mode and must not produce a misleading restart prompt. */
export function capturePlatformStartupValues(view: PlatformSettingsView): Record<string, string> {
  const values: Record<string, string> = {}
  for (const section of view.sections) {
    for (const setting of section.settings) {
      if (setting.requiresRestart && setting.availability === 'available') {
        values[setting.id] = platformAppliedValue(setting)
      }
    }
  }
  return values
}

export function platformRestartRequired(
  view: PlatformSettingsView,
  startupValues: Readonly<Record<string, string>>,
): boolean {
  for (const section of view.sections) {
    for (const setting of section.settings) {
      if (!setting.requiresRestart || setting.availability !== 'available') continue
      const startup = startupValues[setting.id]
      if (startup !== undefined && startup !== platformAppliedValue(setting)) return true
    }
  }
  return false
}

/** Top-of-window notices for state that applies to the whole app. Per-setting
 *  compatibility messages stay inline in the descriptor's `notices` instead. */
export function platformBanners(
  view: PlatformSettingsView,
  startupValues: Readonly<Record<string, string>>,
): PlatformBanner[] {
  if (!view.available || !view.restartNoticeKey || !platformRestartRequired(view, startupValues)) return []

  return [
    {
      id: 'restart',
      messageKey: view.restartNoticeKey,
      tone: 'warn',
      action: { kind: 'restart', labelKey: 'common_restart' },
    },
  ]
}
