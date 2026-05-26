import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'
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

function ProfileManagerStoryboard({
  initialProfiles,
  initialSettings,
  autoOpenRename = false,
}: {
  initialProfiles: PoeProfileSummary[]
  initialSettings: RuntimeSettings
  autoOpenRename?: boolean
}): JSX.Element {
  const [profiles, setProfiles] = useState(initialProfiles)
  const [currentSettings, setCurrentSettings] = useState(initialSettings)

  ;(window as unknown as { api: Partial<typeof window.api> }).api = {
    listProfiles: async () => profiles,
    renameProfile: async (id: string, name: string) => {
      let renamed: PoeProfileSummary | null = null
      setProfiles((prev) =>
        prev.map((p) => {
          if (p.id !== id) return p
          renamed = { ...p, name }
          return renamed
        }),
      )
      return renamed
    },
    createProfile: async ({ name, gameVariant }) => {
      const created = profile({ id: crypto.randomUUID(), name, gameVariant })
      setProfiles((prev) => [...prev, created])
      return created
    },
    duplicateProfile: async (id: string, name: string) => {
      const source = profiles.find((p) => p.id === id) ?? profile({ id, name, gameVariant: 1 })
      const created = { ...source, id: crypto.randomUUID(), name, active: false }
      setProfiles((prev) => [...prev, created])
      return created
    },
    deleteProfile: async (id: string) => {
      setProfiles((prev) => prev.filter((p) => p.id !== id))
    },
    getSettings: async () => currentSettings,
    setActiveProfile: async (id: string) => {
      const selected = profiles.find((p) => p.id === id)
      if (!selected) return { ok: false, error: 'Profile not found' }
      if (selected.gameVariant !== currentSettings.poeVersion) {
        return { ok: false, requiresRestart: true, targetGame: selected.gameVariant }
      }
      const next = { ...currentSettings, activeProfileId: id }
      setCurrentSettings(next)
      setProfiles((prev) => prev.map((p) => ({ ...p, active: p.id === id })))
      return { ok: true, settings: next }
    },
  }

  useEffect(() => {
    if (!autoOpenRename) return
    const timer = window.setTimeout(() => {
      const rename = Array.from(document.querySelectorAll('button')).find((button) => button.textContent === 'Rename')
      rename?.click()
    }, 50)
    return () => window.clearTimeout(timer)
  }, [autoOpenRename])

  return (
    <div className="w-[430px] bg-bg-solid text-text p-4">
      <ProfileManagerTab settings={currentSettings} onSettingsChange={setCurrentSettings} onEditProfile={() => {}} />
    </div>
  )
}

const poe1 = profile({
  id: 'poe1',
  name: 'League Start Mapper',
  gameVariant: 1,
  league: 'Mirage',
  filterPath: 'C:\\Filters\\mapper.filter',
  active: true,
})
const poe2 = profile({
  id: 'poe2',
  name: 'PoE2 Boss Rush',
  gameVariant: 2,
  league: 'Fate of the Vaal',
  filterPath: 'C:\\Filters\\poe2-boss.filter',
})

const meta: Meta<typeof ProfileManagerStoryboard> = {
  title: 'Profiles / ProfileManagerTab',
  component: ProfileManagerStoryboard,
}
export default meta

type Story = StoryObj<typeof ProfileManagerStoryboard>

export const Empty: Story = {
  args: {
    initialProfiles: [],
    initialSettings: settings({ activeProfileId: '' }),
  },
}

export const ActiveProfile: Story = {
  args: {
    initialProfiles: [poe1],
    initialSettings: settings({ activeProfileId: 'poe1' }),
  },
}

export const CrossGameRestart: Story = {
  args: {
    initialProfiles: [poe1, poe2],
    initialSettings: settings({ poeVersion: 1, activeProfileId: 'poe1' }),
  },
}

export const InlineRename: Story = {
  args: {
    initialProfiles: [poe1, poe2],
    initialSettings: settings({ poeVersion: 1, activeProfileId: 'poe1' }),
    autoOpenRename: true,
  },
}
