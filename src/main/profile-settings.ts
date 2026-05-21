import Store from 'electron-store'
import type { AppSettings, GameVariant, PoeProfile, RegexPreset } from '../shared/types'
import { getProfileStore, type ProfileStore } from './profiles/store'

export type ProfileBackedKey = 'league' | 'filterPath' | 'filterDir' | 'tradePriceOption' | 'cheatSheets'
export type ProfileChangedSetting = { key: keyof AppSettings; value: AppSettings[keyof AppSettings] }

const PROFILE_BACKED_KEYS = [
  'league',
  'filterPath',
  'filterDir',
  'tradePriceOption',
  'cheatSheets',
] as const satisfies readonly ProfileBackedKey[]

const PROFILE_BACKED_KEY_SET = new Set<keyof AppSettings>(PROFILE_BACKED_KEYS)

const PROFILE_FIELD_BY_KEY = {
  league: 'league',
  filterPath: 'filterPath',
  filterDir: 'filterDir',
  tradePriceOption: 'tradePriceOption',
  cheatSheets: 'cheatSheets',
} as const satisfies Record<ProfileBackedKey, keyof PoeProfile>

const MIRROR_BY_KEY = {
  league: ['leaguePoe1', 'leaguePoe2'],
  filterPath: ['filterPathPoe1', 'filterPathPoe2'],
  filterDir: ['filterDirPoe1', 'filterDirPoe2'],
  tradePriceOption: ['tradePriceOptionPoe1', 'tradePriceOptionPoe2'],
  cheatSheets: ['cheatSheetsPoe1', 'cheatSheetsPoe2'],
} as const satisfies Record<ProfileBackedKey, readonly [keyof AppSettings, keyof AppSettings]>

const profileVersionKey = 'poeVersion'
function profileStore(): ProfileStore {
  return getProfileStore()
}

function maybeProfileStore(): ProfileStore | null {
  try {
    return getProfileStore()
  } catch {
    return null
  }
}

function mirrorKey(key: ProfileBackedKey, variant: GameVariant): keyof AppSettings {
  return MIRROR_BY_KEY[key][variant === 2 ? 1 : 0]
}

function regexKey(variant: GameVariant): 'regexPresetsPoe1' | 'regexPresetsPoe2' {
  return variant === 2 ? 'regexPresetsPoe2' : 'regexPresetsPoe1'
}

function rememberChange<K extends keyof AppSettings>(
  store: Store<AppSettings>,
  changed: ProfileChangedSetting[],
  key: K,
  value: AppSettings[K],
): void {
  if (store.get(key) === value) return
  store.set(key, value)
  changed.push({ key, value })
}

export function isProfileBackedKey(key: keyof AppSettings): key is ProfileBackedKey {
  return PROFILE_BACKED_KEY_SET.has(key)
}

export function findProfileByGameVariant(variant: GameVariant): PoeProfile | null {
  return (
    maybeProfileStore()
      ?.listProfiles()
      .find((p) => p.gameVariant === variant) ?? null
  )
}

export function hydrateProfileSettings(store: Store<AppSettings>, profile: PoeProfile): ProfileChangedSetting[] {
  const changed: ProfileChangedSetting[] = []
  rememberChange(store, changed, 'activeProfileId', profile.id)
  rememberChange(store, changed, profileVersionKey, profile.gameVariant)
  rememberChange(store, changed, 'league', profile.league)
  rememberChange(store, changed, 'filterPath', profile.filterPath)
  rememberChange(store, changed, 'filterDir', profile.filterDir)
  rememberChange(store, changed, 'tradePriceOption', profile.tradePriceOption)
  rememberChange(store, changed, 'cheatSheets', profile.cheatSheets)

  for (const key of PROFILE_BACKED_KEYS) {
    const field = PROFILE_FIELD_BY_KEY[key]
    rememberChange(
      store,
      changed,
      mirrorKey(key, profile.gameVariant),
      profile[field] as AppSettings[keyof AppSettings],
    )
  }
  rememberChange(store, changed, regexKey(profile.gameVariant), profile.regexPresets)

  return changed
}

export function hydrateActiveProfileSettings(store: Store<AppSettings>): ProfileChangedSetting[] {
  const id = store.get('activeProfileId')
  const profile = id ? profileStore().getProfile(id) : null
  return profile ? hydrateProfileSettings(store, profile) : []
}

export function switchActiveProfileById(store: Store<AppSettings>, id: string): ProfileChangedSetting[] {
  const profile = profileStore().getProfile(id)
  return profile ? hydrateProfileSettings(store, profile) : []
}

export function switchActiveProfileByGameVariant(
  store: Store<AppSettings>,
  variant: GameVariant,
): ProfileChangedSetting[] {
  const profile = findProfileByGameVariant(variant)
  if (!profile) {
    const changed: ProfileChangedSetting[] = []
    rememberChange(store, changed, profileVersionKey, variant)
    return changed
  }
  return hydrateProfileSettings(store, profile)
}

export function writeActiveProfileSetting<K extends ProfileBackedKey>(
  store: Store<AppSettings>,
  key: K,
  value: AppSettings[K],
): ProfileChangedSetting[] {
  const changed: ProfileChangedSetting[] = []
  rememberChange(store, changed, key, value)

  const variant = store.get(profileVersionKey) === 2 ? 2 : 1
  rememberChange(store, changed, mirrorKey(key, variant), value as AppSettings[keyof AppSettings])

  const activeId = store.get('activeProfileId')
  const profile = activeId ? profileStore().getProfile(activeId) : findProfileByGameVariant(variant)
  if (profile) {
    ;(profile as unknown as Record<string, unknown>)[PROFILE_FIELD_BY_KEY[key]] = value
    profileStore().saveProfile(profile)
  }

  return changed
}

export function writeProfileSettingByGameVariant<K extends ProfileBackedKey>(
  store: Store<AppSettings>,
  variant: GameVariant,
  key: K,
  value: AppSettings[K],
): ProfileChangedSetting[] {
  const changed: ProfileChangedSetting[] = []
  rememberChange(store, changed, mirrorKey(key, variant), value as AppSettings[keyof AppSettings])

  const profile = findProfileByGameVariant(variant)
  if (profile) {
    ;(profile as unknown as Record<string, unknown>)[PROFILE_FIELD_BY_KEY[key]] = value
    profileStore().saveProfile(profile)
  }

  if (store.get(profileVersionKey) === variant) {
    rememberChange(store, changed, key, value)
  }

  return changed
}

export function writeRegexPresetsByGameVariant(
  store: Store<AppSettings>,
  variant: GameVariant,
  presets: RegexPreset[],
): ProfileChangedSetting[] {
  const changed: ProfileChangedSetting[] = []
  rememberChange(store, changed, regexKey(variant), presets)

  const profile = findProfileByGameVariant(variant)
  if (profile) {
    profile.regexPresets = presets
    profileStore().saveProfile(profile)
  }

  return changed
}
