import Store from 'electron-store'
import type { AppSettings, GameVariant, PoeProfile, PoeProfileSummary, RegexPreset } from '../shared/types'
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

export const ACTIVE_PROFILE_ID_KEY = 'activeProfileId' satisfies keyof AppSettings
export const PROFILE_VERSION_KEY = 'poeVersion' satisfies keyof AppSettings
export const LAST_PROFILE_ID_POE1_KEY = 'lastProfileIdPoe1' satisfies keyof AppSettings
export const LAST_PROFILE_ID_POE2_KEY = 'lastProfileIdPoe2' satisfies keyof AppSettings

const MIRROR_BY_KEY = {
  league: ['leaguePoe1', 'leaguePoe2'],
  filterPath: ['filterPathPoe1', 'filterPathPoe2'],
  filterDir: ['filterDirPoe1', 'filterDirPoe2'],
  tradePriceOption: ['tradePriceOptionPoe1', 'tradePriceOptionPoe2'],
  cheatSheets: ['cheatSheetsPoe1', 'cheatSheetsPoe2'],
} as const satisfies Record<ProfileBackedKey, readonly [keyof AppSettings, keyof AppSettings]>

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

function lastProfileIdKey(variant: GameVariant): 'lastProfileIdPoe1' | 'lastProfileIdPoe2' {
  return variant === 2 ? LAST_PROFILE_ID_POE2_KEY : LAST_PROFILE_ID_POE1_KEY
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

export function findProfileByGameVariant(store: Store<AppSettings>, variant: GameVariant): PoeProfile | null {
  return findLastUsedProfileByGameVariant(store, variant)
}

export function findLastUsedProfileByGameVariant(store: Store<AppSettings>, variant: GameVariant): PoeProfile | null {
  const profiles =
    maybeProfileStore()
      ?.listProfiles()
      .filter((p) => p.gameVariant === variant) ?? []
  const lastId = store.get(lastProfileIdKey(variant))
  return profiles.find((profile) => profile.id === lastId) ?? profiles[0] ?? null
}

export function listProfilesByGameVariant(variant: GameVariant): PoeProfile[] {
  return (
    maybeProfileStore()
      ?.listProfiles()
      .filter((profile) => profile.gameVariant === variant) ?? []
  )
}

export function listProfileSummaries(store: Store<AppSettings>): PoeProfileSummary[] {
  const activeId = store.get(ACTIVE_PROFILE_ID_KEY)
  return profileStore()
    .listProfiles()
    .map((profile) => ({
      id: profile.id,
      name: profile.name,
      gameVariant: profile.gameVariant,
      league: profile.league,
      filterDir: profile.filterDir,
      filterPath: profile.filterPath,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      active: profile.id === activeId,
    }))
}

export function hydrateProfileSettings(store: Store<AppSettings>, profile: PoeProfile): ProfileChangedSetting[] {
  profileStore().touchProfile(profile.id)
  const changed: ProfileChangedSetting[] = []
  rememberChange(store, changed, ACTIVE_PROFILE_ID_KEY, profile.id)
  rememberChange(store, changed, lastProfileIdKey(profile.gameVariant), profile.id)
  rememberChange(store, changed, PROFILE_VERSION_KEY, profile.gameVariant)
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
  const id = store.get(ACTIVE_PROFILE_ID_KEY)
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
  const profile = findLastUsedProfileByGameVariant(store, variant)
  if (!profile) {
    const changed: ProfileChangedSetting[] = []
    rememberChange(store, changed, PROFILE_VERSION_KEY, variant)
    return changed
  }
  return hydrateProfileSettings(store, profile)
}

export function createProfile(
  store: Store<AppSettings>,
  input: { name: string; gameVariant: GameVariant; cloneFromId?: string },
): PoeProfile {
  const profile = profileStore().createProfile(input)
  if (profileStore().listProfiles().length === 1) hydrateProfileSettings(store, profile)
  return profile
}

export function renameProfile(id: string, name: string): PoeProfile | null {
  return profileStore().renameProfile(id, name)
}

export function deleteProfileAndChooseFallback(store: Store<AppSettings>, id: string): ProfileChangedSetting[] {
  const activeId = store.get(ACTIVE_PROFILE_ID_KEY)
  const deleting = profileStore().getProfile(id)
  profileStore().deleteProfile(id)
  const changed: ProfileChangedSetting[] = []

  let remaining = profileStore().listProfiles()
  if (remaining.length === 0) {
    const created = profileStore().createProfile({
      name: 'Path of Exile 1',
      gameVariant: 1,
    })
    remaining = [created]
  }

  if (deleting && store.get(lastProfileIdKey(deleting.gameVariant)) === id) {
    const fallbackLast = remaining.find((profile) => profile.gameVariant === deleting.gameVariant)
    rememberChange(store, changed, lastProfileIdKey(deleting.gameVariant), fallbackLast?.id ?? '')
  }

  if (activeId !== id) return changed

  const fallback =
    (deleting ? remaining.find((profile) => profile.gameVariant === deleting.gameVariant) : null) ?? remaining[0]
  for (const change of hydrateProfileSettings(store, fallback)) {
    if (!changed.some((existing) => existing.key === change.key)) changed.push(change)
  }
  return changed
}

export function writeActiveProfileSetting<K extends ProfileBackedKey>(
  store: Store<AppSettings>,
  key: K,
  value: AppSettings[K],
): ProfileChangedSetting[] {
  const changed: ProfileChangedSetting[] = []
  rememberChange(store, changed, key, value)

  const variant = store.get(PROFILE_VERSION_KEY) === 2 ? 2 : 1
  rememberChange(store, changed, mirrorKey(key, variant), value as AppSettings[keyof AppSettings])

  const activeId = store.get(ACTIVE_PROFILE_ID_KEY)
  const profile = activeId ? profileStore().getProfile(activeId) : null
  if (profile && profile.gameVariant === variant) {
    ;(profile as unknown as Record<string, unknown>)[PROFILE_FIELD_BY_KEY[key]] = value
    profile.updatedAt = new Date().toISOString()
    profileStore().saveProfile(profile)
  }

  return changed
}

export function writeLastUsedProfileSettingByGameVariant<K extends ProfileBackedKey>(
  store: Store<AppSettings>,
  variant: GameVariant,
  key: K,
  value: AppSettings[K],
): ProfileChangedSetting[] {
  const changed: ProfileChangedSetting[] = []
  rememberChange(store, changed, mirrorKey(key, variant), value as AppSettings[keyof AppSettings])

  const profile = findLastUsedProfileByGameVariant(store, variant)
  if (profile) {
    ;(profile as unknown as Record<string, unknown>)[PROFILE_FIELD_BY_KEY[key]] = value
    profile.updatedAt = new Date().toISOString()
    profileStore().saveProfile(profile)
  }

  if (store.get(PROFILE_VERSION_KEY) === variant) {
    rememberChange(store, changed, key, value)
  }

  return changed
}

export function writeActiveRegexPresetsByGameVariant(
  store: Store<AppSettings>,
  variant: GameVariant,
  presets: RegexPreset[],
): ProfileChangedSetting[] {
  const changed: ProfileChangedSetting[] = []
  rememberChange(store, changed, regexKey(variant), presets)

  const activeId = store.get(ACTIVE_PROFILE_ID_KEY)
  const profile = activeId ? profileStore().getProfile(activeId) : null
  if (profile && profile.gameVariant === variant) {
    profile.regexPresets = presets
    profile.updatedAt = new Date().toISOString()
    profileStore().saveProfile(profile)
  }

  return changed
}
