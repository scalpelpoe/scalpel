// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { PoeVersionProvider } from '../../shared/poe-version-context'
import { ExtraFeaturesPanel } from './ExtraFeaturesPanel'
import type { RuntimeSettings } from '@shared/types'

// window.api is read by the internal updateProfile helper.
beforeEach(() => {
  ;(window as unknown as { api: Partial<typeof window.api> }).api = {
    setProfileSettingForGame: vi.fn(async (_v: number, _k: string, _val: unknown) => baseSettings),
    suspendHotkeys: vi.fn(),
    resumeHotkeys: vi.fn(),
  }
})

const baseSettings = {
  poeVersion: 1,
  hiddenTabs: [],
  appMacros: [],
  hotkey: '',
  priceCheckHotkey: '',
  chatCommands: [],
  activeProfile: { cheatSheets: { globalHotkey: '', categories: [] } },
} as unknown as RuntimeSettings

function renderPanel(overrides: Partial<Parameters<typeof ExtraFeaturesPanel>[0]> = {}) {
  const props = {
    settings: baseSettings,
    onSettingsChange: vi.fn(),
    update: vi.fn(),
    tryHotkey: vi.fn(() => true),
    onOpenSettingsTab: vi.fn(),
    onHideTab: vi.fn(),
    ...overrides,
  }
  render(
    <PoeVersionProvider version={1}>
      <ExtraFeaturesPanel {...props} />
    </PoeVersionProvider>,
  )
  return props
}

describe('ExtraFeaturesPanel', () => {
  it('renders all four feature cards', () => {
    renderPanel()
    expect(screen.getByText('Cheat Sheets')).toBeInTheDocument()
    expect(screen.getByText('Regex Remote')).toBeInTheDocument()
    expect(screen.getByText('Whiteboard')).toBeInTheDocument()
    expect(screen.getByText('Plugins')).toBeInTheDocument()
  })

  it('deep-links to the cheatsheets settings tab', () => {
    const props = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /set up sheets in settings/i }))
    expect(props.onOpenSettingsTab).toHaveBeenCalledWith('cheatsheets')
  })

  it('deep-links to the plugins settings tab', () => {
    const props = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /browse & install in settings/i }))
    expect(props.onOpenSettingsTab).toHaveBeenCalledWith('plugins')
  })

  it('hides the tab when "Hide this tab" is clicked', () => {
    const props = renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /hide this tab/i }))
    expect(props.onHideTab).toHaveBeenCalledTimes(1)
  })

  it('creates a new appMacro entry when binding a hotkey for a feature with no existing macro', () => {
    const props = renderPanel()
    // The Regex Remote card's HotkeyField: click to record, then press a combo.
    const card = screen.getByText('Regex Remote').closest('[data-feature-card]') as HTMLElement
    fireEvent.click(within(card).getByText(/no hotkey set/i))
    fireEvent.keyDown(window, { key: 'F8' })
    expect(props.update).toHaveBeenCalledWith(
      'appMacros',
      expect.arrayContaining([expect.objectContaining({ action: 'toggleRegexRemote', hotkey: 'F8' })]),
    )
  })

  it('edits the existing appMacro entry in place when one already exists', () => {
    const settings = {
      ...baseSettings,
      appMacros: [{ action: 'toggleWhiteboard', hotkey: 'F9' }],
    } as unknown as RuntimeSettings
    const props = renderPanel({ settings })
    const card = screen.getByText('Whiteboard').closest('[data-feature-card]') as HTMLElement
    // Existing hotkey is shown; clicking the value re-records.
    fireEvent.click(within(card).getByText('F9'))
    fireEvent.keyDown(window, { key: 'F10' })
    expect(props.update).toHaveBeenCalledWith('appMacros', [{ action: 'toggleWhiteboard', hotkey: 'F10' }])
  })

  it('editing the Cheat Sheets hotkey calls setProfileSettingForGame with the new globalHotkey', async () => {
    renderPanel()
    const card = screen.getByText('Cheat Sheets').closest('[data-feature-card]') as HTMLElement
    fireEvent.click(within(card).getByText(/no hotkey set/i))
    fireEvent.keyDown(window, { key: 'F7' })
    // updateProfile is async; flush microtasks before asserting.
    await Promise.resolve()
    expect(window.api.setProfileSettingForGame).toHaveBeenCalledWith(
      1,
      'cheatSheets',
      expect.objectContaining({ globalHotkey: 'F7' }),
    )
  })
})
