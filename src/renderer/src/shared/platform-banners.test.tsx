// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PLATFORM_SETTING_IDS, type PlatformSettingsPayload } from '@shared/contracts/platform-settings'
import { resetPlatformSettingsStore } from './platform-settings-store'
import { PlatformBanners } from './platform-banners'

function payload(
  banners: PlatformSettingsPayload['banners'] = [
    {
      id: 'warning:gameDisplayMode',
      messageKey: 'settings_linux_game_mode_mismatch',
      tone: 'warn',
      action: {
        kind: 'set-setting',
        labelKey: 'settings_linux_game_mode_switch_wayland',
        settingId: PLATFORM_SETTING_IDS.displayMode,
        value: 'wayland',
      },
    },
    {
      id: 'restart',
      messageKey: 'settings_linux_restart_notice',
      tone: 'warn',
      action: { kind: 'restart', labelKey: 'common_restart' },
    },
  ],
): PlatformSettingsPayload {
  return {
    view: { available: true, sections: [] },
    startupValues: { displayMode: 'x11' },
    banners,
  }
}

function installApi(banners?: PlatformSettingsPayload['banners']) {
  const bridge = {
    getPlatformSettings: vi.fn(async () => payload(banners)),
    setPlatformSetting: vi.fn(async () => ({ restartRequired: true })),
    restartApp: vi.fn(),
  }
  ;(window as unknown as { api: unknown }).api = bridge
  return bridge
}

describe('PlatformBanners', () => {
  beforeEach(() => {
    resetPlatformSettingsStore()
    vi.restoreAllMocks()
  })

  it('stacks every platform banner and runs its generic action', async () => {
    const bridge = installApi()
    render(<PlatformBanners enabled />)

    await waitFor(() => expect(screen.getAllByRole('status')).toHaveLength(2))
    expect(screen.getByText(/Scalpel is running on X11/)).toBeInTheDocument()
    expect(screen.getByText(/Restart required/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Switch Scalpel to Wayland' }))
    await waitFor(() =>
      expect(bridge.setPlatformSetting).toHaveBeenCalledWith(PLATFORM_SETTING_IDS.displayMode, 'wayland'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(bridge.restartApp).toHaveBeenCalledOnce()
  })

  it('runs a generic set-setting banner action', async () => {
    const bridge = installApi([
      {
        id: 'warning:gameDisplayMode',
        messageKey: 'settings_linux_game_mode_mismatch',
        tone: 'warn',
        action: {
          kind: 'set-setting',
          labelKey: 'settings_linux_game_mode_switch_wayland',
          settingId: PLATFORM_SETTING_IDS.displayMode,
          value: 'wayland',
        },
      },
    ])
    render(<PlatformBanners enabled />)

    await waitFor(() => expect(screen.getByText(/Scalpel is running on X11/)).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Switch Scalpel to Wayland' }))
    await waitFor(() =>
      expect(bridge.setPlatformSetting).toHaveBeenCalledWith(PLATFORM_SETTING_IDS.displayMode, 'wayland'),
    )
  })

  it('does not fetch or render when the platform reports no settings', () => {
    const bridge = installApi()
    render(<PlatformBanners enabled={false} />)

    expect(screen.queryByRole('status')).toBeNull()
    expect(bridge.getPlatformSettings).not.toHaveBeenCalled()
  })
})
