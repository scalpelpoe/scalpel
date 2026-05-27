import { app, ipcMain } from 'electron'
import type Store from 'electron-store'
import type { AppSettings, GameVariant, RegexPreset } from '../../shared/types'
import { getColorFrequencies } from '../filter-state'
import { refreshPrices } from '../trade/prices'
import { refreshLeagues } from '../trade/leagues'
import {
  applyProfileHydrationSideEffects,
  applyProfileSettingForGame,
  applySetting,
  broadcastSettingUpdates,
} from '../settings-write'
import {
  createProfile,
  deleteProfileAndChooseFallback,
  ensureProfileForGame,
  getEffectiveSettings,
  getProfileBackedSetting,
  getProfileById,
  listProfileSummaries,
  persistProfileSwitchForRestart,
  renameProfile,
  writeActiveRegexPresetsByGameVariant,
  type ProfileChangedSetting,
  type ProfileSettingKey,
  type ProfileSettingValue,
} from '../profiles/profile-settings'

export function register(store: Store<AppSettings>): void {
  ipcMain.handle('get-settings', () => getEffectiveSettings(store))

  ipcMain.handle('get-color-frequencies', () => getColorFrequencies())

  ipcMain.handle('refresh-prices', async () => {
    await refreshPrices(getProfileBackedSetting(store, 'league'))
  })

  ipcMain.handle('set-setting', (event, key: keyof AppSettings, value: AppSettings[typeof key]) => {
    // poeVersion writes are valid here: the onboarding flow uses them to switch
    // active game between PoE1 and PoE2 setup steps.
    // requestGameSwitch() in main/game-switch.ts is the user-facing toggle that
    // adds a relaunch prompt; this IPC is the lower-level write.
    applySetting(store, key, value, event.sender)
  })

  ipcMain.handle(
    'set-profile-setting-for-game',
    (event, variant: GameVariant, key: ProfileSettingKey, value: ProfileSettingValue<typeof key>) =>
      applyProfileSettingForGame(store, variant, key, value, event.sender),
  )

  ipcMain.handle('ensure-profile-for-game', (_event, variant: GameVariant) => {
    ensureProfileForGame(store, variant)
  })

  ipcMain.handle('list-profiles', () => listProfileSummaries(store))

  ipcMain.handle(
    'create-profile',
    (_event, input: { name: string; gameVariant: GameVariant; cloneFromId?: string }) => {
      const profile = createProfile(input)
      return listProfileSummaries(store).find((summary) => summary.id === profile.id)!
    },
  )

  ipcMain.handle('rename-profile', (_event, id: string, name: string) => {
    const profile = renameProfile(id, name)
    return profile ? listProfileSummaries(store).find((summary) => summary.id === profile.id) : null
  })

  ipcMain.handle('duplicate-profile', (_event, id: string, name: string) => {
    const profile = createProfile({ name, gameVariant: 1, cloneFromId: id })
    return listProfileSummaries(store).find((summary) => summary.id === profile.id)!
  })

  ipcMain.handle('delete-profile', (event, id: string) => {
    const previous = getEffectiveSettings(store)
    const changes = deleteProfileAndChooseFallback(store, id)
    applyProfileHydrationSideEffects(changes, previous)
    broadcastSettingUpdates(event.sender, changes, previous, getEffectiveSettings(store))
  })

  ipcMain.handle('set-active-profile', async (event, id: string, restartIfNeeded = false) => {
    const profile = getProfileById(id)
    if (!profile) return { ok: false as const, error: 'Profile not found' }

    const current = store.get('poeVersion') === 2 ? 2 : 1
    if (profile.gameVariant !== current) {
      if (!restartIfNeeded) {
        return { ok: false as const, requiresRestart: true as const, targetGame: profile.gameVariant }
      }

      if (!app.isPackaged) {
        applySetting(store, 'activeProfileId', id, event.sender)
        console.warn(`[profile-switch] target=PoE${profile.gameVariant}; restart dev to re-attach`)
        return { ok: true as const, settings: getEffectiveSettings(store), devRestartRequired: true as const }
      }

      persistProfileSwitchForRestart(store, profile)
      app.relaunch()
      app.quit()
      return { ok: true as const, restarting: true as const }
    }

    applySetting(store, 'activeProfileId', id, event.sender)
    return { ok: true as const, settings: getEffectiveSettings(store) }
  })

  ipcMain.handle('refresh-leagues', async (event) => {
    const previous = getEffectiveSettings(store)
    const changed = await refreshLeagues(store)
    const settings = getEffectiveSettings(store)
    const changes: ProfileChangedSetting[] = changed.map((key) => {
      if (key === 'activeProfile') return { key, value: settings.activeProfile, reason: 'migration' }
      return { key, value: settings[key] } as ProfileChangedSetting
    })
    broadcastSettingUpdates(event.sender, changes, previous, settings)
    return {
      leaguesPoe1: store.get('leaguesPoe1'),
      leaguesPoe2: store.get('leaguesPoe2'),
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
