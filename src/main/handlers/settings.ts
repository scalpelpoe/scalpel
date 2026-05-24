import { ipcMain } from 'electron'
import type Store from 'electron-store'
import type { AppSettings, RegexPreset } from '../../shared/types'
import { getColorFrequencies } from '../filter-state'
import { applySetting, broadcastSettingUpdate } from '../settings-write'
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
    store.set(key, presets)
    return presets
  })

  ipcMain.handle('delete-regex-preset', (_event, id: string) => {
    const key = regexPresetsKey()
    const presets = store.get(key) ?? []
    const filtered = presets.filter((p) => p.id !== id)
    store.set(key, filtered)
    return filtered
  })

  ipcMain.handle('reorder-regex-presets', (_event, ids: string[]) => {
    const key = regexPresetsKey()
    const presets = store.get(key) ?? []
    const byId = new Map(presets.map((p) => [p.id, p]))
    const reordered = ids.map((id) => byId.get(id)).filter(Boolean) as RegexPreset[]
    store.set(key, reordered)
    return reordered
  })
}
