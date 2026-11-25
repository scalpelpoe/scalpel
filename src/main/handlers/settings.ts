import { app, ipcMain } from 'electron'
import type Store from 'electron-store'
import type { AppSettings, GameVariant, RegexPreset } from '@shared/types'
import { IPC_CHANNELS } from '@shared/contracts/ipc'
import {
  capturePlatformStartupValues,
  findPlatformSetting,
  platformBanners,
  readRecentWindowHints,
} from '@scalpel/platform'
import { backfillPresetNames } from './regex-preset-names'
import { broadcastToWindows } from '../window-broadcast'
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
  listProfileSummaries,
  renameProfile,
  writeActiveRegexPresetsByGameVariant,
  type ProfileChangedSetting,
  type ProfileSettingKey,
  type ProfileSettingValue,
} from '../profiles/profile-settings'
import { getOverlayAttachedVersion } from '../overlay'
import { shouldRelaunchAfterOnboarding } from '../onboarding-relaunch'
import { getGameSwitchCoordinator } from '../experimental'
import { relaunchApp } from '../relaunch'
import { PLATFORM_SETTING_KEYS, readPlatformSettingsView } from '../platform-settings'
import { recordMainBreadcrumb } from '../diagnostics'

export function register(
  store: Store<AppSettings>,
  platformStartupValues: Readonly<Record<string, string>> = capturePlatformStartupValues(
    readPlatformSettingsView(store),
  ),
): void {
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

  ipcMain.handle(IPC_CHANNELS.SETTINGS.GET_PLATFORM, () => {
    const view = readPlatformSettingsView(store)
    return {
      view,
      startupValues: platformStartupValues,
      banners: platformBanners(view, platformStartupValues),
      recentWindowTitles: readRecentWindowHints(),
    }
  })

  // Opaque descriptor ids cross IPC; only main maps them to persisted keys. The
  // package owns availability and restart semantics, so a stale/hidden control
  // cannot be written by a renderer that missed a refresh.
  ipcMain.handle(IPC_CHANNELS.SETTINGS.SET_PLATFORM, (event, id: string, value: string) => {
    const key = (PLATFORM_SETTING_KEYS as Readonly<Record<string, keyof AppSettings>>)[id]
    if (!key) throw new Error(`unknown platform setting: ${id}`)

    const view = readPlatformSettingsView(store)
    const setting = findPlatformSetting(view, id)
    if (!setting || setting.availability !== 'available') throw new Error(`unavailable platform setting: ${id}`)
    if (!setting.options.some((option) => option.id === value)) throw new Error(`invalid value for ${id}: ${value}`)

    const previousValue = setting.value
    applySetting(store, key, value as never, event.sender)

    const restartRequired = Boolean(setting.requiresRestart)
    const devRestartRequired = restartRequired && !app.isPackaged
    const nextSetting = findPlatformSetting(readPlatformSettingsView(store), id)
    if (previousValue !== value) {
      recordMainBreadcrumb(
        `platform setting changed id=${id} key=${key} value=${previousValue}->${value} ` +
          `applied=${nextSetting?.appliedValue ?? '-'} effective=${nextSetting?.effectiveValue ?? '-'} ` +
          `availability=${nextSetting?.availability ?? '-'} restart=${restartRequired}` +
          (devRestartRequired ? ' (dev build: restart the dev app manually)' : ''),
      )
    } else {
      recordMainBreadcrumb(`platform setting unchanged id=${id} key=${key} value=${value}`, 'debug')
    }
    return { restartRequired, devRestartRequired }
  })

  // Onboarding's final step. The overlay attached to a game window once at
  // startup (default PoE1); the setup flow may have since switched the in-process
  // version to PoE2 without a relaunch. If they diverge the overlay is bound to
  // the wrong game and price-check results never surface -- so relaunch to
  // rebind, mirroring the tray / set-active-profile cross-game switch. Main owns
  // both flag writes here so they persist before any relaunch.
  ipcMain.handle('finish-onboarding', (event) => {
    applySetting(store, 'onboardingCompleted', true, event.sender)
    applySetting(store, 'onboardingStep', '', event.sender)

    const active = store.get('poeVersion') === 2 ? 2 : 1
    const action = shouldRelaunchAfterOnboarding(active, getOverlayAttachedVersion(), app.isPackaged)
    if (action === 'dev-warn') {
      console.warn(
        `[onboarding] active=PoE${active} but overlay attached to PoE${getOverlayAttachedVersion()}; restart dev to re-attach`,
      )
      return { ok: true as const, devRestartRequired: true as const }
    }
    if (action === 'relaunch') {
      relaunchApp()
      app.quit()
      return { ok: true as const, restarting: true as const }
    }
    return { ok: true as const }
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
    return getGameSwitchCoordinator(store).applyProfileSwitch(store, id, restartIfNeeded, event.sender)
  })

  // `force` skips the hourly cooldown - the settings Refresh button is a
  // deliberate user action, so it must always hit the network.
  ipcMain.handle('refresh-leagues', async (event, force = false) => {
    const previous = getEffectiveSettings(store)
    const changed = await refreshLeagues(store, undefined, { force })
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

  // Regex presets live in a per-version slot. Resolve the active slot at each
  // operation because multi-title attachment can switch games in-process.
  const regexPresetsKey = (): 'regexPresetsPoe1' | 'regexPresetsPoe2' =>
    store.get('poeVersion') === 2 ? 'regexPresetsPoe2' : 'regexPresetsPoe1'

  ipcMain.handle('get-regex-presets', () => {
    const stored = store.get(regexPresetsKey()) ?? []
    const { presets, changed } = backfillPresetNames(stored)
    if (changed) {
      const variant: 1 | 2 = regexPresetsKey() === 'regexPresetsPoe2' ? 2 : 1
      writeActiveRegexPresetsByGameVariant(store, variant, presets)
    }
    return presets
  })

  ipcMain.handle('save-regex-preset', (event, preset: RegexPreset) => {
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
    broadcastToWindows('regex-presets-changed', event.sender)
    return presets
  })

  ipcMain.handle('delete-regex-preset', (event, id: string) => {
    const key = regexPresetsKey()
    const presets = store.get(key) ?? []
    const filtered = presets.filter((p) => p.id !== id)
    const variant: 1 | 2 = key === 'regexPresetsPoe2' ? 2 : 1
    writeActiveRegexPresetsByGameVariant(store, variant, filtered)
    broadcastToWindows('regex-presets-changed', event.sender)
    return filtered
  })

  ipcMain.handle('reorder-regex-presets', (event, ids: string[]) => {
    const key = regexPresetsKey()
    const presets = store.get(key) ?? []
    const byId = new Map(presets.map((p) => [p.id, p]))
    const reordered = ids.map((id) => byId.get(id)).filter(Boolean) as RegexPreset[]
    const variant: 1 | 2 = key === 'regexPresetsPoe2' ? 2 : 1
    writeActiveRegexPresetsByGameVariant(store, variant, reordered)
    broadcastToWindows('regex-presets-changed', event.sender)
    return reordered
  })
}
