import Store from 'electron-store'
import type { AppSettings, CheatSheetsSettings, GameVariant, PoeProfile, PoeProfileSummary, RegexPreset, TradePriceOption } from '../shared/types'
import { getProfileStore, type ProfileStore } from './profiles/store'

export type ProfileBackedKey = 'league' | 'filterPath' | 'filterDir' | 'tradePriceOption' | 'cheatSheets'
export type SettingChangeKey = keyof AppSettings | ProfileBackedKey

/** Map a SettingChangeKey to its settable value type. */
export type SettingValue<K extends SettingChangeKey> =
  K extends keyof AppSettings ? AppSettings[K]
  : K extends ProfileBackedKey ? PoeProfile[typeof PROFILE_FIELD_BY_KEY[K]]
  : never

/** A single setting change with its fully-resolved value type. */
export type ProfileChangedSetting =
  | ({ [K in keyof AppSettings]: { key: K; value: AppSettings[K] } })[keyof AppSettings]
  | ({ [K in ProfileBackedKey]: { key: K; value: PoeProfile[typeof PROFILE_FIELD_BY_KEY[K]] } })[ProfileBackedKey]

/** The union of all profile-backed value types (useful at IPC boundaries). */
export type ProfileBackedValue = SettingValue<ProfileBackedKey>

const PROFILE_BACKED_KEYS = [
  'league',
  'filterPath',
  'filterDir',
  'tradePriceOption',
  'cheatSheets',
] as const satisfies readonly ProfileBackedKey[]

const PROFILE_FIELD_BY_KEY = {
  league: 'league',
  filterPath: 'filterPath',
  filterDir: 'filterDir',
  tradePriceOption: 'tradePriceOption',
  cheatSheets: 'cheatSheets',
} as const satisfies Record<ProfileBackedKey, keyof PoeProfile>

const PROFILE_BACKED_DEFAULTS = {
  league: '',
  filterPath: '',
  filterDir: '',
  tradePriceOption: 'chaos_divine' as TradePriceOption,
  cheatSheets: { globalHotkey: '', categories: [], pinned: false } as CheatSheetsSettings,
} satisfies { [K in ProfileBackedKey]: SettingValue<K> }

export const ACTIVE_PROFILE_ID_KEY = 'activeProfileId' satisfies keyof AppSettings
export const PROFILE_VERSION_KEY = 'poeVersion' satisfies keyof AppSettings
export const LAST_PROFILE_ID_POE1_KEY = 'lastProfileIdPoe1' satisfies keyof AppSettings
export const LAST_PROFILE_ID_POE2_KEY = 'lastProfileIdPoe2' satisfies keyof AppSettings

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

function rememberRuntimeChange<K extends SettingChangeKey>(changed: ProfileChangedSetting[], key: K, value: SettingValue<K>): void {
  changed.push({ key, value } as ProfileChangedSetting)
}

function rememberActiveProfileChange(
  store: Store<AppSettings>,
  changed: ProfileChangedSetting[],
): void {
  const profile = getActiveProfile(store)
  changed.push({ key: 'activeProfile', value: profile })
}

export function isProfileBackedKey(key: string): key is ProfileBackedKey {
  return (PROFILE_BACKED_KEYS as readonly string[]).includes(key)
}

export function findLastUsedProfileByGameVariant(store: Store<AppSettings>, variant: GameVariant): PoeProfile | null {
  const profiles =
    maybeProfileStore()
      ?.listProfiles()
      .filter((p) => p.gameVariant === variant) ?? []
  const lastId = store.get(lastProfileIdKey(variant))
  return profiles.find((profile) => profile.id === lastId) ?? profiles[0] ?? null
}

export function getActiveProfile(store: Store<AppSettings>): PoeProfile | null {
  const id = store.get(ACTIVE_PROFILE_ID_KEY)
  return id ? (maybeProfileStore()?.getProfile(id) ?? null) : null
}

export function getProfileBackedSetting<K extends ProfileBackedKey>(store: Store<AppSettings>, key: K): PoeProfile[typeof PROFILE_FIELD_BY_KEY[K]] {
  const active = getActiveProfile(store)
  if (active) return active[PROFILE_FIELD_BY_KEY[key]]
  return PROFILE_BACKED_DEFAULTS[key]
}

export function getEffectiveSettings(store: Store<AppSettings>): AppSettings {
  const settings = { ...store.store } as AppSettings
  settings.activeProfile = getActiveProfile(store)
  return settings
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
  rememberRuntimeChange(changed, 'league', profile.league)
  rememberRuntimeChange(changed, 'filterPath', profile.filterPath)
  rememberRuntimeChange(changed, 'filterDir', profile.filterDir)
  rememberRuntimeChange(changed, 'tradePriceOption', profile.tradePriceOption)
  rememberRuntimeChange(changed, 'cheatSheets', profile.cheatSheets)
  rememberActiveProfileChange(store, changed)
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

export function getProfileById(id: string): PoeProfile | null {
  return profileStore().getProfile(id)
}

export function persistProfileSwitchForRestart(store: Store<AppSettings>, profile: PoeProfile): void {
  store.set(ACTIVE_PROFILE_ID_KEY, profile.id)
  store.set(lastProfileIdKey(profile.gameVariant), profile.id)
  store.set(PROFILE_VERSION_KEY, profile.gameVariant)
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

  const remaining = profileStore().listProfiles()

  if (deleting && store.get(lastProfileIdKey(deleting.gameVariant)) === id) {
    const fallbackLast = remaining.find((profile) => profile.gameVariant === deleting.gameVariant)
    rememberChange(store, changed, lastProfileIdKey(deleting.gameVariant), fallbackLast?.id ?? '')
  }

  if (activeId !== id) return changed

  const fallback = deleting ? remaining.find((profile) => profile.gameVariant === deleting.gameVariant) : null
  if (!fallback) {
    rememberChange(store, changed, ACTIVE_PROFILE_ID_KEY, '')
    return changed
  }
  for (const change of hydrateProfileSettings(store, fallback)) {
    if (!changed.some((existing) => existing.key === change.key)) changed.push(change)
  }
  return changed
}

export function writeActiveProfileSetting<K extends ProfileBackedKey>(
  store: Store<AppSettings>,
  key: K,
  value: PoeProfile[typeof PROFILE_FIELD_BY_KEY[K]],
): ProfileChangedSetting[] {
  const changed: ProfileChangedSetting[] = []
  const variant = store.get(PROFILE_VERSION_KEY) === 2 ? 2 : 1

  const activeId = store.get(ACTIVE_PROFILE_ID_KEY)
  const profile = activeId ? profileStore().getProfile(activeId) : null
  if (profile && profile.gameVariant === variant) {
    profile[PROFILE_FIELD_BY_KEY[key] as keyof PoeProfile] = value as PoeProfile[keyof PoeProfile]
    profile.updatedAt = new Date().toISOString()
    profileStore().saveProfile(profile)
  }

  rememberRuntimeChange(changed, key, value)
  rememberActiveProfileChange(store, changed)

  return changed
}

export function writeLastUsedProfileSettingByGameVariant<K extends ProfileBackedKey>(
  store: Store<AppSettings>,
  variant: GameVariant,
  key: K,
  value: PoeProfile[typeof PROFILE_FIELD_BY_KEY[K]],
): ProfileChangedSetting[] {
  const changed: ProfileChangedSetting[] = []

  let profile = findLastUsedProfileByGameVariant(store, variant)
  if (!profile) {
    profile = profileStore().createProfile({ name: `Path of Exile ${variant}`, gameVariant: variant })
    rememberChange(store, changed, lastProfileIdKey(variant), profile.id)
    if (!store.get(ACTIVE_PROFILE_ID_KEY)) rememberChange(store, changed, ACTIVE_PROFILE_ID_KEY, profile.id)
  }
  if (profile) {
    profile[PROFILE_FIELD_BY_KEY[key] as keyof PoeProfile] = value as PoeProfile[keyof PoeProfile]
    profile.updatedAt = new Date().toISOString()
    profileStore().saveProfile(profile)
  }

  if (store.get(PROFILE_VERSION_KEY) === variant) {
    rememberRuntimeChange(changed, key, value)
    rememberActiveProfileChange(store, changed)
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
