import { describe, expect, it } from 'vitest'
import {
  PLATFORM_SETTING_IDS,
  capturePlatformStartupValues,
  platformBanners,
  type PlatformSettingDescriptor,
  type PlatformSettingsView,
} from './platform-settings'

const view: PlatformSettingsView = {
  available: true,
  restartNoticeKey: 'settings_linux_restart_notice',
  optionValueLabelKey: 'settings_linux_option_value',
  sections: [
    {
      id: 'display',
      settings: [
        {
          id: PLATFORM_SETTING_IDS.displayMode,
          labelKey: 'settings_linux_heading',
          value: 'wayland',
          options: [{ id: 'wayland', labelKey: 'settings_linux_mode_wayland' }],
          availability: 'available',
          requiresRestart: true,
        },
        {
          id: PLATFORM_SETTING_IDS.gameDisplayMode,
          labelKey: 'settings_linux_game_mode_heading',
          value: 'detect',
          options: [{ id: 'auto', labelKey: 'settings_linux_game_mode_auto' }],
          availability: 'available',
          notices: [
            {
              messageKey: 'settings_linux_game_mode_mismatch',
              tone: 'warn',
              action: {
                kind: 'set-setting',
                labelKey: 'settings_linux_game_mode_switch_wayland',
                settingId: PLATFORM_SETTING_IDS.displayMode,
                value: 'wayland',
              },
            },
          ],
        },
      ],
    },
  ],
}

describe('platformBanners', () => {
  it('returns an empty stack when the host has no platform settings', () => {
    expect(platformBanners({ available: false, sections: [] }, {})).toEqual([])
  })

  it('banners restarts but leaves per-setting notices to the descriptor view', () => {
    expect(platformBanners(view, { displayMode: 'x11' })).toEqual([
      {
        id: 'restart',
        messageKey: 'settings_linux_restart_notice',
        tone: 'warn',
        action: { kind: 'restart', labelKey: 'common_restart' },
      },
    ])
  })

  it('omits the restart banner once the value matches the startup snapshot', () => {
    expect(platformBanners(view, { displayMode: 'wayland' })).toEqual([])
  })

  it('does not prompt when an explicit choice resolves to the same applied value as Auto', () => {
    const setting = (value: string): PlatformSettingDescriptor => ({
      id: PLATFORM_SETTING_IDS.windowingMode,
      labelKey: 'settings_linux_windowing_heading',
      value,
      appliedValue: 'layer-shell',
      options: [
        { id: 'auto', labelKey: 'auto' },
        { id: 'layer-shell', labelKey: 'layer-shell' },
      ],
      availability: 'available',
      requiresRestart: true,
    })
    const sectionView = (value: string): PlatformSettingsView => ({
      available: true,
      restartNoticeKey: 'settings_linux_restart_notice',
      sections: [{ id: 'advanced', settings: [setting(value)] }],
    })
    const startup = capturePlatformStartupValues(sectionView('auto'))
    expect(startup[PLATFORM_SETTING_IDS.windowingMode]).toBe('layer-shell')
    expect(platformBanners(sectionView('layer-shell'), startup)).toEqual([])
  })

  it('does not prompt for a restart when a setting can be applied live', () => {
    const liveView: PlatformSettingsView = {
      available: true,
      sections: [
        {
          id: 'display',
          settings: [
            {
              id: PLATFORM_SETTING_IDS.desktopEnvironment,
              labelKey: 'settings_linux_desktop_heading',
              value: 'sway',
              options: [{ id: 'sway', labelKey: 'settings_linux_desktop_sway' }],
              availability: 'available',
            },
          ],
        },
      ],
    }
    expect(platformBanners(liveView, { desktopEnvironment: 'kde-plasma' })).toEqual([])
  })
})
