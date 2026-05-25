import Store from 'electron-store'
import type {
  AppSettings,
  GameVariant,
  PoeProfile,
  PoeProfileSummary,
  ProfileSettingKey,
  ProfileSettingValue,
  RegexPreset,
  RuntimeSettings,
} from '../../shared/types'
import { getProfileStore, type ProfileStore } from './store'

export type ProfileChangedSetting =
  | { key: 'activeProfile'; value: PoeProfile | null; reason: 'activation' | 'edit' | 'migration' }
  | { key: keyof AppSettings; value: unknown }

export type SettingChangeKey = keyof AppSettings | 'activeProfile'

export type { ProfileSettingKey, ProfileSettingValue }

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
  changed.push({ key, value } as ProfileChangedSetting)
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

export function getProfileBackedSetting<K extends ProfileSettingKey>(
  store: Store<AppSettings>,
  key: K,
): ProfileSettingValue<K> {
  const active = getActiveProfile(store)
  if (active) return active[key]
  if (key === 'cheatSheets')
    return { globalHotkey: '', categories: [], pinned: false } as unknown as ProfileSettingValue<K>
  if (key === 'tradePriceOption') return 'chaos_divine' as unknown as ProfileSettingValue<K>
  return '' as unknown as ProfileSettingValue<K>
}

export function getEffectiveSettings(store: Store<AppSettings>): RuntimeSettings {
  const settings = { ...store.store } as AppSettings
  return { ...settings, activeProfile: getActiveProfile(store) }
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
  changed.push({ key: 'activeProfile', value: profile, reason: 'activation' })
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
    rememberChange(store, changed, ACTIVE_PROFILE_ID_KEY, '')
    changed.push({ key: 'activeProfile', value: null, reason: 'activation' })
    return changed
  }
  return hydrateProfileSettings(store, profile)
}

export function createProfile(input: { name: string; gameVariant: GameVariant; cloneFromId?: string }): PoeProfile {
  return profileStore().createProfile(input)
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
    changed.push({ key: 'activeProfile', value: null, reason: 'activation' })
    return changed
  }
  for (const change of hydrateProfileSettings(store, fallback)) {
    if (!changed.some((existing) => existing.key === change.key)) changed.push(change)
  }
  return changed
}

export function writeActiveProfileSetting<K extends ProfileSettingKey>(
  store: Store<AppSettings>,
  key: K,
  value: ProfileSettingValue<K>,
): ProfileChangedSetting[] {
  const activeId = store.get(ACTIVE_PROFILE_ID_KEY)
  const profile = activeId ? profileStore().getProfile(activeId) : null
  if (profile) {
    profile[key] = value
    profile.updatedAt = new Date().toISOString()
    profileStore().saveProfile(profile)
  }
  return [{ key: 'activeProfile', value: getActiveProfile(store), reason: 'edit' }]
}

export function writeLastUsedProfileSettingByGameVariant<K extends ProfileSettingKey>(
  store: Store<AppSettings>,
  variant: GameVariant,
  key: K,
  value: ProfileSettingValue<K>,
): ProfileChangedSetting[] {
  let profile = findLastUsedProfileByGameVariant(store, variant)
  if (!profile) {
    profile = profileStore().createProfile({ name: `Path of Exile ${variant}`, gameVariant: variant })
    store.set(lastProfileIdKey(variant), profile.id)
    if (!store.get(ACTIVE_PROFILE_ID_KEY)) store.set(ACTIVE_PROFILE_ID_KEY, profile.id)
  }
  if (profile) {
    profile[key] = value
    profile.updatedAt = new Date().toISOString()
    profileStore().saveProfile(profile)
  }

  const activeId = store.get(ACTIVE_PROFILE_ID_KEY)
  if (activeId && profile && profile.id === activeId) {
    return [{ key: 'activeProfile', value: getActiveProfile(store), reason: 'edit' }]
  }
  return []
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
