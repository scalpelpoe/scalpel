import { describe, expect, it } from 'vitest'
import { LINUX_SETTINGS_RULES } from './settings-rules-map'
import {
  evaluateLinuxSettingsRules,
  linuxDesktopDefaults,
  type LinuxSettingsFacts,
  type LinuxSettingKey,
} from './settings-rules'

const SETTING_KEYS: readonly LinuxSettingKey[] = [
  'displayMode',
  'gameDisplayMode',
  'desktopEnvironment',
  'windowingMode',
  'inputBackend',
  'clipboardBackend',
  'shortcutBackend',
]

const facts = (overrides: Partial<LinuxSettingsFacts> = {}): LinuxSettingsFacts => ({
  displayMode: 'x11',
  gameDisplayMode: 'auto',
  desktopEnvironment: 'auto',
  detectedDesktopEnvironment: 'unknown',
  windowingMode: 'auto',
  inputBackend: 'auto',
  clipboardBackend: 'auto',
  shortcutBackend: 'auto',
  nativeWayland: false,
  nativeOverlay: false,
  portalUnavailable: false,
  layerShellAvailable: false,
  desktopSuggestsLayerShell: false,
  displayLocked: false,
  gameModeMismatch: false,
  desktopMismatch: false,
  ...overrides,
})

describe('Linux settings rules', () => {
  it('provides defaults from the selected desktop, then the detected one', () => {
    expect(evaluateLinuxSettingsRules(facts({ desktopEnvironment: 'sway' })).defaultsBySetting).toEqual({
      windowingMode: 'layer-shell',
    })
    expect(evaluateLinuxSettingsRules(facts({ detectedDesktopEnvironment: 'xfce' })).defaultsBySetting).toEqual({
      windowingMode: 'x11',
    })
    expect(evaluateLinuxSettingsRules(facts({ detectedDesktopEnvironment: 'niri' })).defaultsBySetting).toEqual({
      windowingMode: 'layer-shell',
      shortcutBackend: 'evdev',
    })
    expect(
      evaluateLinuxSettingsRules(facts({ desktopEnvironment: 'hyprland', detectedDesktopEnvironment: 'xfce' }))
        .defaultsBySetting,
    ).toEqual({ windowingMode: 'layer-shell' })
    expect(evaluateLinuxSettingsRules(facts({ detectedDesktopEnvironment: 'kde' })).defaultsBySetting).toEqual({
      windowingMode: 'layer-shell',
    })
    expect(evaluateLinuxSettingsRules(facts()).defaultsBySetting).toEqual({})
  })

  it('nudges an X11 user toward Wayland only when the desktop prefers layer shell', () => {
    const suggested = evaluateLinuxSettingsRules(facts({ displayMode: 'x11', desktopSuggestsLayerShell: true }))
    expect(suggested.noticesBySetting.displayMode?.map((notice) => notice.messageKey)).toEqual([
      'settings_linux_display_layer_shell_suggested',
    ])

    // An explicit layer-shell choice already has its own Wayland warning.
    const explicit = evaluateLinuxSettingsRules(
      facts({ displayMode: 'x11', desktopSuggestsLayerShell: true, windowingMode: 'layer-shell' }),
    )
    expect(explicit.noticesBySetting.displayMode).toBeUndefined()

    expect(
      evaluateLinuxSettingsRules(facts({ displayMode: 'x11', desktopSuggestsLayerShell: false })).noticesBySetting
        .displayMode,
    ).toBeUndefined()
  })

  it('matches every field as AND and every value within a field as OR', () => {
    const mismatch = facts({ gameModeMismatch: true, displayLocked: false })
    expect(
      evaluateLinuxSettingsRules(mismatch).noticesBySetting.gameDisplayMode?.map((notice) => notice.messageKey),
    ).toEqual(['settings_linux_game_mode_mismatch'])

    const locked = evaluateLinuxSettingsRules({ ...mismatch, displayLocked: true })
    expect(locked.noticesBySetting.gameDisplayMode?.[0]?.action).toBeUndefined()
    expect(evaluateLinuxSettingsRules({ ...mismatch, gameModeMismatch: false }).noticesBySetting).toEqual({})
  })

  it('uses `not` so the Wayland and unavailable notices never stack for the same state', () => {
    const result = evaluateLinuxSettingsRules(
      facts({ windowingMode: 'layer-shell', displayMode: 'x11', layerShellAvailable: false }),
    )
    expect(result.noticesBySetting.windowingMode?.map((notice) => notice.messageKey)).toEqual([
      'settings_linux_windowing_wayland_required',
    ])
  })

  it('copies live facts into message params without translating them', () => {
    const desktop = evaluateLinuxSettingsRules(
      facts({
        desktopMismatch: true,
        selectedDesktopLabelKey: 'settings_linux_desktop_kde',
        detectedDesktopLabelKey: 'settings_linux_backend_hyprland',
      }),
    )
    expect(desktop.noticesBySetting.desktopEnvironment?.[0]?.params).toEqual({
      selectedLabelKey: 'settings_linux_desktop_kde',
      detectedLabelKey: 'settings_linux_backend_hyprland',
    })

    const fallback = evaluateLinuxSettingsRules(
      facts({
        windowingMode: 'layer-shell',
        displayMode: 'wayland',
        layerShellAvailable: false,
        layerShellReasonKey: 'settings_linux_unavailable_hint',
      }),
    )
    expect(fallback.noticesBySetting.windowingMode?.[0]?.params).toEqual({
      reasonLabelKey: 'settings_linux_unavailable_hint',
    })
  })

  it('keeps the editable map well formed: unique ids, known facts/settings and message keys only', () => {
    const ids = LINUX_SETTINGS_RULES.map((rule) => rule.id)
    expect(new Set(ids).size).toBe(ids.length)

    const factKeys = new Set(Object.keys(facts()))
    for (const rule of LINUX_SETTINGS_RULES) {
      expect(SETTING_KEYS).toContain(rule.settingId)
      expect(rule.notice.messageKey).toMatch(/^settings_/)
      if (rule.notice.action) expect(rule.notice.action.labelKey).toMatch(/^(settings|common)_/)

      for (const condition of [rule.when, rule.not]) {
        for (const [key, values] of Object.entries(condition ?? {})) {
          // Conditions may only reference known facts...
          expect(factKeys).toContain(key)
          // ...and never the `auto` placeholder: rules judge resolved values.
          if (SETTING_KEYS.includes(key as LinuxSettingKey)) {
            expect(values).not.toContain('auto')
          }
        }
      }
    }
    expect(linuxDesktopDefaults('hyprland').windowingMode).toBe('layer-shell')
  })

  it('exposes the desktop defaults through one accessor shared with boot', () => {
    expect(linuxDesktopDefaults('niri')).toEqual({ windowingMode: 'layer-shell', shortcutBackend: 'evdev' })
    expect(linuxDesktopDefaults('xfce')).toEqual({ windowingMode: 'x11' })
    expect(linuxDesktopDefaults('unknown')).toEqual({})
    expect(linuxDesktopDefaults('auto')).toEqual({})
  })

  it('strips display-mode actions on every matrix rule while the selector is locked', () => {
    const unlocked = evaluateLinuxSettingsRules(
      facts({ inputBackend: 'ydotool', displayMode: 'x11', displayLocked: false }),
    )
    expect(unlocked.noticesBySetting.inputBackend?.[0]?.action?.kind).toBe('set-setting')

    const locked = evaluateLinuxSettingsRules(
      facts({ inputBackend: 'ydotool', displayMode: 'x11', displayLocked: true }),
    )
    expect(locked.noticesBySetting.inputBackend?.[0]?.messageKey).toBe('settings_linux_input_wayland_required')
    expect(locked.noticesBySetting.inputBackend?.[0]?.action).toBeUndefined()

    // Actions on other settings are kept even while the display is locked.
    const fallback = evaluateLinuxSettingsRules(
      facts({
        windowingMode: 'layer-shell',
        displayMode: 'wayland',
        layerShellAvailable: false,
        displayLocked: true,
      }),
    )
    expect(fallback.noticesBySetting.windowingMode?.[0]?.action?.kind).toBe('set-setting')
  })

  it('warns when portal shortcuts are selected on X11', () => {
    const result = evaluateLinuxSettingsRules(
      facts({ shortcutBackend: 'portal', displayMode: 'x11', displayLocked: false }),
    )
    expect(result.noticesBySetting.shortcutBackend?.[0]?.messageKey).toBe('settings_linux_shortcuts_wayland_required')
    expect(result.noticesBySetting.shortcutBackend?.[0]?.action?.kind).toBe('set-setting')

    const locked = evaluateLinuxSettingsRules(
      facts({ shortcutBackend: 'portal', displayMode: 'x11', displayLocked: true }),
    )
    expect(locked.noticesBySetting.shortcutBackend?.[0]?.action).toBeUndefined()
  })

  it('warns that evdev shortcuts are observation-only without a native host', () => {
    const warning = evaluateLinuxSettingsRules(
      facts({ shortcutBackend: 'evdev', nativeWayland: true, nativeOverlay: false }),
    )
    expect(warning.noticesBySetting.shortcutBackend?.[0]?.messageKey).toBe('settings_linux_shortcuts_evdev_unavailable')

    const native = evaluateLinuxSettingsRules(
      facts({ shortcutBackend: 'evdev', nativeWayland: true, nativeOverlay: true }),
    )
    expect(native.noticesBySetting.shortcutBackend).toBeUndefined()

    const x11 = evaluateLinuxSettingsRules(facts({ shortcutBackend: 'evdev' }))
    expect(x11.noticesBySetting.shortcutBackend).toBeUndefined()
  })

  it('warns when the effective shortcut backend is a portal that cannot bind', () => {
    const warning = evaluateLinuxSettingsRules(
      facts({ shortcutBackend: 'portal', displayMode: 'wayland', nativeWayland: true, portalUnavailable: true }),
    )
    expect(warning.noticesBySetting.shortcutBackend?.[0]?.messageKey).toBe(
      'settings_linux_shortcuts_portal_unavailable',
    )

    const explicitEvdev = evaluateLinuxSettingsRules(
      facts({ shortcutBackend: 'evdev', nativeWayland: true, portalUnavailable: true }),
    )
    expect(explicitEvdev.noticesBySetting.shortcutBackend?.[0]?.messageKey).toBe(
      'settings_linux_shortcuts_evdev_unavailable',
    )
  })

  it('defaults Umbriel to layer shell', () => {
    expect(evaluateLinuxSettingsRules(facts({ detectedDesktopEnvironment: 'umbriel' })).defaultsBySetting).toEqual({
      windowingMode: 'layer-shell',
    })
  })
})
