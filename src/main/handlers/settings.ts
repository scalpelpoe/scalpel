import { ipcMain } from 'electron'
import type Store from 'electron-store'
import type { AppSettings, RegexPreset } from '../../shared/types'
import { getColorFrequencies } from '../filter-state'
import { refreshPrices } from '../trade/prices'
import { refreshLeagues } from '../trade/leagues'
import { applyProfileHydrationSideEffects, applySetting, broadcastSettingUpdate } from '../settings-write'
import {
  createProfile,
  deleteProfileAndChooseFallback,
  listProfileSummaries,
  renameProfile,
  writeActiveRegexPresetsByGameVariant,
} from '../profile-settings'
import type { AppSettings, GameVariant, RegexPreset } from '../../shared/types'
import { applySetting, broadcastSettingUpdate } from '../settings-write'
import { writeRegexPresetsByGameVariant } from '../profile-settings'
import { refreshLeagues } from '../trade/leagues'
import { refreshPrices } from '../trade/prices'

export function register(store: Store<AppSettings>): void {
  ipcMain.handle('get-settings', () => store.store)

  ipcMain.handle('get-color-frequencies', () => getColorFrequencies())

  ipcMain.handle('refresh-prices', async () => {
    await refreshPrices(store.get('league'))
  })

  ipcMain.handle('set-setting', (event, key: keyof AppSettings, value: AppSettings[typeof key]) => {
    // poeVersion writes are valid here: the onboarding flow uses them to switch
    // active game between PoE1 and PoE2 setup steps, atomically writing the
    // dependent flat fields (filterDir/filterPath/league) on either side.
    // requestGameSwitch() in main/game-switch.ts is the user-facing toggle that
    // adds a relaunch prompt; this IPC is the lower-level write.
    applySetting(store, key, value, event.sender)
  })

  ipcMain.handle('list-profiles', () => listProfileSummaries(store))

  ipcMain.handle(
    'create-profile',
    (_event, input: { name: string; gameVariant: GameVariant; cloneFromId?: string }) => {
      const profile = createProfile(store, input)
      return listProfileSummaries(store).find((summary) => summary.id === profile.id)!
    },
  )

  ipcMain.handle('rename-profile', (_event, id: string, name: string) => {
    const profile = renameProfile(id, name)
    return profile ? listProfileSummaries(store).find((summary) => summary.id === profile.id) : null
  })

  ipcMain.handle('duplicate-profile', (_event, id: string, name: string) => {
    const profile = createProfile(store, { name, gameVariant: 1, cloneFromId: id })
    return listProfileSummaries(store).find((summary) => summary.id === profile.id)!
  })

  ipcMain.handle('delete-profile', (event, id: string) => {
    const previous = {
      activeProfileId: store.get('activeProfileId'),
      poeVersion: store.get('poeVersion'),
      filterPath: store.get('filterPath'),
      league: store.get('league'),
      cheatSheets: store.get('cheatSheets'),
    }
    const changes = deleteProfileAndChooseFallback(store, id)
    applyProfileHydrationSideEffects(changes, previous)
    for (const change of changes) {
      broadcastSettingUpdate(event.sender, change.key, change.value)
    }
  })

  ipcMain.handle('set-active-profile', async (event, id: string) => {
    applySetting(store, 'activeProfileId', id, event.sender)
    return store.store
  })

  ipcMain.handle('refresh-leagues', async (event) => {
    const changed = await refreshLeagues(store)
    for (const key of changed) {
      broadcastSettingUpdate(event.sender, key, store.get(key))
    }
    return {
      leaguesPoe1: store.get('leaguesPoe1'),
      leaguesPoe2: store.get('leaguesPoe2'),
      leaguePoe1: store.get('leaguePoe1'),
      leaguePoe2: store.get('leaguePoe2'),
      league: store.get('league'),
    }
  })

  // Regex presets live in a per-version slot. The relaunch-on-game-switch flow
  // (ensureCorrectGameForHotkey) means `poeVersion` is stable for the lifetime
  // of this process, so it's safe to capture the active key once and reuse it.
  const regexPresetsKey = (): 'regexPresetsPoe1' | 'regexPresetsPoe2' =>
    store.get('poeVersion') === 2 ? 'regexPresetsPoe2' : 'regexPresetsPoe1'

  ipcMain.handle('get-regex-presets', () => {
    return store.get(regexPresetsKey()) ?? []
  })

  ipcMain.handle('save-regex-preset', (_event, preset: RegexPreset) => {
    const key = regexPresetsKey()
    const presets = store.get(key) ?? []
    const existingIdx = presets.findIndex((p) => p.id === preset.id)
    if (existingIdx >= 0) {
      presets[existingIdx] = preset
    } else {
      presets.push(preset)
    }
    const variant: 1 | 2 = key === 'regexPresetsPoe2' ? 2 : 1
    writeActiveRegexPresetsByGameVariant(store, variant, presets)
    return presets
  })

  ipcMain.handle('delete-regex-preset', (_event, id: string) => {
    const key = regexPresetsKey()
    const presets = store.get(key) ?? []
    const filtered = presets.filter((p) => p.id !== id)
    const variant: 1 | 2 = key === 'regexPresetsPoe2' ? 2 : 1
    writeActiveRegexPresetsByGameVariant(store, variant, filtered)
    return filtered
  })

  ipcMain.handle('reorder-regex-presets', (_event, ids: string[]) => {
    const key = regexPresetsKey()
    const presets = store.get(key) ?? []
    const byId = new Map(presets.map((p) => [p.id, p]))
    const reordered = ids.map((id) => byId.get(id)).filter(Boolean) as RegexPreset[]
    const variant: 1 | 2 = key === 'regexPresetsPoe2' ? 2 : 1
    writeActiveRegexPresetsByGameVariant(store, variant, reordered)
    return reordered
  })
}
