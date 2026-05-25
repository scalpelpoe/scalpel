import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import type Store from 'electron-store'
import type { AppSettings } from '../shared/types'
import { initProfileStore } from './profiles/store'
import {
  ACTIVE_PROFILE_ID_KEY,
  LAST_PROFILE_ID_POE1_KEY,
  LAST_PROFILE_ID_POE2_KEY,
  PROFILE_VERSION_KEY,
  deleteProfileAndChooseFallback,
  listProfileSummaries,
  switchActiveProfileByGameVariant,
  writeActiveRegexPresetsByGameVariant,
  writeActiveProfileSetting,
} from './profile-settings'

function makeStore(initial: Partial<AppSettings>): Store<AppSettings> {
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
  it('writes active profile-backed settings to flat settings, mirror settings, and profile file', () => {
    const profiles = setupProfiles()
    const poe1 = profiles.createDefault(1)
    profiles.saveProfile(poe1)

    const store = makeStore({
      [PROFILE_VERSION_KEY]: 1,
      [ACTIVE_PROFILE_ID_KEY]: poe1.id,
      league: 'Mirage',
      leaguePoe1: 'Mirage',
    })

    writeActiveProfileSetting(store, 'league', 'Return of the Settlers')

    expect(store.get('league')).toBe('Return of the Settlers')
    expect(store.get('leaguePoe1')).toBe('Return of the Settlers')
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
      league: 'Standard',
      leaguePoe1: 'Standard',
    })

    writeActiveProfileSetting(store, 'league', 'Return of the Settlers')

    expect(store.get('league')).toBe('Return of the Settlers')
    expect(store.get('leaguePoe1')).toBe('Return of the Settlers')
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

  it('switches game variant from the target profile instead of stale mirror settings', () => {
    const profiles = setupProfiles()
    const poe1 = profiles.createDefault(1)
    const poe2 = { ...profiles.createDefault(2), filterPath: 'C:\\filters\\poe2.filter', league: 'Fate of the Vaal' }
    profiles.saveProfile(poe1)
    profiles.saveProfile(poe2)

    const store = makeStore({
      [PROFILE_VERSION_KEY]: 1,
      [ACTIVE_PROFILE_ID_KEY]: poe1.id,
      [LAST_PROFILE_ID_POE2_KEY]: poe2.id,
      filterPath: 'C:\\filters\\poe1.filter',
      filterPathPoe2: 'C:\\stale\\mirror.filter',
      leaguePoe2: 'Stale League',
    })

    switchActiveProfileByGameVariant(store, 2)

    expect(store.get(ACTIVE_PROFILE_ID_KEY)).toBe(poe2.id)
    expect(store.get(PROFILE_VERSION_KEY)).toBe(2)
    expect(store.get('filterPath')).toBe('C:\\filters\\poe2.filter')
    expect(store.get('filterPathPoe2')).toBe('C:\\filters\\poe2.filter')
    expect(store.get('league')).toBe('Fate of the Vaal')
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
      filterPath: 'C:\\filters\\poe1.filter',
    })

    switchActiveProfileByGameVariant(store, 2)

    expect(store.get(ACTIVE_PROFILE_ID_KEY)).toBe(olderChoice.id)
    expect(store.get(LAST_PROFILE_ID_POE2_KEY)).toBe(olderChoice.id)
    expect(store.get('filterPath')).toBe('C:\\filters\\bossing.filter')
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
      league: ssf.league,
    })

    deleteProfileAndChooseFallback(store, ssf.id)

    expect(store.get(ACTIVE_PROFILE_ID_KEY)).toBe(trade.id)
    expect(store.get(LAST_PROFILE_ID_POE1_KEY)).toBe(trade.id)
    expect(store.get('league')).toBe('Mirage')
    expect(profiles.getProfile(ssf.id)).toBeNull()
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
})
