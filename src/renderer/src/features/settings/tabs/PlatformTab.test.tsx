// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PLATFORM_SETTING_IDS,
  type PlatformSettingNotice,
  type PlatformSettingsPayload,
  type PlatformSettingsView,
} from '@shared/contracts/platform-settings'
import { resetPlatformSettingsStore } from '@renderer/shared/platform-settings-store'
import { PlatformTab } from './PlatformTab'

type DisplayMode = 'x11' | 'wayland'

function view(
  gameMode = 'auto',
  displayMode: DisplayMode = 'x11',
  gameNotices: readonly PlatformSettingNotice[] = [],
  detectedMode: 'wayland' | null = 'wayland',
): PlatformSettingsView {
  return {
    available: true,
    optionValueLabelKey: 'settings_linux_option_value',
    restartNoticeKey: 'settings_linux_restart_notice',
    sections: [
      {
        id: 'display',
        settings: [
          {
            id: PLATFORM_SETTING_IDS.displayMode,
            labelKey: 'settings_linux_heading',
            value: displayMode,
            options: [
              { id: 'x11', labelKey: 'settings_linux_mode_x11' },
              { id: 'wayland', labelKey: 'settings_linux_mode_wayland' },
            ],
            availability: 'available',
            requiresRestart: true,
            errorKey: 'settings_linux_mode_error',
          },
          {
            id: PLATFORM_SETTING_IDS.gameDisplayMode,
            labelKey: 'settings_linux_game_mode_heading',
            value: gameMode,
            hintKey:
              gameMode === 'detect' ? 'settings_linux_game_mode_detect_hint' : 'settings_linux_game_mode_auto_hint',
            options: [
              { id: 'auto', labelKey: 'settings_linux_game_mode_auto_scalpel' },
              {
                id: 'detect',
                labelKey: 'settings_linux_game_mode_detect',
                hintKey: 'settings_linux_game_mode_detect_hint',
                effectiveLabelKey: detectedMode
                  ? 'settings_linux_game_mode_wayland'
                  : 'settings_linux_game_mode_waiting',
              },
              { id: 'x11', labelKey: 'settings_linux_game_mode_x11' },
            ],
            availability: 'available',
            notices: gameNotices.length ? gameNotices : undefined,
            errorKey: 'settings_linux_game_mode_error',
          },
          {
            id: PLATFORM_SETTING_IDS.desktopEnvironment,
            labelKey: 'settings_linux_desktop_heading',
            value: 'auto',
            options: [{ id: 'auto', labelKey: 'settings_linux_game_mode_auto' }],
            availability: 'available',
          },
        ],
      },
      {
        id: 'advanced',
        labelKey: 'settings_linux_advanced',
        collapsed: true,
        settings: [
          {
            id: PLATFORM_SETTING_IDS.windowingMode,
            labelKey: 'settings_linux_windowing_heading',
            value: 'auto',
            options: [
              {
                id: 'auto',
                labelKey: 'settings_linux_backend_auto',
                effectiveLabelKey: 'settings_linux_backend_portal',
              },
              { id: 'x11', labelKey: 'settings_linux_backend_portal' },
              { id: 'window', labelKey: 'settings_linux_backend_window' },
              { id: 'layer-shell', labelKey: 'settings_linux_backend_layer_shell' },
            ],
            availability: 'available',
            requiresRestart: true,
            errorKey: 'settings_linux_backend_error',
          },
          {
            id: PLATFORM_SETTING_IDS.inputBackend,
            labelKey: 'settings_linux_input_heading',
            value: 'auto',
            options: [],
            availability: 'disabled',
            hintKey: 'settings_linux_unavailable_hint',
          },
        ],
      },
    ],
  }
}

function installApi(
  gameMode = 'auto',
  displayMode: DisplayMode = 'x11',
  gameNotices: readonly PlatformSettingNotice[] = [],
  detectedMode: 'wayland' | null = 'wayland',
): {
  getPlatformSettings: ReturnType<typeof vi.fn>
  setPlatformSetting: ReturnType<typeof vi.fn>
  setSetting: ReturnType<typeof vi.fn>
} {
  let currentGameMode = gameMode
  let currentDisplayMode = displayMode
  const payload = (): PlatformSettingsPayload => ({
    view: view(currentGameMode, currentDisplayMode, gameNotices, detectedMode),
    startupValues: { displayMode: 'x11' },
    banners: [],
    recentWindowTitles: ['Path of Exile 2|pathofexilesteam.exe', 'Zed|dev.zed.Zed'],
  })
  const bridge = {
    getPlatformSettings: vi.fn(async () => payload()),
    setPlatformSetting: vi.fn(async (id: string, value: string) => {
      if (id === PLATFORM_SETTING_IDS.displayMode && (value === 'x11' || value === 'wayland')) {
        currentDisplayMode = value
      }
      if (id === PLATFORM_SETTING_IDS.gameDisplayMode) currentGameMode = value
      return { restartRequired: true }
    }),
    setSetting: vi.fn(),
    restartApp: vi.fn(),
  }
  ;(window as unknown as { api: unknown }).api = bridge
  return bridge
}

function renderTab(): { update: ReturnType<typeof vi.fn> } {
  const update = vi.fn()
  render(<PlatformTab settings={{ gameTitlePoe1: '', gameTitlePoe2: '' }} update={update} />)
  return { update }
}

describe('PlatformTab', () => {
  beforeEach(() => {
    resetPlatformSettingsStore()
    vi.restoreAllMocks()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('renders descriptor labels and writes opaque ids without duplicating window banners', async () => {
    const bridge = installApi()
    renderTab()

    await waitFor(() => expect(screen.getByLabelText('Scalpel display mode')).toBeInTheDocument())
    expect(screen.getByText('Scalpel display mode')).toHaveClass('settings-section-title')
    expect(screen.getByLabelText('PoE display mode')).toBeInTheDocument()
    expect(screen.getByLabelText('Desktop environment')).toBeInTheDocument()
    expect(screen.getByLabelText('Windowing mode')).toBeInTheDocument()
    expect(screen.getByText('Advanced')).toBeInTheDocument()

    const gameValue = screen.getByLabelText('PoE display mode').closest('section')?.querySelector('.value')
    expect(gameValue).toHaveTextContent("Follow Scalpel's mode")
    expect((screen.getByLabelText('Input backend') as HTMLSelectElement).disabled).toBe(true)
    expect(screen.queryByText(/Restart required/)).toBeNull()
    expect(screen.queryByText(/Scalpel is running on X11/)).toBeNull()

    fireEvent.change(screen.getByLabelText('PoE display mode'), { target: { value: 'x11' } })
    await waitFor(() =>
      expect(bridge.setPlatformSetting).toHaveBeenCalledWith(PLATFORM_SETTING_IDS.gameDisplayMode, 'x11'),
    )
    await waitFor(() => expect(bridge.getPlatformSettings).toHaveBeenCalledTimes(2))
  })

  it('writes the opaque windowing-mode id and value', async () => {
    const bridge = installApi()
    renderTab()

    await waitFor(() => expect(screen.getByLabelText('Windowing mode')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('Windowing mode'), { target: { value: 'layer-shell' } })

    await waitFor(() =>
      expect(bridge.setPlatformSetting).toHaveBeenCalledWith(PLATFORM_SETTING_IDS.windowingMode, 'layer-shell'),
    )
  })

  it('updates the Auto game label as soon as the display selection changes', async () => {
    const bridge = installApi()
    renderTab()

    const gameValue = () => screen.getByLabelText('PoE display mode').closest('section')?.querySelector('.value')
    await waitFor(() => expect(gameValue()).toHaveTextContent("Follow Scalpel's mode"))

    fireEvent.change(screen.getByLabelText('Scalpel display mode'), { target: { value: 'wayland' } })

    await waitFor(() => expect(gameValue()).toHaveTextContent("Follow Scalpel's mode"))
    expect(bridge.setPlatformSetting).toHaveBeenCalledWith(PLATFORM_SETTING_IDS.displayMode, 'wayland')
  })

  it('shows live detection results for the Detect option', async () => {
    installApi('detect')
    renderTab()

    await waitFor(() => expect(screen.getByLabelText('PoE display mode')).toBeInTheDocument())
    const gameValue = screen.getByLabelText('PoE display mode').closest('section')?.querySelector('.value')
    expect(gameValue).toHaveTextContent('Detected (Wayland)')
    expect(screen.queryByText(/Detected: Wayland/)).toBeNull()
  })

  it('shows a waiting label for Detect before a game mode is known', async () => {
    installApi('detect', 'x11', [], null)
    renderTab()

    await waitFor(() => expect(screen.getByLabelText('PoE display mode')).toBeInTheDocument())
    const gameValue = screen.getByLabelText('PoE display mode').closest('section')?.querySelector('.value')
    expect(gameValue).toHaveTextContent('Detected (waiting...)')
  })

  it('shows the current and previous activated window titles in the Advanced section', async () => {
    installApi()
    renderTab()

    await waitFor(() => expect(screen.getByText(/Path of Exile 2\|pathofexilesteam\.exe/)).toBeInTheDocument())
    expect(screen.getByText(/Zed\|dev\.zed\.Zed/)).toBeInTheDocument()
    expect(screen.getByText(/Current/)).toBeInTheDocument()
    expect(screen.getByText(/Previous/)).toBeInTheDocument()
  })

  it('copies the exact window identity string', async () => {
    installApi()
    renderTab()

    const button = await screen.findByRole('button', {
      name: /Copy: Path of Exile 2\|pathofexilesteam\.exe/,
    })
    fireEvent.click(button)

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Path of Exile 2|pathofexilesteam.exe'),
    )
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })

  it('renders inline notices and runs their generic action', async () => {
    const bridge = installApi('detect', 'x11', [
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
    ])
    renderTab()

    await waitFor(() => expect(screen.getByText(/Scalpel is running on X11/)).toBeInTheDocument())
    expect(screen.queryByText(/Restart required/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Switch Scalpel to Wayland' }))
    await waitFor(() =>
      expect(bridge.setPlatformSetting).toHaveBeenCalledWith(PLATFORM_SETTING_IDS.displayMode, 'wayland'),
    )
  })

  it('commits both game titles from inside Advanced', async () => {
    installApi()
    const { update } = renderTab()

    await waitFor(() => expect(screen.getByLabelText('PoE 1 window title')).toBeInTheDocument())
    const poe1 = screen.getByLabelText('PoE 1 window title')
    const poe2 = screen.getByLabelText('PoE 2 window title')
    expect(poe1.closest('details')).not.toBeNull()
    expect(poe2.closest('details')).not.toBeNull()
    expect(poe1).toHaveAttribute('placeholder', 'Auto determined')
    expect(poe2).toHaveAttribute('placeholder', 'Auto determined')

    fireEvent.change(poe1, { target: { value: '  My PoE Window  ' } })
    fireEvent.blur(poe1)
    expect(update).toHaveBeenCalledWith('gameTitlePoe1', 'My PoE Window')
  })
})
