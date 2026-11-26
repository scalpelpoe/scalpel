import { PLATFORM_SETTING_IDS } from '../common/platform-settings'
import type {
  PlatformSettingDescriptor,
  PlatformSettingsSection,
  PlatformSettingsView,
  PlatformWindowingMode,
} from '../common/platform-settings'
import {
  currentEnv,
  detectDesktopEnvironment,
  detectOperatingSystem,
  type DesktopEnvironment,
  type OperatingSystem,
} from '../select'
import type { PlatformEnv } from '../types'
import { explicitLinuxDisplayMode, isNativeWayland, toLinuxDisplayMode, type LinuxDisplayMode } from './common/display'
import { getLinuxGameDisplayModeStatus } from './common/game-display-mode'
import {
  defaultLinuxLayerShellCapability,
  type LinuxLayerShellCapability,
  resolveLinuxWindowingMode,
  type LinuxWindowingFacts,
  type LinuxWindowingResolution,
  toLinuxWindowingMode,
} from './common/layer-shell/windowing'
import { linuxCompositorClipboardAvailable } from './common/clipboard'
import { toLinuxClipboardBackend, type LinuxClipboardBackend } from './common/clipboard-backend'
import { toLinuxInputBackend, type LinuxInputBackend } from './common/input-backend'
import { preferredTool } from './common/key-injection'
import {
  portalShortcutsUnavailable,
  evdevKeyboardsReadable,
  resolveLinuxShortcutBackend,
  toLinuxShortcutBackend,
  type LinuxShortcutBackend,
} from './common/global-shortcuts'
import { nativeOverlayActive } from './common/native-overlay'
import {
  evaluateLinuxSettingsRules,
  linuxDesktopDefaults,
  type LinuxSettingsFacts,
  type LinuxSettingsRulesResult,
} from './settings-rules'

/** Kept as a named alias so Linux-focused callers/tests remain descriptive. */
export const LINUX_SETTING_IDS = PLATFORM_SETTING_IDS

export type LinuxGameDisplayMode = 'x11' | 'wayland'
export type LinuxGameDisplayModePreference = 'auto' | 'detect' | LinuxGameDisplayMode

const DESKTOP_PREFERENCE_IDS = ['kde-plasma', 'hyprland', 'niri', 'sway', 'umbriel'] as const
export type ConcreteLinuxDesktopPreference = (typeof DESKTOP_PREFERENCE_IDS)[number]
export type LinuxDesktopPreference = 'auto' | ConcreteLinuxDesktopPreference

export interface LinuxSettingsInput {
  env?: PlatformEnv
  os?: OperatingSystem
  detectedDesktop?: DesktopEnvironment
  desktopEnvironment?: unknown
  displayMode?: unknown
  /** Absent means "derive from argv", so an explicit flag locks the selector. */
  explicitDisplayMode?: LinuxDisplayMode | undefined
  gameDisplayMode?: unknown
  detectedGameMode?: LinuxGameDisplayMode | null
  windowingMode?: unknown
  inputBackend?: unknown
  clipboardBackend?: unknown
  shortcutBackend?: unknown
  /** Package-injected facts; callers never supply compositor-specific data. */
  nativeWayland?: boolean
  layerShellCapability?: LinuxLayerShellCapability
}

const DISPLAY_LABEL_KEYS: Record<LinuxDisplayMode, string> = {
  x11: 'settings_linux_mode_x11',
  wayland: 'settings_linux_mode_wayland',
}

const DISPLAY_HINT_KEYS: Record<LinuxDisplayMode, string> = {
  x11: 'settings_linux_mode_x11_hint',
  wayland: 'settings_linux_mode_wayland_hint',
}

const GAME_LABEL_KEYS: Record<LinuxGameDisplayMode, string> = {
  x11: 'settings_linux_game_mode_x11',
  wayland: 'settings_linux_game_mode_wayland',
}

const DESKTOP_LABEL_KEYS: Record<ConcreteLinuxDesktopPreference, string> = {
  'kde-plasma': 'settings_linux_desktop_kde',
  hyprland: 'settings_linux_backend_hyprland',
  niri: 'settings_linux_desktop_niri',
  sway: 'settings_linux_desktop_sway',
  umbriel: 'settings_linux_desktop_umbriel',
}

/** Detection is broader than the selectable profiles. Show a truthful label
 *  even for sessions we do not offer as explicit choices. */
const DESKTOP_DETECTED_LABEL_KEYS: Record<DesktopEnvironment, string> = {
  hyprland: DESKTOP_LABEL_KEYS.hyprland,
  kde: 'settings_linux_desktop_kde',
  niri: DESKTOP_LABEL_KEYS.niri,
  sway: DESKTOP_LABEL_KEYS.sway,
  umbriel: DESKTOP_LABEL_KEYS.umbriel,
  gnome: 'settings_linux_desktop_gnome',
  xfce: 'settings_linux_desktop_xfce',
  wayland: 'settings_linux_mode_wayland',
  x11: 'settings_linux_mode_x11',
  unknown: 'settings_linux_detecting',
}

type ConcreteLinuxWindowingMode = Exclude<PlatformWindowingMode, 'auto'>

const WINDOWING_LABEL_KEYS: Record<ConcreteLinuxWindowingMode, string> = {
  x11: 'settings_linux_backend_portal',
  window: 'settings_linux_backend_window',
  'layer-shell': 'settings_linux_backend_layer_shell',
}

const WINDOWING_HINT_KEYS: Record<ConcreteLinuxWindowingMode, string> = {
  x11: 'settings_linux_backend_desc_portal',
  window: 'settings_linux_backend_desc_window',
  'layer-shell': 'settings_linux_backend_desc_layer_shell',
}

type ConcreteLinuxShortcutBackend = Exclude<LinuxShortcutBackend, 'auto'>
const SHORTCUT_LABEL_KEYS: Record<ConcreteLinuxShortcutBackend, string> = {
  evdev: 'settings_linux_shortcuts_evdev',
  portal: 'settings_linux_shortcuts_portal',
  electron: 'settings_linux_shortcuts_electron',
}
const SHORTCUT_HINT_KEYS: Record<ConcreteLinuxShortcutBackend, string> = {
  evdev: 'settings_linux_shortcuts_desc_evdev',
  portal: 'settings_linux_shortcuts_desc_portal',
  electron: 'settings_linux_shortcuts_desc_electron',
}

type ConcreteLinuxClipboardBackend = Exclude<LinuxClipboardBackend, 'auto'>
const CLIPBOARD_LABEL_KEYS: Record<ConcreteLinuxClipboardBackend, string> = {
  'wl-clipboard': 'settings_linux_clipboard_wl',
  compositor: 'settings_linux_clipboard_compositor',
  native: 'settings_linux_clipboard_native',
}
const CLIPBOARD_HINT_KEYS: Record<ConcreteLinuxClipboardBackend, string> = {
  'wl-clipboard': 'settings_linux_clipboard_desc_wl',
  compositor: 'settings_linux_clipboard_desc_compositor',
  native: 'settings_linux_clipboard_desc_native',
}

type ConcreteLinuxInputBackend = Exclude<LinuxInputBackend, 'auto'>
const INPUT_LABEL_KEYS: Record<ConcreteLinuxInputBackend, string> = {
  uiohook: 'settings_linux_input_uiohook',
  ydotool: 'settings_linux_input_ydotool',
  wtype: 'settings_linux_input_wtype',
  compositor: 'settings_linux_input_compositor',
}
const INPUT_HINT_KEYS: Record<ConcreteLinuxInputBackend, string> = {
  uiohook: 'settings_linux_input_desc_uiohook',
  ydotool: 'settings_linux_input_desc_ydotool',
  wtype: 'settings_linux_input_desc_wtype',
  compositor: 'settings_linux_input_desc_compositor',
}

/** Only named desktops we expose in the selector are confident detections. */
const CONFIDENT_DESKTOP_PREFERENCES = new Set<LinuxDesktopPreference>(DESKTOP_PREFERENCE_IDS)

export function toLinuxGameDisplayModePreference(value: unknown): LinuxGameDisplayModePreference {
  return value === 'auto' || value === 'detect' || value === 'x11' || value === 'wayland' ? value : 'auto'
}

export function toLinuxDesktopPreference(value: unknown): LinuxDesktopPreference {
  if (value === 'kde') return 'kde-plasma'
  if (typeof value === 'string' && (DESKTOP_PREFERENCE_IDS as readonly string[]).includes(value)) {
    return value as ConcreteLinuxDesktopPreference
  }
  // Options removed for now (and legacy values) read as Auto until re-added.
  return 'auto'
}

function desktopPreferenceFromEnvironment(desktop: DesktopEnvironment): LinuxDesktopPreference {
  return toLinuxDesktopPreference(desktop)
}

/** The mode the settings UI shows. An explicit launch flag is authoritative;
 *  an app-managed relaunch flag is not, so a pending saved change is visible (and
 *  Auto follows it) before the restart that applies it. */
function selectedDisplayMode(input: LinuxSettingsInput, env: PlatformEnv): LinuxDisplayMode {
  return (
    input.explicitDisplayMode ?? explicitLinuxDisplayMode(env.argv, env.env) ?? toLinuxDisplayMode(input.displayMode)
  )
}

interface GameModeResolution {
  readonly preference: LinuxGameDisplayModePreference
  readonly detected: LinuxGameDisplayMode | null
  readonly selectedMode: LinuxDisplayMode
  readonly appliedMode: LinuxDisplayMode
  readonly effective: LinuxGameDisplayMode | undefined
  readonly mismatch: boolean
  readonly displayLocked: boolean
}

function gameModeResolution(input: LinuxSettingsInput, env: PlatformEnv, nativeWayland: boolean): GameModeResolution {
  const preference = toLinuxGameDisplayModePreference(input.gameDisplayMode)
  // Native trackers push the authoritative live mode. On native Wayland, X11
  // geometry can belong to a launcher borrowing the game title, so only
  // identity-checked compositor sources count as a confident detection.
  const live = getLinuxGameDisplayModeStatus()
  const trustedLive = live.source === 'x11-geometry' && nativeWayland ? null : live.detected
  const detected = input.detectedGameMode ?? trustedLive ?? null
  const selectedMode = selectedDisplayMode(input, env)
  const appliedMode: LinuxDisplayMode = nativeWayland ? 'wayland' : 'x11'
  const effective =
    preference === 'auto' ? selectedMode : preference === 'detect' ? (detected ?? undefined) : preference
  const warningMode = preference === 'auto' ? selectedMode : appliedMode
  return {
    preference,
    detected,
    selectedMode,
    appliedMode,
    effective,
    mismatch: warningMode === 'x11' && effective === 'wayland',
    displayLocked: Boolean(input.explicitDisplayMode ?? explicitLinuxDisplayMode(env.argv, env.env)),
  }
}

interface DesktopResolution {
  readonly selected: LinuxDesktopPreference
  readonly detected: LinuxDesktopPreference
  readonly resolved: ConcreteLinuxDesktopPreference | undefined
  readonly selectedConcrete: ConcreteLinuxDesktopPreference | undefined
  readonly detectedConcrete: ConcreteLinuxDesktopPreference | undefined
  readonly mismatch: boolean
  readonly selectedLabelKey: string | undefined
  readonly detectedLabelKey: string | undefined
  readonly effectiveLabelKey: string
}

function desktopResolution(input: LinuxSettingsInput, env: PlatformEnv): DesktopResolution {
  const detectedEnvironment = input.detectedDesktop ?? detectDesktopEnvironment(env)
  const detected = desktopPreferenceFromEnvironment(detectedEnvironment)
  const detectedLabelKey = DESKTOP_DETECTED_LABEL_KEYS[detectedEnvironment] ?? 'settings_linux_detecting'
  const selected = toLinuxDesktopPreference(input.desktopEnvironment)
  const effective = selected === 'auto' ? detected : selected
  const resolved = effective === 'auto' ? undefined : effective
  const selectedConcrete = selected === 'auto' ? undefined : selected
  const detectedConcrete = detected === 'auto' ? undefined : detected
  const mismatch =
    selectedConcrete !== undefined &&
    detectedConcrete !== undefined &&
    CONFIDENT_DESKTOP_PREFERENCES.has(detectedConcrete) &&
    selectedConcrete !== detectedConcrete
  return {
    selected,
    detected,
    resolved,
    selectedConcrete,
    detectedConcrete,
    mismatch,
    selectedLabelKey: selectedConcrete ? DESKTOP_LABEL_KEYS[selectedConcrete] : undefined,
    detectedLabelKey,
    effectiveLabelKey: resolved ? DESKTOP_LABEL_KEYS[resolved] : detectedLabelKey,
  }
}

function displaySetting(
  input: LinuxSettingsInput,
  env: PlatformEnv,
  rules: LinuxSettingsRulesResult,
  appliedMode: LinuxDisplayMode,
): PlatformSettingDescriptor {
  const explicit = input.explicitDisplayMode ?? explicitLinuxDisplayMode(env.argv, env.env)
  const saved = toLinuxDisplayMode(input.displayMode)
  const mode = input.explicitDisplayMode ?? appliedMode

  return {
    id: LINUX_SETTING_IDS.displayMode,
    labelKey: 'settings_linux_heading',
    // The selector shows the saved preference, so a change is visible before the
    // restart that applies it. A real launch flag is authoritative and disables it.
    value: selectedDisplayMode(input, env),
    appliedValue: mode,
    options: [
      { id: 'x11', labelKey: DISPLAY_LABEL_KEYS.x11, hintKey: 'settings_linux_mode_x11_hint' },
      { id: 'wayland', labelKey: DISPLAY_LABEL_KEYS.wayland, hintKey: 'settings_linux_mode_wayland_hint' },
    ],
    availability: explicit ? 'disabled' : 'available',
    hintKey: explicit
      ? 'settings_linux_mode_flag_hint'
      : saved !== mode
        ? 'settings_linux_mode_pending_hint'
        : DISPLAY_HINT_KEYS[mode],
    hintParams: explicit || saved !== mode ? { mode } : undefined,
    errorKey: 'settings_linux_mode_error',
    requiresRestart: true,
    effectiveValue: explicit ?? undefined,
    effectiveLabelKey: explicit ? DISPLAY_LABEL_KEYS[explicit] : undefined,
    notices: rules.noticesBySetting[LINUX_SETTING_IDS.displayMode],
  }
}

function gameModeSetting(game: GameModeResolution, rules: LinuxSettingsRulesResult): PlatformSettingDescriptor {
  return {
    id: LINUX_SETTING_IDS.gameDisplayMode,
    labelKey: 'settings_linux_game_mode_heading',
    value: game.preference,
    appliedValue: game.effective ?? undefined,
    options: [
      {
        id: 'auto',
        labelKey: 'settings_linux_game_mode_auto_scalpel',
        hintKey: 'settings_linux_game_mode_auto_hint',
      },
      {
        id: 'detect',
        labelKey: 'settings_linux_game_mode_detect',
        hintKey: 'settings_linux_game_mode_detect_hint',
        effectiveLabelKey: game.detected ? GAME_LABEL_KEYS[game.detected] : 'settings_linux_game_mode_waiting',
      },
      { id: 'x11', labelKey: GAME_LABEL_KEYS.x11, hintKey: 'settings_linux_game_mode_x11_hint' },
      { id: 'wayland', labelKey: GAME_LABEL_KEYS.wayland, hintKey: 'settings_linux_game_mode_wayland_hint' },
    ],
    availability: 'available',
    hintKey:
      game.preference === 'auto'
        ? 'settings_linux_game_mode_auto_hint'
        : game.preference === 'detect'
          ? 'settings_linux_game_mode_detect_hint'
          : game.preference === 'x11'
            ? 'settings_linux_game_mode_x11_hint'
            : 'settings_linux_game_mode_wayland_hint',
    notices: rules.noticesBySetting[LINUX_SETTING_IDS.gameDisplayMode],
    errorKey: 'settings_linux_game_mode_error',
    effectiveValue: game.effective ?? undefined,
    effectiveLabelKey: game.effective
      ? GAME_LABEL_KEYS[game.effective]
      : game.preference === 'detect'
        ? 'settings_linux_game_mode_waiting'
        : undefined,
  }
}

function desktopSetting(desktop: DesktopResolution, rules: LinuxSettingsRulesResult): PlatformSettingDescriptor {
  return {
    id: LINUX_SETTING_IDS.desktopEnvironment,
    labelKey: 'settings_linux_desktop_heading',
    value: desktop.selected,
    options: [
      {
        id: 'auto',
        labelKey: 'settings_linux_game_mode_auto',
        hintKey: 'settings_linux_desktop_hint',
        effectiveLabelKey: desktop.effectiveLabelKey,
      },
      ...DESKTOP_PREFERENCE_IDS.map((id) => ({
        id,
        labelKey: DESKTOP_LABEL_KEYS[id],
        hintKey: 'settings_linux_desktop_hint',
      })),
    ],
    availability: 'available',
    hintKey: 'settings_linux_desktop_hint',
    appliedValue: desktop.resolved,
    notices: rules.noticesBySetting[LINUX_SETTING_IDS.desktopEnvironment],
    errorKey: 'settings_linux_backend_error',
    effectiveValue: desktop.resolved,
    effectiveLabelKey: desktop.effectiveLabelKey,
  }
}

/** The overlay path preference. `platformDisplayMode` remains authoritative:
 *  incompatibilities and defaults come from the editable rules map, never from
 *  forced Ozone flags or compositor-specific code in the host app. */
function shortcutSetting(
  preference: LinuxShortcutBackend,
  resolved: ConcreteLinuxShortcutBackend,
  auto: ConcreteLinuxShortcutBackend,
  rules: LinuxSettingsRulesResult,
): PlatformSettingDescriptor {
  return {
    id: LINUX_SETTING_IDS.shortcutBackend,
    labelKey: 'settings_linux_shortcuts_heading',
    value: preference,
    appliedValue: resolved,
    options: [
      {
        id: 'auto',
        labelKey: 'settings_linux_shortcuts_auto',
        effectiveLabelKey: SHORTCUT_LABEL_KEYS[auto],
      },
      { id: 'evdev', labelKey: SHORTCUT_LABEL_KEYS.evdev, hintKey: SHORTCUT_HINT_KEYS.evdev },
      { id: 'portal', labelKey: SHORTCUT_LABEL_KEYS.portal, hintKey: SHORTCUT_HINT_KEYS.portal },
      { id: 'electron', labelKey: SHORTCUT_LABEL_KEYS.electron, hintKey: SHORTCUT_HINT_KEYS.electron },
    ],
    availability: 'available',
    hintKey: preference === 'auto' ? undefined : SHORTCUT_HINT_KEYS[preference],
    notices: rules.noticesBySetting[LINUX_SETTING_IDS.shortcutBackend],
    errorKey: 'settings_linux_backend_error',
    requiresRestart: true,
    effectiveValue: resolved,
    effectiveLabelKey: SHORTCUT_LABEL_KEYS[resolved],
  }
}

export function resolveLinuxClipboardBackend(
  preference: LinuxClipboardBackend,
  nativeWayland: boolean,
  compositorAvailable = false,
): ConcreteLinuxClipboardBackend {
  if (preference !== 'auto') return preference
  if (nativeWayland && compositorAvailable) return 'compositor'
  return nativeWayland ? 'wl-clipboard' : 'native'
}

function clipboardSetting(
  preference: LinuxClipboardBackend,
  resolved: ConcreteLinuxClipboardBackend,
  auto: ConcreteLinuxClipboardBackend,
  rules: LinuxSettingsRulesResult,
): PlatformSettingDescriptor {
  return {
    id: LINUX_SETTING_IDS.clipboardBackend,
    labelKey: 'settings_linux_clipboard_heading',
    value: preference,
    appliedValue: resolved,
    options: [
      {
        id: 'auto',
        labelKey: 'settings_linux_clipboard_auto',
        effectiveLabelKey: CLIPBOARD_LABEL_KEYS[auto],
      },
      {
        id: 'wl-clipboard',
        labelKey: CLIPBOARD_LABEL_KEYS['wl-clipboard'],
        hintKey: CLIPBOARD_HINT_KEYS['wl-clipboard'],
      },
      {
        id: 'compositor',
        labelKey: CLIPBOARD_LABEL_KEYS.compositor,
        hintKey: CLIPBOARD_HINT_KEYS.compositor,
      },
      { id: 'native', labelKey: CLIPBOARD_LABEL_KEYS.native, hintKey: CLIPBOARD_HINT_KEYS.native },
    ],
    availability: 'available',
    hintKey: preference === 'auto' ? undefined : CLIPBOARD_HINT_KEYS[preference],
    notices: rules.noticesBySetting[LINUX_SETTING_IDS.clipboardBackend],
    errorKey: 'settings_linux_backend_error',
    effectiveValue: resolved,
    effectiveLabelKey: CLIPBOARD_LABEL_KEYS[resolved],
  }
}

export function resolveLinuxInputBackend(
  preference: LinuxInputBackend,
  nativeWayland: boolean,
): ConcreteLinuxInputBackend {
  if (preference !== 'auto') return preference
  if (!nativeWayland) return 'uiohook'
  // On native Wayland, prefer a working external injection tool. The runtime
  // falls back to uIOhook when no tool is available.
  return preferredTool('auto') ?? 'uiohook'
}

function inputSetting(
  preference: LinuxInputBackend,
  resolved: ConcreteLinuxInputBackend,
  auto: ConcreteLinuxInputBackend,
  rules: LinuxSettingsRulesResult,
): PlatformSettingDescriptor {
  return {
    id: LINUX_SETTING_IDS.inputBackend,
    labelKey: 'settings_linux_input_heading',
    value: preference,
    appliedValue: resolved,
    options: [
      { id: 'auto', labelKey: 'settings_linux_input_auto', effectiveLabelKey: INPUT_LABEL_KEYS[auto] },
      { id: 'uiohook', labelKey: INPUT_LABEL_KEYS.uiohook, hintKey: INPUT_HINT_KEYS.uiohook },
      { id: 'ydotool', labelKey: INPUT_LABEL_KEYS.ydotool, hintKey: INPUT_HINT_KEYS.ydotool },
      { id: 'wtype', labelKey: INPUT_LABEL_KEYS.wtype, hintKey: INPUT_HINT_KEYS.wtype },
      { id: 'compositor', labelKey: INPUT_LABEL_KEYS.compositor, hintKey: INPUT_HINT_KEYS.compositor },
    ],
    availability: 'available',
    hintKey: preference === 'auto' ? undefined : INPUT_HINT_KEYS[preference],
    notices: rules.noticesBySetting[LINUX_SETTING_IDS.inputBackend],
    errorKey: 'settings_linux_backend_error',
    effectiveValue: resolved,
    effectiveLabelKey: INPUT_LABEL_KEYS[resolved],
  }
}

function windowingSetting(
  preference: PlatformWindowingMode,
  resolved: LinuxWindowingResolution,
  auto: LinuxWindowingResolution,
  rules: LinuxSettingsRulesResult,
): PlatformSettingDescriptor {
  return {
    id: LINUX_SETTING_IDS.windowingMode,
    labelKey: 'settings_linux_windowing_heading',
    value: preference,
    appliedValue: resolved.mode,
    options: [
      {
        id: 'auto',
        labelKey: 'settings_linux_backend_auto',
        effectiveLabelKey: WINDOWING_LABEL_KEYS[auto.mode],
      },
      { id: 'x11', labelKey: WINDOWING_LABEL_KEYS.x11, hintKey: WINDOWING_HINT_KEYS.x11 },
      { id: 'window', labelKey: WINDOWING_LABEL_KEYS.window, hintKey: WINDOWING_HINT_KEYS.window },
      {
        id: 'layer-shell',
        labelKey: WINDOWING_LABEL_KEYS['layer-shell'],
        hintKey: WINDOWING_HINT_KEYS['layer-shell'],
      },
    ],
    availability: 'available',
    hintKey: preference === 'auto' ? undefined : WINDOWING_HINT_KEYS[preference],
    notices: rules.noticesBySetting[LINUX_SETTING_IDS.windowingMode],
    errorKey: 'settings_linux_backend_error',
    requiresRestart: true,
    effectiveValue: resolved.mode,
    effectiveLabelKey: WINDOWING_LABEL_KEYS[resolved.mode],
  }
}

/** Builds the data for the Linux tab. All choices are made here, inside the
 *  package; the renderer receives plain descriptors and never probes the OS. */
export function linuxSettingsView(input: LinuxSettingsInput = {}): PlatformSettingsView {
  const env = input.env ?? currentEnv()
  const os = input.os ?? detectOperatingSystem(env)
  if (os !== 'linux') return { available: false, sections: [] }

  const nativeWayland = input.nativeWayland ?? isNativeWayland(env.argv)
  // Capability and compatibility facts follow the display server this process
  // is actually running, not a saved-but-not-yet-applied display preference.
  const activeDisplayMode: LinuxDisplayMode = nativeWayland ? 'wayland' : 'x11'
  const game = gameModeResolution(input, env, nativeWayland)
  const desktop = desktopResolution(input, env)
  const nativeOverlay = nativeOverlayActive()
  const compositorClipboardAvailable = nativeWayland && linuxCompositorClipboardAvailable()
  const capability = input.layerShellCapability ?? defaultLinuxLayerShellCapability()
  const windowingPreference = toLinuxWindowingMode(input.windowingMode)
  const detectedEnvironment = input.detectedDesktop ?? detectDesktopEnvironment(env)

  const inputPreference = toLinuxInputBackend(input.inputBackend)
  const clipboardPreference = toLinuxClipboardBackend(input.clipboardBackend)
  const shortcutPreference = toLinuxShortcutBackend(input.shortcutBackend)

  // Auto is a best guess derived once from environment detection: the desktop
  // defaults map plus live capability facts. Explicit selections always win,
  // and the user can override any selector — incompatible combinations then
  // surface as inline warnings from the rules below.
  const desktopDefaults = linuxDesktopDefaults(desktop.selected === 'auto' ? detectedEnvironment : desktop.selected)
  const suggestedMode = toLinuxWindowingMode(desktopDefaults.windowingMode)
  // Only claim "this desktop supports the native overlay" where a layer-shell
  // path actually exists. GNOME is in the defaults map but has no
  // wlr-layer-shell, so it must not get the X11 switch nudge.
  const effectiveDesktopKey = desktop.selected === 'auto' ? detectedEnvironment : desktop.selected
  const desktopSuggestsLayerShell =
    suggestedMode === 'layer-shell' &&
    ['kde-plasma', 'kde', 'hyprland', 'niri', 'sway', 'umbriel', 'wayland'].includes(effectiveDesktopKey)
  const windowingFacts: LinuxWindowingFacts = {
    displayMode: activeDisplayMode,
    nativeWayland,
    layerShell: capability,
    defaultMode: suggestedMode === 'auto' ? undefined : suggestedMode,
  }
  const resolved = resolveLinuxWindowingMode(windowingPreference, windowingFacts)
  const auto = resolveLinuxWindowingMode('auto', windowingFacts)

  const suggestedShortcut = toLinuxShortcutBackend(desktopDefaults.shortcutBackend)
  const shortcutFacts = {
    nativeWayland,
    nativeOverlay,
    evdevReadable: evdevKeyboardsReadable(),
    defaultBackend: suggestedShortcut === 'auto' ? undefined : suggestedShortcut,
  }
  const shortcutResolved = resolveLinuxShortcutBackend(shortcutPreference, shortcutFacts)
  const shortcutAuto = resolveLinuxShortcutBackend('auto', shortcutFacts)

  const clipboardResolved = resolveLinuxClipboardBackend(
    clipboardPreference,
    nativeWayland,
    compositorClipboardAvailable,
  )
  const clipboardAuto = resolveLinuxClipboardBackend('auto', nativeWayland, compositorClipboardAvailable)
  const inputResolved = resolveLinuxInputBackend(inputPreference, nativeWayland)
  const inputAuto = resolveLinuxInputBackend('auto', nativeWayland)

  // Rules judge effective backends, never the `auto` placeholder: an Auto
  // choice that resolves to a listed value warns exactly like an explicit one.
  // Windowing is the one exception: an explicit layer-shell that the resolver
  // coerces away must still warn, so an explicit choice feeds the requested mode.
  const facts: LinuxSettingsFacts = {
    displayMode: activeDisplayMode,
    gameDisplayMode: game.preference,
    desktopEnvironment: desktop.selected,
    detectedDesktopEnvironment: detectedEnvironment,
    windowingMode: windowingPreference === 'auto' ? resolved.mode : windowingPreference,
    inputBackend: inputResolved,
    clipboardBackend: clipboardResolved,
    shortcutBackend: shortcutResolved,
    nativeWayland,
    nativeOverlay,
    portalUnavailable: portalShortcutsUnavailable(),
    layerShellAvailable: capability.available,
    layerShellReasonKey: capability.reasonKey,
    desktopSuggestsLayerShell,
    displayLocked: game.displayLocked,
    gameModeMismatch: game.mismatch,
    desktopMismatch: desktop.mismatch,
    selectedDesktopLabelKey: desktop.selectedLabelKey,
    detectedDesktopLabelKey: desktop.detectedLabelKey,
  }
  const rules = evaluateLinuxSettingsRules(facts)

  const primary: PlatformSettingsSection = {
    id: 'display',
    settings: [displaySetting(input, env, rules, activeDisplayMode), gameModeSetting(game, rules)],
  }

  const advanced: PlatformSettingsSection = {
    id: 'advanced',
    labelKey: 'settings_linux_advanced',
    collapsed: true,
    settings: [
      desktopSetting(desktop, rules),
      windowingSetting(windowingPreference, resolved, auto, rules),
      inputSetting(inputPreference, inputResolved, inputAuto, rules),
      clipboardSetting(clipboardPreference, clipboardResolved, clipboardAuto, rules),
      shortcutSetting(shortcutPreference, shortcutResolved, shortcutAuto, rules),
    ],
  }

  return {
    available: true,
    sections: [primary, advanced],
    optionValueLabelKey: 'settings_linux_option_value',
    restartNoticeKey: 'settings_linux_restart_notice',
  }
}
