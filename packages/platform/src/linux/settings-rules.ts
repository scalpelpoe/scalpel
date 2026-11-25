import { PLATFORM_SETTING_IDS } from '../common/platform-settings'
import type {
  PlatformClipboardBackend,
  PlatformDesktopPreference,
  PlatformDisplayMode,
  PlatformGameDisplayModePreference,
  PlatformInputBackend,
  PlatformSettingNotice,
  PlatformShortcutBackend,
  PlatformWindowingMode,
} from '../common/platform-settings'
import { LINUX_SETTINGS_RULES, linuxDesktopDefaults } from './settings-rules-map'

export { linuxDesktopDefaults }

export type LinuxSettingKey =
  | 'displayMode'
  | 'gameDisplayMode'
  | 'desktopEnvironment'
  | 'windowingMode'
  | 'inputBackend'
  | 'clipboardBackend'
  | 'shortcutBackend'

/** Detected desktops include session names that are not offered as choices. */
export type LinuxDesktopKey = PlatformDesktopPreference | 'kde' | 'gnome' | 'xfce' | 'wayland' | 'x11' | 'unknown'

export type LinuxSettingsFactKey =
  | LinuxSettingKey
  | 'detectedDesktopEnvironment'
  | 'nativeWayland'
  | 'nativeOverlay'
  | 'portalUnavailable'
  | 'layerShellAvailable'
  | 'layerShellReasonKey'
  | 'desktopSuggestsLayerShell'
  | 'displayLocked'
  | 'gameModeMismatch'
  | 'desktopMismatch'
  | 'selectedDesktopLabelKey'
  | 'detectedDesktopLabelKey'

export type LinuxSettingsFactValue = string | boolean

export interface LinuxSettingsFacts {
  readonly displayMode: PlatformDisplayMode
  readonly gameDisplayMode: PlatformGameDisplayModePreference
  readonly desktopEnvironment: PlatformDesktopPreference
  readonly detectedDesktopEnvironment: LinuxDesktopKey
  readonly windowingMode: PlatformWindowingMode
  readonly inputBackend: PlatformInputBackend
  readonly clipboardBackend: PlatformClipboardBackend
  readonly shortcutBackend: PlatformShortcutBackend
  readonly nativeWayland: boolean
  readonly nativeOverlay: boolean
  readonly portalUnavailable: boolean
  readonly layerShellAvailable: boolean
  readonly layerShellReasonKey?: string
  /** This desktop's Auto profile prefers layer-shell (so X11 leaves it unused). */
  readonly desktopSuggestsLayerShell: boolean
  readonly displayLocked: boolean
  readonly gameModeMismatch: boolean
  readonly desktopMismatch: boolean
  readonly selectedDesktopLabelKey?: string
  readonly detectedDesktopLabelKey?: string
}

/** Values in a field are OR; different fields are AND. `not` is an AND-exclusion
 *  used to keep two rules from firing for the same combination. */
export type LinuxSettingsCondition = Partial<Record<LinuxSettingsFactKey, readonly LinuxSettingsFactValue[]>>

export interface LinuxSettingsNoticeRule {
  readonly id: string
  readonly when: LinuxSettingsCondition
  readonly not?: LinuxSettingsCondition
  readonly settingId: LinuxSettingKey
  readonly notice: PlatformSettingNotice
  /** Copy live fact values into message params, e.g. label keys or reasons. */
  readonly paramsFromFacts?: Readonly<Record<string, LinuxSettingsFactKey>>
}

/** One desktop's Auto defaults, e.g. `{ windowingMode: 'layer-shell' }`. */
export type LinuxDesktopDefaults = Partial<Record<LinuxSettingKey, string>>
export type LinuxSettingsDefaults = Partial<Record<LinuxDesktopKey, LinuxDesktopDefaults>>

export interface LinuxSettingsRulesResult {
  readonly noticesBySetting: Partial<Record<LinuxSettingKey, PlatformSettingNotice[]>>
  readonly defaultsBySetting: Partial<Record<LinuxSettingKey, string>>
}

export type { LinuxSettingsDefaults as LinuxSettingsDefaultMap, LinuxSettingsNoticeRule as LinuxSettingsRule }

function matches(
  values: Record<string, LinuxSettingsFactValue | undefined>,
  condition?: LinuxSettingsCondition,
): boolean {
  if (!condition) return true
  return Object.entries(condition).every(([key, allowed]) => {
    const actual = values[key]
    return actual !== undefined && (allowed as readonly LinuxSettingsFactValue[]).includes(actual)
  })
}

/** An explicit launch flag locks the display selector, so an action that would
 *  write it must never be offered. Stripping it here once means the editable
 *  map needs no per-rule "-locked" twins. */
function effectiveAction(
  facts: LinuxSettingsFacts,
  action: PlatformSettingNotice['action'],
): PlatformSettingNotice['action'] {
  if (!facts.displayLocked || !action) return action
  if (action.kind === 'set-setting' && action.settingId === PLATFORM_SETTING_IDS.displayMode) return undefined
  return action
}

/** The only evaluator needed for the editable rule map. It never mutates saved
 *  settings: it derives notices/defaults from the current selection and facts,
 *  so renderer/main still do nothing but render opaque descriptors.
 *
 *  Backend-selector facts must carry the *resolved* value, never the `auto`
 *  placeholder, so a rule lists concrete values only and an Auto choice that
 *  resolves to one of them warns exactly like an explicit selection. */
export function evaluateLinuxSettingsRules(facts: LinuxSettingsFacts): LinuxSettingsRulesResult {
  const values: Record<string, LinuxSettingsFactValue | undefined> = { ...facts }
  const noticesBySetting: Partial<Record<LinuxSettingKey, PlatformSettingNotice[]>> = {}

  for (const rule of LINUX_SETTINGS_RULES) {
    if (!matches(values, rule.when)) continue
    if (rule.not && matches(values, rule.not)) continue

    const params: Record<string, string> = { ...rule.notice.params }
    for (const [param, factKey] of Object.entries(rule.paramsFromFacts ?? {})) {
      const value = facts[factKey as keyof LinuxSettingsFacts]
      if (value !== undefined) params[param] = String(value)
    }

    const notice: PlatformSettingNotice = {
      messageKey: rule.notice.messageKey,
      params: Object.keys(params).length ? params : undefined,
      tone: rule.notice.tone,
      action: effectiveAction(facts, rule.notice.action),
    }
    ;(noticesBySetting[rule.settingId] ??= []).push(notice)
  }

  const effectiveDesktop: LinuxDesktopKey =
    facts.desktopEnvironment === 'auto' ? facts.detectedDesktopEnvironment : facts.desktopEnvironment

  return { noticesBySetting, defaultsBySetting: linuxDesktopDefaults(effectiveDesktop) }
}
