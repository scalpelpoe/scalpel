import { afterEach, describe, expect, it } from 'vitest'
import {
  capturePlatformStartupValues,
  platformBanners,
  type PlatformSettingDescriptor,
} from '../common/platform-settings'
import type { PlatformEnv } from '../types'
import { MANAGED_OZONE_ENV } from './common/display'
import { __resetLinuxGameDisplayModeForTests, reportLinuxGameDisplayMode } from './common/game-display-mode'
import { __resetLinuxLayerShellCapabilityForTests, setLinuxLayerShellCapability } from './common/layer-shell/windowing'
import {
  linuxSettingsView,
  LINUX_SETTING_IDS,
  resolveLinuxClipboardBackend,
  toLinuxDesktopPreference,
  toLinuxGameDisplayModePreference,
} from './linux-settings'
import { resolveLinuxEffectiveBackendsSnapshot } from './effective-backends'

const env = (vars: Record<string, string> = {}, argv: string[] = ['scalpel']): PlatformEnv => ({
  platform: 'linux',
  env: vars,
  argv,
})

function setting(id: string) {
  const view = linuxSettingsView({ env: env() })
  for (const section of view.sections) {
    const found = section.settings.find((candidate) => candidate.id === id)
    if (found) return found
  }
  throw new Error(`missing setting ${id}`)
}

function noticeKeys(descriptor: PlatformSettingDescriptor): string[] {
  return (descriptor.notices ?? []).map((notice) => notice.messageKey)
}

afterEach(() => {
  __resetLinuxGameDisplayModeForTests()
  __resetLinuxLayerShellCapabilityForTests()
})

describe('linuxSettingsView', () => {
  it('reports unavailable outside Linux', () => {
    expect(linuxSettingsView({ env: { ...env(), platform: 'win32' } })).toEqual({
      available: false,
      sections: [],
    })
  })

  it('keeps the two primary selectors first and moves the desktop selector into advanced', () => {
    const view = linuxSettingsView({ env: env() })
    expect(view.available).toBe(true)
    expect(view.sections.map((section) => section.id)).toEqual(['display', 'advanced'])
    expect(view.sections[0].settings.map((item) => item.id)).toEqual([
      LINUX_SETTING_IDS.displayMode,
      LINUX_SETTING_IDS.gameDisplayMode,
    ])

    const advanced = view.sections[1]
    expect(advanced.collapsed).toBe(true)
    expect(advanced.settings.map((item) => item.id)).toEqual([
      LINUX_SETTING_IDS.desktopEnvironment,
      LINUX_SETTING_IDS.windowingMode,
      LINUX_SETTING_IDS.inputBackend,
      LINUX_SETTING_IDS.clipboardBackend,
      LINUX_SETTING_IDS.shortcutBackend,
    ])
    const desktop = advanced.settings[0]
    expect(desktop.value).toBe('auto')
    expect(desktop.requiresRestart).not.toBe(true)

    const windowing = advanced.settings[1]
    expect(windowing.availability).toBe('available')
    expect(windowing.requiresRestart).toBe(true)
    expect(windowing.options.map((option) => option.id)).toEqual(['auto', 'x11', 'window', 'layer-shell'])

    const input = advanced.settings[2]
    expect(input.availability).toBe('available')
    expect(input.requiresRestart).not.toBe(true)
    expect(input.options.map((option) => option.id)).toEqual(['auto', 'uiohook', 'ydotool', 'wtype', 'compositor'])

    const clipboard = advanced.settings[3]
    expect(clipboard.availability).toBe('available')
    expect(clipboard.requiresRestart).not.toBe(true)
    expect(clipboard.options.map((option) => option.id)).toEqual(['auto', 'wl-clipboard', 'compositor', 'native'])

    const shortcut = advanced.settings[4]
    expect(shortcut.availability).toBe('available')
    expect(shortcut.requiresRestart).toBe(true)
    expect(shortcut.options.map((option) => option.id)).toEqual(['auto', 'evdev', 'portal', 'electron'])
  })

  it('disables the display selector when an explicit Ozone flag is present', () => {
    const display = linuxSettingsView({
      env: env({}, ['scalpel', '--ozone-platform=wayland']),
    }).sections[0].settings[0]

    expect(display.value).toBe('wayland')
    expect(display.availability).toBe('disabled')
    expect(display.hintKey).toBe('settings_linux_mode_flag_hint')
    expect(display.hintParams).toEqual({ mode: 'wayland' })
    expect(display.requiresRestart).toBe(true)
  })

  it('makes Auto follow the selected display mode immediately', () => {
    expect(toLinuxGameDisplayModePreference('detect')).toBe('detect')

    const auto = linuxSettingsView({ env: env(), displayMode: 'x11' }).sections[0].settings[1]
    expect(auto.value).toBe('auto')
    expect(auto.effectiveValue).toBe('x11')
    expect(auto.options[0].labelKey).toBe('settings_linux_game_mode_auto_scalpel')
    expect(auto.options[0].effectiveLabelKey).toBeUndefined()
    expect(auto.hintKey).toBe('settings_linux_game_mode_auto_hint')
    expect(noticeKeys(auto)).toEqual([])

    // A saved change is shown before the restart that applies it, so Auto must
    // already read Wayland instead of waiting for the running Ozone mode.
    const pending = linuxSettingsView({
      env: env({ [MANAGED_OZONE_ENV]: '1' }, ['scalpel', '--ozone-platform=x11']),
      displayMode: 'wayland',
      detectedGameMode: 'x11',
    }).sections[0].settings[1]
    expect(pending.effectiveValue).toBe('wayland')
    expect(pending.options[0].effectiveLabelKey).toBeUndefined()
    expect(noticeKeys(pending)).toEqual([])

    const detecting = linuxSettingsView({
      env: env(),
      displayMode: 'x11',
      gameDisplayMode: 'detect',
    }).sections[0].settings[1]
    expect(detecting.effectiveValue).toBeUndefined()
    expect(detecting.effectiveLabelKey).toBe('settings_linux_game_mode_waiting')
    expect(detecting.hintParams).toBeUndefined()
    expect(detecting.options[1].effectiveLabelKey).toBe('settings_linux_game_mode_waiting')
    expect(noticeKeys(detecting)).toEqual([])

    const detected = linuxSettingsView({
      env: env(),
      displayMode: 'x11',
      detectedGameMode: 'wayland',
      gameDisplayMode: 'detect',
    }).sections[0].settings[1]
    expect(detected.effectiveValue).toBe('wayland')
    expect(detected.hintParams).toBeUndefined()
    expect(detected.options[1].effectiveLabelKey).toBe('settings_linux_game_mode_wayland')
    expect(noticeKeys(detected)).toEqual(['settings_linux_game_mode_mismatch'])

    const overridden = linuxSettingsView({
      env: env(),
      displayMode: 'x11',
      detectedGameMode: 'wayland',
      gameDisplayMode: 'x11',
    }).sections[0].settings[1]
    expect(overridden.effectiveValue).toBe('x11')
    expect(noticeKeys(overridden)).toEqual([])

    // An explicit launch flag is authoritative for the selector and Auto.
    const explicitWayland = linuxSettingsView({
      env: env({}, ['scalpel', '--ozone-platform=wayland']),
      displayMode: 'x11',
      detectedGameMode: 'wayland',
    }).sections[0].settings[1]
    expect(explicitWayland.effectiveValue).toBe('wayland')
    expect(noticeKeys(explicitWayland)).toEqual([])

    const explicitX11 = linuxSettingsView({
      env: env({}, ['scalpel', '--ozone-platform=x11']),
      displayMode: 'wayland',
    }).sections[0].settings[1]
    expect(explicitX11.effectiveValue).toBe('x11')
    expect(explicitX11.options[0].labelKey).toBe('settings_linux_game_mode_auto_scalpel')
    expect(explicitX11.options[0].effectiveLabelKey).toBeUndefined()
    expect(noticeKeys(explicitX11)).toEqual([])
  })

  it('uses a managed Ozone flag without locking the selector', () => {
    const settings = linuxSettingsView({
      env: env({ [MANAGED_OZONE_ENV]: '1' }, ['scalpel', '--ozone-platform=wayland']),
      displayMode: 'wayland',
      detectedGameMode: 'wayland',
    }).sections[0].settings

    expect(settings[0].value).toBe('wayland')
    expect(settings[0].availability).toBe('available')
    expect(noticeKeys(settings[1])).toEqual([])
  })

  it('keeps the display switch action inline while the applied mode is still pending', () => {
    const view = linuxSettingsView({
      env: env({ [MANAGED_OZONE_ENV]: '1' }, ['scalpel', '--ozone-platform=x11']),
      displayMode: 'wayland',
      detectedGameMode: 'wayland',
      gameDisplayMode: 'detect',
    })

    const display = view.sections[0].settings[0]
    expect(display.value).toBe('wayland')
    expect(display.appliedValue).toBe('x11')
    expect(display.availability).toBe('available')
    expect(display.hintKey).toBe('settings_linux_mode_pending_hint')
    expect(display.hintParams).toEqual({ mode: 'x11' })

    const game = view.sections[0].settings[1]
    expect(game.value).toBe('detect')
    expect(game.notices).toEqual([
      {
        messageKey: 'settings_linux_game_mode_mismatch',
        params: undefined,
        tone: 'warn',
        action: {
          kind: 'set-setting',
          labelKey: 'settings_linux_game_mode_switch_wayland',
          settingId: LINUX_SETTING_IDS.displayMode,
          value: 'wayland',
        },
      },
    ])
    expect(platformBanners(view, {})).toEqual([])
    expect(view.optionValueLabelKey).toBe('settings_linux_option_value')
    expect(view.restartNoticeKey).toBe('settings_linux_restart_notice')
  })

  it('does not offer the display switch action when a launch flag controls the mode', () => {
    const game = linuxSettingsView({
      env: env({}, ['scalpel', '--ozone-platform=x11']),
      detectedGameMode: 'wayland',
      gameDisplayMode: 'detect',
    }).sections[0].settings[1]

    expect(noticeKeys(game)).toEqual(['settings_linux_game_mode_mismatch'])
    expect(game.notices?.[0]?.action).toBeUndefined()
  })

  it('offers only the supported desktop environments and applies them without a restart', () => {
    expect(toLinuxDesktopPreference('gnome')).toBe('auto')
    expect(toLinuxDesktopPreference('sway')).toBe('sway')

    const auto = setting(LINUX_SETTING_IDS.desktopEnvironment)
    expect(auto.value).toBe('auto')
    expect(auto.effectiveLabelKey).toBe('settings_linux_detecting')
    expect(auto.requiresRestart).toBeUndefined()
    expect(auto.options.map((option) => option.id)).toEqual([
      'auto',
      'kde-plasma',
      'hyprland',
      'niri',
      'sway',
      'umbriel',
    ])

    const hyprland = linuxSettingsView({
      env: env({ HYPRLAND_INSTANCE_SIGNATURE: 'abc' }),
    }).sections[1].settings[0]
    expect(hyprland.effectiveValue).toBe('hyprland')
    expect(hyprland.options[0].effectiveLabelKey).toBe('settings_linux_backend_hyprland')
    expect(noticeKeys(hyprland)).toEqual([])

    const niri = linuxSettingsView({ env: env({ NIRI_SOCKET: '/run/niri.sock' }) }).sections[1].settings[0]
    expect(niri.effectiveValue).toBe('niri')
    expect(niri.effectiveLabelKey).toBe('settings_linux_desktop_niri')

    const sway = linuxSettingsView({ env: env({ SWAYSOCK: '/run/sway.sock' }) }).sections[1].settings[0]
    expect(sway.effectiveValue).toBe('sway')
    expect(sway.effectiveLabelKey).toBe('settings_linux_desktop_sway')

    const conflict = linuxSettingsView({
      env: env({ HYPRLAND_INSTANCE_SIGNATURE: 'abc' }),
      desktopEnvironment: 'kde-plasma',
    }).sections[1].settings[0]
    expect(noticeKeys(conflict)).toEqual(['settings_linux_desktop_mismatch'])
    expect(conflict.notices?.[0]?.params).toEqual({
      selectedLabelKey: 'settings_linux_desktop_kde',
      detectedLabelKey: 'settings_linux_backend_hyprland',
    })

    const genericSession = linuxSettingsView({
      env: env({ WAYLAND_DISPLAY: 'wayland-1' }),
      desktopEnvironment: 'hyprland',
    }).sections[1].settings[0]
    expect(noticeKeys(genericSession)).toEqual([])
  })

  it('shows detected Umbriel and generic sessions instead of a perpetual detecting state', () => {
    const umbriel = linuxSettingsView({ env: env({ XDG_CURRENT_DESKTOP: 'umbriel' }) }).sections[1].settings[0]
    expect(umbriel).toMatchObject({
      effectiveValue: 'umbriel',
      effectiveLabelKey: 'settings_linux_desktop_umbriel',
      errorKey: 'settings_linux_backend_error',
    })
    expect(noticeKeys(umbriel)).toEqual([])

    const wayland = linuxSettingsView({ env: env({ WAYLAND_DISPLAY: 'wayland-1' }) }).sections[1].settings[0]
    expect(wayland.effectiveLabelKey).toBe('settings_linux_mode_wayland')

    const x11 = linuxSettingsView({ env: env({ DISPLAY: ':0' }) }).sections[1].settings[0]
    expect(x11.effectiveLabelKey).toBe('settings_linux_mode_x11')
  })

  it('uses the live tracker game mode when no compositor probe result is supplied', () => {
    reportLinuxGameDisplayMode('wayland', 'umbriel')
    const game = linuxSettingsView({
      env: env(),
      displayMode: 'x11',
      gameDisplayMode: 'detect',
    }).sections[0].settings[1]

    expect(game.effectiveValue).toBe('wayland')
    expect(game.effectiveLabelKey).toBe('settings_linux_game_mode_wayland')
    expect(game.options[1].effectiveLabelKey).toBe('settings_linux_game_mode_wayland')
    expect(game.hintParams).toBeUndefined()
  })

  it('waits instead of trusting X11 geometry as a game mode on native Wayland', () => {
    reportLinuxGameDisplayMode('x11', 'x11-geometry')
    const game = linuxSettingsView({
      env: env({}, ['scalpel', '--ozone-platform=wayland']),
      nativeWayland: true,
      displayMode: 'wayland',
      gameDisplayMode: 'detect',
    }).sections[0].settings[1]

    expect(game.effectiveValue).toBeUndefined()
    expect(game.options[1].effectiveLabelKey).toBe('settings_linux_game_mode_waiting')
  })

  it('resolves clipboard Auto to the compositor when a host provides one', () => {
    expect(resolveLinuxClipboardBackend('auto', true, true)).toBe('compositor')
    expect(resolveLinuxClipboardBackend('auto', true, false)).toBe('wl-clipboard')
    expect(resolveLinuxClipboardBackend('auto', false, true)).toBe('native')
  })

  it('resolves Auto windowing from the desktop default and layer-shell capability', () => {
    const auto = linuxSettingsView({ env: env(), displayMode: 'x11' }).sections[1].settings[1]
    expect(auto.value).toBe('auto')
    expect(auto.appliedValue).toBe('x11')
    expect(auto.effectiveValue).toBe('x11')
    expect(auto.effectiveLabelKey).toBe('settings_linux_backend_portal')
    expect(auto.options[0].effectiveLabelKey).toBe('settings_linux_backend_portal')
    expect(noticeKeys(auto)).toEqual([])
    expect(auto.errorKey).toBe('settings_linux_backend_error')

    // An applied Wayland mode is enough for Auto to advertise layer shell.
    const ready = linuxSettingsView({
      env: env({ WAYLAND_DISPLAY: 'wayland-1' }, ['scalpel', '--ozone-platform=wayland']),
      displayMode: 'wayland',
      layerShellCapability: { available: true },
    }).sections[1].settings[1]
    expect(ready.effectiveValue).toBe('layer-shell')
    expect(ready.effectiveLabelKey).toBe('settings_linux_backend_layer_shell')
    expect(ready.options[0].effectiveLabelKey).toBe('settings_linux_backend_layer_shell')
    expect(noticeKeys(ready)).toEqual([])

    // A saved Wayland preference does not change the active X11 mode: Auto
    // stays on X11 until the process restarts in Wayland.
    const pendingOnX11 = linuxSettingsView({
      env: env(),
      desktopEnvironment: 'hyprland',
      displayMode: 'wayland',
      layerShellCapability: { available: true },
    }).sections[1].settings[1]
    expect(pendingOnX11.appliedValue).toBe('x11')
    expect(pendingOnX11.effectiveValue).toBe('x11')
    expect(pendingOnX11.options[0].effectiveLabelKey).toBe('settings_linux_backend_portal')
    expect(noticeKeys(pendingOnX11)).toEqual([])

    // Once the process actually runs Wayland, the desktop default applies.
    const defaulted = linuxSettingsView({
      env: env({ WAYLAND_DISPLAY: 'wayland-1' }, ['scalpel', '--ozone-platform=wayland']),
      desktopEnvironment: 'hyprland',
      displayMode: 'wayland',
      layerShellCapability: { available: true },
    }).sections[1].settings[1]
    expect(defaulted.appliedValue).toBe('layer-shell')
    expect(defaulted.options[0].effectiveLabelKey).toBe('settings_linux_backend_layer_shell')

    const explicitX11 = linuxSettingsView({
      env: env({}, ['scalpel', '--ozone-platform=wayland']),
      windowingMode: 'x11',
      layerShellCapability: { available: true },
    }).sections[1].settings[1]
    expect(explicitX11.effectiveValue).toBe('x11')
    expect(noticeKeys(explicitX11)).toEqual([])

    const explicitWithDefault = linuxSettingsView({
      env: env(),
      desktopEnvironment: 'hyprland',
      displayMode: 'wayland',
      windowingMode: 'x11',
      layerShellCapability: { available: true },
    }).sections[1].settings[1]
    expect(explicitWithDefault.effectiveValue).toBe('x11')

    const stalePreference = linuxSettingsView({
      env: env(),
      windowingMode: 'kwin-layer-shell',
    }).sections[1].settings[1]
    expect(stalePreference.value).toBe('auto')
  })

  it('uses the active display server for windowing Auto and compatibility', () => {
    const pending = linuxSettingsView({
      env: env(),
      displayMode: 'wayland',
      windowingMode: 'auto',
      layerShellCapability: { available: true },
    })
    const display = pending.sections[0].settings[0]
    expect(display.appliedValue).toBe('x11')
    expect(display.hintKey).toBe('settings_linux_mode_pending_hint')

    const auto = pending.sections[1].settings[1]
    expect(auto.value).toBe('auto')
    expect(auto.appliedValue).toBe('x11')
    expect(auto.effectiveValue).toBe('x11')
    expect(noticeKeys(auto)).toEqual([])

    const explicit = linuxSettingsView({
      env: env(),
      displayMode: 'wayland',
      windowingMode: 'layer-shell',
      layerShellCapability: { available: true },
    }).sections[1].settings[1]
    expect(explicit.value).toBe('layer-shell')
    expect(explicit.appliedValue).toBe('x11')
    expect(noticeKeys(explicit)).toEqual(['settings_linux_windowing_wayland_required'])
    expect(explicit.notices?.[0]?.params).toBeUndefined()
    expect(noticeKeys(explicit)).not.toContain('settings_linux_backend_fallback')
  })

  it('warns inline instead of forcing Ozone when layer shell is selected on X11', () => {
    const view = linuxSettingsView({
      env: env(),
      displayMode: 'x11',
      windowingMode: 'layer-shell',
      layerShellCapability: { available: true },
    })
    const windowing = view.sections[1].settings[1]

    expect(windowing.value).toBe('layer-shell')
    expect(windowing.appliedValue).toBe('x11')
    expect(windowing.notices).toEqual([
      {
        messageKey: 'settings_linux_windowing_wayland_required',
        params: undefined,
        tone: 'warn',
        action: {
          kind: 'set-setting',
          labelKey: 'settings_linux_game_mode_switch_wayland',
          settingId: LINUX_SETTING_IDS.displayMode,
          value: 'wayland',
        },
      },
    ])
    expect(platformBanners(view, {})).toEqual([])

    // A user-supplied Ozone flag still controls the display selector; do not
    // offer an action the settings handler would reject.
    const locked = linuxSettingsView({
      env: env({}, ['scalpel', '--ozone-platform=x11']),
      windowingMode: 'layer-shell',
      layerShellCapability: { available: true },
    }).sections[1].settings[1]
    expect(noticeKeys(locked)).toEqual(['settings_linux_windowing_wayland_required'])
    expect(locked.notices?.[0]?.action).toBeUndefined()
  })

  it('falls back to a regular window with a translated reason when the layer-shell host is unavailable', () => {
    const windowing = linuxSettingsView({
      env: env({}, ['scalpel', '--ozone-platform=wayland']),
      displayMode: 'wayland',
      windowingMode: 'layer-shell',
      layerShellCapability: { available: false, reasonKey: 'settings_linux_unavailable_hint' },
    }).sections[1].settings[1]

    expect(windowing.effectiveValue).toBe('window')
    expect(noticeKeys(windowing)).toEqual(['settings_linux_backend_fallback'])
    expect(windowing.notices?.[0]?.params).toEqual({ reasonLabelKey: 'settings_linux_unavailable_hint' })
    expect(windowing.notices?.[0]?.action).toEqual({
      kind: 'set-setting',
      labelKey: 'settings_linux_backend_window',
      settingId: LINUX_SETTING_IDS.windowingMode,
      value: 'window',
    })
  })

  it('warns when an explicit backend selection is incompatible with the display mode', () => {
    const advanced = linuxSettingsView({
      env: env(),
      displayMode: 'x11',
      clipboardBackend: 'wl-clipboard',
      inputBackend: 'ydotool',
      shortcutBackend: 'portal',
    }).sections[1].settings

    const byId = (id: string) => advanced.find((item) => item.id === id)
    expect(noticeKeys(byId(LINUX_SETTING_IDS.clipboardBackend)!)).toEqual(['settings_linux_clipboard_wayland_required'])
    expect(noticeKeys(byId(LINUX_SETTING_IDS.inputBackend)!)).toEqual(['settings_linux_input_wayland_required'])
    expect(noticeKeys(byId(LINUX_SETTING_IDS.shortcutBackend)!)).toEqual(['settings_linux_shortcuts_wayland_required'])
    // The offer-to-switch action survives while the display selector is free.
    expect(byId(LINUX_SETTING_IDS.clipboardBackend)?.notices?.[0]?.action).toMatchObject({
      kind: 'set-setting',
      settingId: LINUX_SETTING_IDS.displayMode,
      value: 'wayland',
    })
  })

  it('judges Auto by its resolved backend and stays quiet when the guess is workable', () => {
    // On X11 every Auto guess resolves to an X11-capable backend: no warnings.
    const x11 = linuxSettingsView({ env: env(), displayMode: 'x11' })
    for (const item of x11.sections[1].settings) expect(item.notices ?? []).toEqual([])
    const x11Shortcut = x11.sections[1].settings[4]
    expect(x11Shortcut.effectiveValue).toBe('electron')

    // On native Wayland without a layer-shell host, Auto shortcuts resolve to
    // the portal, which is compatible with Wayland: no warning either.
    const wayland = linuxSettingsView({
      env: env({}, ['scalpel', '--ozone-platform=wayland']),
      displayMode: 'wayland',
    })
    const shortcut = wayland.sections[1].settings[4]
    expect(shortcut.value).toBe('auto')
    expect(shortcut.effectiveValue).toBe('portal')
    expect(noticeKeys(shortcut)).toEqual([])
  })

  it('suggests switching to Wayland when X11 leaves this desktop layer shell unused', () => {
    const kdeEnv = env({ XDG_CURRENT_DESKTOP: 'KDE', WAYLAND_DISPLAY: 'wayland-1' })
    const view = linuxSettingsView({
      env: kdeEnv,
      displayMode: 'x11',
      layerShellCapability: { available: true, backendId: 'kwin-layer-shell' },
    })
    const display = view.sections[0].settings[0]
    expect(noticeKeys(display)).toEqual(['settings_linux_display_layer_shell_suggested'])
    expect(display.notices?.[0]?.action).toMatchObject({
      kind: 'set-setting',
      settingId: LINUX_SETTING_IDS.displayMode,
      value: 'wayland',
    })

    // An explicit layer-shell selection already warns that it needs Wayland.
    const explicit = linuxSettingsView({
      env: kdeEnv,
      displayMode: 'x11',
      windowingMode: 'layer-shell',
      layerShellCapability: { available: true, backendId: 'kwin-layer-shell' },
    })
    expect(noticeKeys(explicit.sections[0].settings[0])).toEqual([])
    expect(noticeKeys(explicit.sections[1].settings[1])).toEqual(['settings_linux_windowing_wayland_required'])

    // A desktop whose Auto guess is X11 gets no layer-shell nudge.
    const x11Desktop = linuxSettingsView({
      env: env({ DISPLAY: ':0', XDG_CURRENT_DESKTOP: 'XFCE' }),
      displayMode: 'x11',
    })
    expect(noticeKeys(x11Desktop.sections[0].settings[0])).toEqual([])

    // GNOME is in the defaults map but has no wlr-layer-shell path.
    const gnome = linuxSettingsView({
      env: env({ DISPLAY: ':0', XDG_CURRENT_DESKTOP: 'GNOME' }),
      displayMode: 'x11',
    })
    expect(noticeKeys(gnome.sections[0].settings[0])).toEqual([])

    // Already running Wayland: nothing to switch to.
    const wayland = linuxSettingsView({
      env: env({ XDG_CURRENT_DESKTOP: 'KDE', WAYLAND_DISPLAY: 'wayland-1' }, ['scalpel', '--ozone-platform=wayland']),
      displayMode: 'wayland',
      layerShellCapability: { available: true, backendId: 'kwin-layer-shell' },
    })
    expect(noticeKeys(wayland.sections[0].settings[0])).toEqual([])
  })

  it('treats Auto layer-shell as already applied once boot has probed the backend', () => {
    // Main captures startup values after native support has probed and
    // registered the backend. Capturing before that stored the pre-probe
    // `window` fallback and produced a permanent restart banner on KDE.
    setLinuxLayerShellCapability({ available: true, backendId: 'kwin-layer-shell' })
    const view = linuxSettingsView({
      env: env({ XDG_CURRENT_DESKTOP: 'KDE', WAYLAND_DISPLAY: 'wayland-1' }, ['scalpel', '--ozone-platform=wayland']),
    })

    const windowing = view.sections[1].settings[1]
    expect(windowing.value).toBe('auto')
    expect(windowing.appliedValue).toBe('layer-shell')
    expect(platformBanners(view, capturePlatformStartupValues(view))).toEqual([])
  })

  it('reports the same applied backends as the diagnostic snapshot', () => {
    const options = {
      displayMode: 'wayland',
      desktopEnvironment: 'kde-plasma',
      windowingMode: 'window',
      shortcutBackend: 'portal',
      clipboardBackend: 'native',
      inputBackend: 'ydotool',
    } as const
    const native = env({ XDG_CURRENT_DESKTOP: 'KDE', WAYLAND_DISPLAY: 'wayland-1' }, [
      'scalpel',
      '--ozone-platform=wayland',
    ])
    const snapshot = resolveLinuxEffectiveBackendsSnapshot({ env: native, ...options })
    const settings = linuxSettingsView({ env: native, ...options }).sections[1].settings
    const applied = (id: string) => settings.find((item) => item.id === id)?.appliedValue

    expect(snapshot?.windowing.resolved).toBe(applied(LINUX_SETTING_IDS.windowingMode))
    expect(snapshot?.shortcuts.resolved).toBe(applied(LINUX_SETTING_IDS.shortcutBackend))
    expect(snapshot?.clipboard.resolved).toBe(applied(LINUX_SETTING_IDS.clipboardBackend))
    expect(snapshot?.input.resolved).toBe(applied(LINUX_SETTING_IDS.inputBackend))
  })
})
