// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PoeProfileSummary, RuntimeSettings } from '../../../../shared/types'
import { ProfileManagerTab } from './ProfileManagerTab'

function profile(
  input: Partial<PoeProfileSummary> & Pick<PoeProfileSummary, 'id' | 'name' | 'gameVariant'>,
): PoeProfileSummary {
  return {
    league: input.gameVariant === 2 ? 'Fate of the Vaal' : 'Mirage',
    filterDir: '',
    filterPath: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    active: false,
    ...input,
  }
}

function settings(input: Partial<RuntimeSettings> = {}): RuntimeSettings {
  return {
    poeVersion: 1,
    activeProfileId: 'poe1',
    lastProfileIdPoe1: 'poe1',
    lastProfileIdPoe2: 'poe2',
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

function installApi(profiles: PoeProfileSummary[]): void {
  ;(window as unknown as { api: Partial<typeof window.api> }).api = {
    listProfiles: vi.fn(async () => profiles),
    renameProfile: vi.fn(async (id: string, name: string) => {
      const existing = profiles.find((p) => p.id === id)
      if (!existing) return null
      existing.name = name
      return existing
    }),
    createProfile: vi.fn(),
    duplicateProfile: vi.fn(),
    deleteProfile: vi.fn(),
    getSettings: vi.fn(),
    setActiveProfile: vi.fn(),
  }
}

describe('ProfileManagerTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    const storage = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    })
  })

  it('opens an inline rename editor and saves the new profile name', async () => {
    const profiles = [profile({ id: 'poe1', name: 'Atlas Mapper', gameVariant: 1, active: true })]
    installApi(profiles)

    render(<ProfileManagerTab settings={settings()} onSettingsChange={vi.fn()} onEditProfile={vi.fn()} />)

    await screen.findByText('Atlas Mapper')
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))

    const input = screen.getByDisplayValue('Atlas Mapper')
    fireEvent.change(input, { target: { value: 'Boss Rush' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(window.api.renameProfile).toHaveBeenCalledWith('poe1', 'Boss Rush'))
    expect(await screen.findByText('Boss Rush')).toBeInTheDocument()
  })

  it('validates empty draft names before saving', async () => {
    const profiles = [profile({ id: 'poe1', name: 'Atlas Mapper', gameVariant: 1, active: true })]
    installApi(profiles)

    render(<ProfileManagerTab settings={settings()} onSettingsChange={vi.fn()} onEditProfile={vi.fn()} />)

    await screen.findByText('Atlas Mapper')
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByDisplayValue('Atlas Mapper'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Profile name is required.')).toBeInTheDocument()
    expect(window.api.renameProfile).not.toHaveBeenCalled()
  })

  it('applies dev restart-to-switch settings after one confirmed click', async () => {
    const profiles = [
      profile({ id: 'poe1', name: 'PoE1 mapper', gameVariant: 1, active: true }),
      profile({ id: 'poe2', name: 'PoE2 mapper', gameVariant: 2 }),
    ]
    installApi(profiles)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    const nextSettings = settings({ poeVersion: 2, activeProfileId: 'poe2' })
    vi.mocked(window.api.setActiveProfile)
      .mockResolvedValueOnce({ ok: false, requiresRestart: true, targetGame: 2 })
      .mockImplementationOnce(async () => {
        profiles[0].active = false
        profiles[1].active = true
        return { ok: true, settings: nextSettings, devRestartRequired: true }
      })
    const onSettingsChange = vi.fn()

    render(<ProfileManagerTab settings={settings()} onSettingsChange={onSettingsChange} onEditProfile={vi.fn()} />)

    await screen.findByText('PoE2 mapper')
    fireEvent.click(screen.getByRole('button', { name: 'Restart to Switch' }))

    await waitFor(() => expect(onSettingsChange).toHaveBeenCalledWith(nextSettings))
    expect(window.api.setActiveProfile).toHaveBeenCalledTimes(2)
    expect(
      await screen.findByText('Profile selected. Restart the dev app to attach to the selected game.'),
    ).toBeInTheDocument()
  })

  it('delegates Edit clicks to the app-level route handler', async () => {
    const profiles = [profile({ id: 'poe1', name: 'Atlas Mapper', gameVariant: 1, active: true })]
    installApi(profiles)
    const onEditProfile = vi.fn()

    render(<ProfileManagerTab settings={settings()} onSettingsChange={vi.fn()} onEditProfile={onEditProfile} />)

    await screen.findByText('Atlas Mapper')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    expect(onEditProfile).toHaveBeenCalledWith(profiles[0])
  })
})
