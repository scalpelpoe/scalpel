// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeSettings } from '../../../shared/types'
import { SettingsPanel } from './SettingsPanel'

vi.mock('./settings', () => ({
  GeneralTab: () => <div>General Tab</div>,
  ViewTab: () => <div>View Tab</div>,
  MacrosTab: () => <div>Macros Tab</div>,
  FilterTab: () => <div>Filter Tab</div>,
  PriceCheckTab: () => <div>Trade Tab</div>,
  FaqTab: () => <div>FAQ Tab</div>,
  CheatSheetsTab: () => <div>Sheets Tab</div>,
  prettyHotkey: (hotkey: string) => hotkey,
}))

vi.mock('./settings/DeveloperSection', () => ({
  DeveloperSection: () => <div>Developer Tab</div>,
}))

vi.mock('./settings/PluginsSection', () => ({
  PluginsSection: () => <div>Plugins Tab</div>,
}))

vi.mock('../features/profiles/ProfileManagerTab', () => ({
  ProfileManagerTab: () => <div>Profiles Tab</div>,
}))

function settings(input: Partial<RuntimeSettings> = {}): RuntimeSettings {
  return {
    poeVersion: 1,
    activeProfileId: 'poe1',
    lastProfileIdPoe1: 'poe1',
    lastProfileIdPoe2: '',
    activeProfile: null,
    onboardingCompleted: true,
    hotkey: '',
    priceCheckHotkey: '',
    overlayOpacity: 0.95,
    overlayScale: 1,
    openSide: 'both',
    startInTray: true,
    closeOnClickOutside: false,
    useCurrentZoneAreaLevel: false,
    reloadOnSave: true,
    updateChannel: 'stable',
    tradeStatus: 'available',
    priceCheckDefaultPercent: 90,
    tradeDefaultToBase: false,
    chatCommands: [],
    appMacros: [],
    stashScrollEnabled: false,
    regexPresetsPoe1: [],
    regexPresetsPoe2: [],
    leaguesPoe1: [],
    leaguesPoe2: [],
    themeId: 'default',
    customThemePalette: null,
    ...input,
  } as RuntimeSettings
}

describe('SettingsPanel tab routing', () => {
  beforeEach(() => {
    ;(globalThis as unknown as { __APP_VERSION__: string }).__APP_VERSION__ = 'test'
    ;(window as unknown as { api: Partial<typeof window.api> }).api = {
      setSetting: vi.fn(),
      setProfileSettingForGame: vi.fn(),
    }
  })

  it('opens the Profiles tab from an app-mode tab request', () => {
    render(
      <SettingsPanel
        settings={settings()}
        onSettingsChange={vi.fn()}
        mode="app"
        onEditProfile={vi.fn()}
        tabRequest={{ tab: 'profiles', n: 1 }}
      />,
    )

    expect(screen.getByText('Profiles Tab')).toBeInTheDocument()
  })

  it('blocks the Profiles tab in overlay mode', () => {
    render(
      <SettingsPanel
        settings={settings()}
        onSettingsChange={vi.fn()}
        mode="overlay"
        onEditProfile={vi.fn()}
        tabRequest={{ tab: 'profiles', n: 1 }}
      />,
    )

    expect(screen.queryByText('Profiles Tab')).not.toBeInTheDocument()
    expect(screen.getByText('General Tab')).toBeInTheDocument()
  })

  it('opens the Filter tab from a tab request', () => {
    render(
      <SettingsPanel
        settings={settings()}
        onSettingsChange={vi.fn()}
        mode="app"
        onEditProfile={vi.fn()}
        tabRequest={{ tab: 'filter', n: 1 }}
      />,
    )

    expect(screen.getByText('Filter Tab')).toBeInTheDocument()
  })
})
