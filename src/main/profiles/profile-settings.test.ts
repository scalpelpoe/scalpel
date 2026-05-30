import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import type Store from 'electron-store'
import type { AppSettings } from '../../shared/types'
import { initProfileStore } from './store'
import {
  ACTIVE_PROFILE_ID_KEY,
  LAST_PROFILE_ID_POE1_KEY,
  LAST_PROFILE_ID_POE2_KEY,
  PROFILE_VERSION_KEY,
  deleteProfileAndChooseFallback,
  ensureProfileForGame,
  getEffectiveSettings,
  getProfileBackedSetting,
  listProfileSummaries,
  switchActiveProfileByGameVariant,
  writeActiveRegexPresetsByGameVariant,
  writeActiveProfileSetting,
  writeLastUsedProfileSettingByGameVariant,
} from './profile-settings'

function makeStore(initial: Record<string, unknown>): Store<AppSettings> {
  const data: Record<string, unknown> = { ...initial }
  return {
    get: (key: string) => data[key],
    set: (key: string, value: unknown) => {
      data[key] = value
    },
    store: data,
  } as unknown as Store<AppSettings>
}

function setupProfiles(): ReturnType<typeof initProfileStore> {
  return initProfileStore(mkdtempSync(join(tmpdir(), 'scalpel-profiles-')))
}

describe('profile-settings', () => {
  it('writes active profile-backed settings to the profile file with edit reason', () => {
    const profiles = setupProfiles()
    const poe1 = profiles.createDefault(1)
    profiles.saveProfile(poe1)

    const store = makeStore({
      [PROFILE_VERSION_KEY]: 1,
      [ACTIVE_PROFILE_ID_KEY]: poe1.id,
    })

    const changes = writeActiveProfileSetting(store, 'league', 'Return of the Settlers')

    expect(changes).toHaveLength(1)
    const change = changes[0]
    expect(change.key).toBe('activeProfile')
    if (change.key === 'activeProfile') {
      expect(change.reason).toBe('edit')
    }
    expect(getEffectiveSettings(store).activeProfile?.league).toBe('Return of the Settlers')
    expect(profiles.getProfile(poe1.id)?.league).toBe('Return of the Settlers')
  })

  it('writes same-game profile-backed settings only to the active profile', () => {
    const profiles = setupProfiles()
    const trade = { ...profiles.createDefault(1), name: 'Trade', league: 'Mirage' }
    const ssf = { ...profiles.createDefault(1), name: 'SSF', league: 'Standard' }
    profiles.saveProfile(trade)
    profiles.saveProfile(ssf)

    const store = makeStore({
      [PROFILE_VERSION_KEY]: 1,
      [ACTIVE_PROFILE_ID_KEY]: ssf.id,
    })

    const changes = writeActiveProfileSetting(store, 'league', 'Return of the Settlers')

    expect(changes).toHaveLength(1)
    const change2 = changes[0]
    expect(change2.key).toBe('activeProfile')
    if (change2.key === 'activeProfile') {
      expect(change2.reason).toBe('edit')
    }
    expect(getEffectiveSettings(store).activeProfile?.league).toBe('Return of the Settlers')
    expect(profiles.getProfile(ssf.id)?.league).toBe('Return of the Settlers')
    expect(profiles.getProfile(trade.id)?.league).toBe('Mirage')
  })

  it('writes regex presets only to the active same-game profile', () => {
    const profiles = setupProfiles()
    const trade = { ...profiles.createDefault(1), name: 'Trade' }
    const ssf = { ...profiles.createDefault(1), name: 'SSF' }
    profiles.saveProfile(trade)
    profiles.saveProfile(ssf)

    const preset = {
      id: 'preset-1',
      regex: '"reflect"',
      tags: [],
      avoid: [],
      want: [],
      wantMode: 'any' as const,
      qualifiers: {},
      nightmare: false,
    }
    const store = makeStore({ [PROFILE_VERSION_KEY]: 1, [ACTIVE_PROFILE_ID_KEY]: ssf.id, regexPresetsPoe1: [] })

    writeActiveRegexPresetsByGameVariant(store, 1, [preset])

    expect(store.get('regexPresetsPoe1')).toEqual([preset])
    expect(profiles.getProfile(ssf.id)?.regexPresets).toEqual([preset])
    expect(profiles.getProfile(trade.id)?.regexPresets).toEqual([])
  })

  it('writes inactive profile settings to the last-used profile without affecting active', () => {
    const profiles = setupProfiles()
    const poe1 = profiles.createDefault(1)
    const poe2 = { ...profiles.createDefault(2), league: 'Fate of the Vaal' }
    profiles.saveProfile(poe1)
    profiles.saveProfile(poe2)

    const store = makeStore({
      [PROFILE_VERSION_KEY]: 1,
      [ACTIVE_PROFILE_ID_KEY]: poe1.id,
      [LAST_PROFILE_ID_POE2_KEY]: poe2.id,
    })

    const changes = writeLastUsedProfileSettingByGameVariant(store, 2, 'league', 'Standard')

    expect(changes).toEqual([])
    expect(profiles.getProfile(poe2.id)?.league).toBe('Standard')
  })

  it('returns edit event when writing to the active profile via last-used', () => {
    const profiles = setupProfiles()
    const poe1 = { ...profiles.createDefault(1), league: 'Mirage' }
    profiles.saveProfile(poe1)

    const store = makeStore({
      [PROFILE_VERSION_KEY]: 1,
      [ACTIVE_PROFILE_ID_KEY]: poe1.id,
      [LAST_PROFILE_ID_POE1_KEY]: poe1.id,
    })

    const changes = writeLastUsedProfileSettingByGameVariant(store, 1, 'league', 'Standard')

    expect(changes).toHaveLength(1)
    const change3 = changes[0]
    expect(change3.key).toBe('activeProfile')
    if (change3.key === 'activeProfile') {
      expect(change3.reason).toBe('edit')
    }
    expect(profiles.getProfile(poe1.id)?.league).toBe('Standard')
  })

  it('switches game variant with activation reason from target profile', () => {
    const profiles = setupProfiles()
    const poe1 = profiles.createDefault(1)
    const poe2 = { ...profiles.createDefault(2), filterPath: 'C:\\filters\\poe2.filter', league: 'Fate of the Vaal' }
    profiles.saveProfile(poe1)
    profiles.saveProfile(poe2)

    const store = makeStore({
      [PROFILE_VERSION_KEY]: 1,
      [ACTIVE_PROFILE_ID_KEY]: poe1.id,
      [LAST_PROFILE_ID_POE2_KEY]: poe2.id,
    })

    const changes = switchActiveProfileByGameVariant(store, 2)

    expect(store.get(ACTIVE_PROFILE_ID_KEY)).toBe(poe2.id)
    expect(store.get(PROFILE_VERSION_KEY)).toBe(2)
    const activeChange = changes.find((c) => c.key === 'activeProfile')
    expect(activeChange).toBeDefined()
    if (activeChange && activeChange.key === 'activeProfile') {
      expect(activeChange.reason).toBe('activation')
      expect(activeChange.value).toEqual(poe2)
    }
    expect(getEffectiveSettings(store).activeProfile?.filterPath).toBe('C:\\filters\\poe2.filter')
    expect(getEffectiveSettings(store).activeProfile?.league).toBe('Fate of the Vaal')
  })

  it('switches games to the explicit last-used profile instead of the newest touched profile', () => {
    const profiles = setupProfiles()
    const poe1 = profiles.createDefault(1)
    const olderChoice = {
      ...profiles.createDefault(2),
      name: 'Bossing',
      filterPath: 'C:\\filters\\bossing.filter',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const newerTouched = {
      ...profiles.createDefault(2),
      name: 'Mapping',
      filterPath: 'C:\\filters\\mapping.filter',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }
    profiles.saveProfile(poe1)
    profiles.saveProfile(olderChoice)
    profiles.saveProfile(newerTouched)

    const store = makeStore({
      [PROFILE_VERSION_KEY]: 1,
      [ACTIVE_PROFILE_ID_KEY]: poe1.id,
      [LAST_PROFILE_ID_POE2_KEY]: olderChoice.id,
    })

    const changes = switchActiveProfileByGameVariant(store, 2)

    expect(store.get(ACTIVE_PROFILE_ID_KEY)).toBe(olderChoice.id)
    expect(store.get(LAST_PROFILE_ID_POE2_KEY)).toBe(olderChoice.id)
    const activeChange = changes.find((c) => c.key === 'activeProfile')
    expect(activeChange).toBeDefined()
    if (activeChange && activeChange.key === 'activeProfile') {
      expect(activeChange.reason).toBe('activation')
    }
    expect(getEffectiveSettings(store).activeProfile?.filterPath).toBe('C:\\filters\\bossing.filter')
  })

  it('discovers multiple profiles per game and marks the active one', () => {
    const profiles = setupProfiles()
    const trade = { ...profiles.createDefault(1), name: 'Mirage trade', league: 'Mirage' }
    const ssf = { ...profiles.createDefault(1), name: 'SSF strict', league: 'Standard' }
    profiles.saveProfile(trade)
    profiles.saveProfile(ssf)

    const store = makeStore({ [ACTIVE_PROFILE_ID_KEY]: ssf.id })

    const summaries = listProfileSummaries(store)

    expect(summaries.filter((profile) => profile.gameVariant === 1)).toHaveLength(2)
    expect(summaries.find((profile) => profile.id === ssf.id)?.active).toBe(true)
  })

  it('deleting the active profile switches to a remaining profile for the same game', () => {
    const profiles = setupProfiles()
    const trade = { ...profiles.createDefault(1), name: 'Mirage trade', league: 'Mirage' }
    const ssf = { ...profiles.createDefault(1), name: 'SSF strict', league: 'Standard' }
    profiles.saveProfile(trade)
    profiles.saveProfile(ssf)

    const store = makeStore({
      [ACTIVE_PROFILE_ID_KEY]: ssf.id,
      [LAST_PROFILE_ID_POE1_KEY]: ssf.id,
      [PROFILE_VERSION_KEY]: 1,
    })

    const changes = deleteProfileAndChooseFallback(store, ssf.id)

    expect(store.get(ACTIVE_PROFILE_ID_KEY)).toBe(trade.id)
    expect(store.get(LAST_PROFILE_ID_POE1_KEY)).toBe(trade.id)
    const activeChange = changes.find((c) => c.key === 'activeProfile')
    expect(activeChange).toBeDefined()
    if (activeChange && activeChange.key === 'activeProfile') {
      expect(activeChange.reason).toBe('activation')
    }
    expect(getEffectiveSettings(store).activeProfile?.league).toBe('Mirage')
    expect(profiles.getProfile(ssf.id)).toBeNull()
  })

  it('deleting the active last profile for a game leaves no active profile for that game', () => {
    const profiles = setupProfiles()
    const poe1 = { ...profiles.createDefault(1), league: 'Mirage' }
    const poe2 = { ...profiles.createDefault(2), league: 'Fate of the Vaal' }
    profiles.saveProfile(poe1)
    profiles.saveProfile(poe2)

    const store = makeStore({
      [ACTIVE_PROFILE_ID_KEY]: poe2.id,
      [LAST_PROFILE_ID_POE2_KEY]: poe2.id,
      [PROFILE_VERSION_KEY]: 2,
    })

    const changes = deleteProfileAndChooseFallback(store, poe2.id)

    expect(profiles.listProfiles().find((profile) => profile.gameVariant === 2)).toBeUndefined()
    expect(store.get(ACTIVE_PROFILE_ID_KEY)).toBe('')
    expect(store.get(LAST_PROFILE_ID_POE2_KEY)).toBe('')
    expect(store.get(PROFILE_VERSION_KEY)).toBe(2)
    expect(profiles.getProfile(poe2.id)).toBeNull()
    const nullChange = changes.find((c) => c.key === 'activeProfile')
    expect(nullChange).toBeDefined()
    if (nullChange && nullChange.key === 'activeProfile') {
      expect(nullChange.reason).toBe('activation')
      expect(nullChange.value).toBeNull()
    }
  })

  it('deleting an inactive last profile for a game clears that game without changing active profile', () => {
    const profiles = setupProfiles()
    const poe1 = { ...profiles.createDefault(1), league: 'Mirage' }
    const poe2 = { ...profiles.createDefault(2), league: 'Fate of the Vaal' }
    profiles.saveProfile(poe1)
    profiles.saveProfile(poe2)

    const store = makeStore({
      [ACTIVE_PROFILE_ID_KEY]: poe1.id,
      [LAST_PROFILE_ID_POE2_KEY]: poe2.id,
      [PROFILE_VERSION_KEY]: 1,
    })

    deleteProfileAndChooseFallback(store, poe2.id)

    expect(profiles.listProfiles().find((profile) => profile.gameVariant === 2)).toBeUndefined()
    expect(store.get(ACTIVE_PROFILE_ID_KEY)).toBe(poe1.id)
    expect(store.get(LAST_PROFILE_ID_POE2_KEY)).toBe('')
    expect(store.get(PROFILE_VERSION_KEY)).toBe(1)
  })

  it('normalizes legacy profile files that are missing metadata', () => {
    const root = mkdtempSync(join(tmpdir(), 'scalpel-profiles-'))
    mkdirSync(join(root, 'profiles'))
    writeFileSync(
      join(root, 'profiles', 'legacy.json'),
      JSON.stringify({ id: 'legacy', name: 'Legacy', gameVariant: 2, league: 'Standard' }),
      'utf-8',
    )
    const profiles = initProfileStore(root)

    const legacy = profiles.getProfile('legacy')

    expect(legacy?.schemaVersion).toBe(1)
    expect(legacy?.createdAt).toEqual(expect.any(String))
    expect(legacy?.tradePriceOption).toBe('exalted_divine')
  })

  it('switching to a game variant with no profile creates a default profile', () => {
    const profiles = setupProfiles()
    const poe1 = profiles.createDefault(1)
    profiles.saveProfile(poe1)

    const store = makeStore({
      [PROFILE_VERSION_KEY]: 1,
      [ACTIVE_PROFILE_ID_KEY]: poe1.id,
    })

    const changes = switchActiveProfileByGameVariant(store, 2)

    expect(store.get(ACTIVE_PROFILE_ID_KEY)).toBeTruthy()
    expect(store.get(PROFILE_VERSION_KEY)).toBe(2)
    const activationChange = changes.find((c) => c.key === 'activeProfile')
    expect(activationChange).toBeDefined()
    if (activationChange && activationChange.key === 'activeProfile') {
      expect(activationChange.reason).toBe('activation')
      expect(activationChange.value).not.toBeNull()
      expect((activationChange.value as { gameVariant: number }).gameVariant).toBe(2)
    }
  })

  it('returns default tradePriceOption when no profile is active', () => {
    const store = makeStore({ [ACTIVE_PROFILE_ID_KEY]: '' })

    expect(getProfileBackedSetting(store, 'tradePriceOption')).toBe('chaos_divine')
  })

  it('returns default cheatSheets when no profile is active', () => {
    const store = makeStore({ [ACTIVE_PROFILE_ID_KEY]: '' })

    expect(getProfileBackedSetting(store, 'cheatSheets')).toEqual({
      globalHotkey: '',
      categories: [],
      pinned: false,
    })
  })

  it('returns empty string for league when no profile is active', () => {
    const store = makeStore({ [ACTIVE_PROFILE_ID_KEY]: '' })

    expect(getProfileBackedSetting(store, 'league')).toBe('')
  })

  it('ensureProfileForGame creates a default profile when none exist', () => {
    const profiles = setupProfiles()
    const store = makeStore({
      [LAST_PROFILE_ID_POE1_KEY]: '',
      [ACTIVE_PROFILE_ID_KEY]: '',
    })

    const profile = ensureProfileForGame(store, 1)

    expect(profile.gameVariant).toBe(1)
    expect(profile.filterDir).toBe('')
    expect(profile.filterPath).toBe('')
    expect(store.get(LAST_PROFILE_ID_POE1_KEY)).toBe(profile.id)
    // verify it actually landed in the profile store
    expect(profiles.getProfile(profile.id)).not.toBeNull()
  })

  it('ensureProfileForGame returns existing profile without creating a duplicate', () => {
    const profiles = setupProfiles()
    const poe1 = profiles.createDefault(1)
    profiles.saveProfile(poe1)

    const store = makeStore({
      [LAST_PROFILE_ID_POE1_KEY]: poe1.id,
      [ACTIVE_PROFILE_ID_KEY]: poe1.id,
    })

    const profile = ensureProfileForGame(store, 1)

    expect(profile.id).toBe(poe1.id)
    expect(profiles.listProfiles().filter((p) => p.gameVariant === 1)).toHaveLength(1)
  })

  it('ensureProfileForGame sets the correct lastProfileId per variant', () => {
    const profiles = setupProfiles()
    const store = makeStore({
      [LAST_PROFILE_ID_POE1_KEY]: '',
      [LAST_PROFILE_ID_POE2_KEY]: '',
      [ACTIVE_PROFILE_ID_KEY]: '',
    })

    const poe1 = ensureProfileForGame(store, 1)
    const poe2 = ensureProfileForGame(store, 2)

    expect(store.get(LAST_PROFILE_ID_POE1_KEY)).toBe(poe1.id)
    expect(store.get(LAST_PROFILE_ID_POE2_KEY)).toBe(poe2.id)
    expect(profiles.listProfiles()).toHaveLength(2)
  })
})
