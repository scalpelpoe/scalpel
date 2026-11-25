import type { PlatformBannerAction } from '../common/platform-settings'
import { linuxDesktopAdapter } from './desktops'
import type { ConcreteLinuxDesktopPreference } from './linux-settings'
import type {
  LinuxDesktopDefaults,
  LinuxDesktopKey,
  LinuxSettingsCondition,
  LinuxSettingsNoticeRule,
  LinuxSettingKey,
} from './settings-rules'

/** Defaults for detected keys that are not selectable desktop profiles.
 *  Selectable desktops contribute theirs through their adapter (registry). */
const GENERIC_LINUX_DESKTOP_DEFAULTS: Partial<Record<LinuxDesktopKey, LinuxDesktopDefaults>> = {
  gnome: { windowingMode: 'layer-shell' },
  wayland: { windowingMode: 'layer-shell' },
  xfce: { windowingMode: 'x11' },
  x11: { windowingMode: 'x11' },
}

function concreteDesktop(id: string): ConcreteLinuxDesktopPreference | null {
  switch (id) {
    case 'kde-plasma':
    case 'hyprland':
    case 'niri':
    case 'sway':
    case 'umbriel':
      return id
    default:
      return null
  }
}

/** Auto defaults for a desktop profile. The single accessor used by boot and
 *  the settings view, so the two can never diverge. A selectable desktop's
 *  values come from its adapter; detected-only keys use the generic map. An
 *  explicit user selection always wins over these defaults. */
export function linuxDesktopDefaults(desktop: LinuxDesktopKey): LinuxDesktopDefaults {
  const concrete = concreteDesktop(desktop === 'kde' ? 'kde-plasma' : desktop)
  return {
    ...(GENERIC_LINUX_DESKTOP_DEFAULTS[desktop] ?? {}),
    ...(concrete ? (linuxDesktopAdapter(concrete).defaults ?? {}) : {}),
  }
}

const switchDisplayToWayland: PlatformBannerAction = {
  kind: 'set-setting',
  settingId: 'displayMode',
  value: 'wayland',
  labelKey: 'settings_linux_game_mode_switch_wayland',
}

/** Compatibility matrix: selecting one of `values` for `settingId` is only
 *  compatible while the environment satisfies `requires`; otherwise the
 *  setting gets a warning notice. Add new backend/environment combinations
 *  here — one entry — instead of hand-writing `when`/`not` rule pairs.
 *
 *  Entries never list `auto`: the settings view feeds resolved values into the
 *  rules, so an Auto choice that lands on a listed value warns exactly like an
 *  explicit one. Actions that write the display mode are dropped automatically
 *  while a launch flag locks that selector (see the evaluator), so entries
 *  don't need locked variants either. */
interface LinuxCompatibilityEntry {
  readonly settingId: LinuxSettingKey
  readonly values: readonly string[]
  /** Environment facts that must hold for these values to work. */
  readonly requires: LinuxSettingsCondition
  readonly messageKey: string
  readonly action?: PlatformBannerAction
}

const COMPATIBILITY_MATRIX: readonly LinuxCompatibilityEntry[] = [
  {
    settingId: 'windowingMode',
    values: ['layer-shell'],
    requires: { displayMode: ['wayland'] },
    messageKey: 'settings_linux_windowing_wayland_required',
    action: switchDisplayToWayland,
  },
  {
    settingId: 'shortcutBackend',
    values: ['portal'],
    requires: { displayMode: ['wayland'] },
    messageKey: 'settings_linux_shortcuts_wayland_required',
    action: switchDisplayToWayland,
  },
  {
    settingId: 'clipboardBackend',
    values: ['wl-clipboard', 'compositor'],
    requires: { displayMode: ['wayland'] },
    messageKey: 'settings_linux_clipboard_wayland_required',
    action: switchDisplayToWayland,
  },
  {
    settingId: 'inputBackend',
    values: ['wtype', 'ydotool', 'compositor'],
    requires: { displayMode: ['wayland'] },
    messageKey: 'settings_linux_input_wayland_required',
    action: switchDisplayToWayland,
  },
]

function compatibilityRules(): LinuxSettingsNoticeRule[] {
  return COMPATIBILITY_MATRIX.map((entry) => ({
    id: `${entry.settingId}:${entry.values.join('|')}`,
    when: { [entry.settingId]: entry.values },
    // Fire unless the required environment holds.
    not: entry.requires,
    settingId: entry.settingId,
    notice: { messageKey: entry.messageKey, tone: 'warn', action: entry.action },
  }))
}

/** Rules that don't fit the matrix: cross-setting state, runtime probe results,
 *  and fallbacks. Keep this list short; backend/environment combinations
 *  belong in the matrix above. */
const STATE_RULES: readonly LinuxSettingsNoticeRule[] = [
  {
    id: 'game-mode-wayland-on-x11',
    when: { gameModeMismatch: [true] },
    settingId: 'gameDisplayMode',
    notice: {
      messageKey: 'settings_linux_game_mode_mismatch',
      tone: 'warn',
      action: switchDisplayToWayland,
    },
  },
  {
    id: 'desktop-environment-mismatch',
    when: { desktopMismatch: [true] },
    settingId: 'desktopEnvironment',
    notice: {
      messageKey: 'settings_linux_desktop_mismatch',
      tone: 'warn',
    },
    paramsFromFacts: {
      selectedLabelKey: 'selectedDesktopLabelKey',
      detectedLabelKey: 'detectedDesktopLabelKey',
    },
  },
  {
    id: 'layer-shell-host-unavailable',
    when: { windowingMode: ['layer-shell'], layerShellAvailable: [false] },
    not: { displayMode: ['x11'] },
    settingId: 'windowingMode',
    notice: {
      messageKey: 'settings_linux_backend_fallback',
      params: { reasonLabelKey: 'settings_linux_unavailable_hint' },
      tone: 'warn',
      action: {
        kind: 'set-setting',
        settingId: 'windowingMode',
        value: 'window',
        labelKey: 'settings_linux_backend_window',
      },
    },
    paramsFromFacts: { reasonLabelKey: 'layerShellReasonKey' },
  },
  {
    id: 'layer-shell-suggested-on-x11',
    when: { displayMode: ['x11'], desktopSuggestsLayerShell: [true] },
    // An explicit layer-shell selection already warns that it needs Wayland.
    not: { windowingMode: ['layer-shell'] },
    settingId: 'displayMode',
    notice: {
      messageKey: 'settings_linux_display_layer_shell_suggested',
      tone: 'info',
      action: switchDisplayToWayland,
    },
  },
  {
    id: 'portal-shortcuts-cannot-bind',
    when: {
      shortcutBackend: ['portal'],
      nativeWayland: [true],
      portalUnavailable: [true],
    },
    settingId: 'shortcutBackend',
    notice: {
      messageKey: 'settings_linux_shortcuts_portal_unavailable',
      tone: 'warn',
    },
  },
  {
    id: 'evdev-shortcuts-unavailable',
    when: { shortcutBackend: ['evdev'], nativeWayland: [true], nativeOverlay: [false] },
    settingId: 'shortcutBackend',
    notice: {
      messageKey: 'settings_linux_shortcuts_evdev_unavailable',
      tone: 'warn',
    },
  },
]

/** Add/edit compatibility entries in the matrix above. The evaluator in
 *  `settings-rules.ts` is the only logic; messages live in `messages/*.json`. */
export const LINUX_SETTINGS_RULES: readonly LinuxSettingsNoticeRule[] = [...compatibilityRules(), ...STATE_RULES]
