import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type Store from 'electron-store'
import { describe, expect, it } from 'vitest'
import type { AppSettings } from '../../shared/types'
import { ACTIVE_PROFILE_ID_KEY, LAST_PROFILE_ID_POE1_KEY, PROFILE_VERSION_KEY } from '../profiles/profile-settings'
import { initProfileStore } from '../profiles/store'
import { migrateLeague, refreshLeagues } from './leagues'

describe('migrateLeague', () => {
  it('returns null when current league is still valid', () => {
    expect(migrateLeague('Mirage', ['Mirage', 'Hardcore Mirage', 'Standard', 'Hardcore'])).toBeNull()
    expect(migrateLeague('Standard', ['Mirage', 'Hardcore Mirage', 'Standard', 'Hardcore'])).toBeNull()
  })

  it('migrates SC challenge to new SC challenge when old one rotates out', () => {
    const fresh = ['Phrecia', 'Hardcore Phrecia', 'Standard', 'Hardcore']
    expect(migrateLeague('Mirage', fresh)).toBe('Phrecia')
  })

  it('migrates HC challenge to new HC challenge', () => {
    const fresh = ['Phrecia', 'Hardcore Phrecia', 'Standard', 'Hardcore']
    expect(migrateLeague('Hardcore Mirage', fresh)).toBe('Hardcore Phrecia')
  })

  it('handles HC: prefix style names', () => {
    const fresh = ['Phrecia', 'HC Phrecia', 'Standard', 'Hardcore']
    expect(migrateLeague('HC Mirage', fresh)).toBe('HC Phrecia')
  })

  it('preserves SC vs HC choice for PoE2 league rotation', () => {
    const fresh = ['Rise of the Abyssal', 'HC Rise of the Abyssal', 'Standard', 'Hardcore']
    expect(migrateLeague('Fate of the Vaal', fresh)).toBe('Rise of the Abyssal')
    expect(migrateLeague('HC Fate of the Vaal', fresh)).toBe('HC Rise of the Abyssal')
  })

  it('migrates Mirage -> Return of the Settlers (multi-word challenge name)', () => {
    const fresh = [
      'Return of the Settlers',
      'Hardcore Return of the Settlers',
      'Ruthless Return of the Settlers',
      'HC Ruthless Return of the Settlers',
      'Standard',
      'Hardcore',
      'Ruthless',
      'Hardcore Ruthless',
    ]
    expect(migrateLeague('Mirage', fresh)).toBe('Return of the Settlers')
    expect(migrateLeague('Hardcore Mirage', fresh)).toBe('Hardcore Return of the Settlers')
  })

  it('falls back to Standard when no SC challenge exists in fresh list', () => {
    const fresh = ['Standard', 'Hardcore']
    expect(migrateLeague('Mirage', fresh)).toBe('Standard')
  })

  it('falls back to Hardcore (Standard) when no HC challenge exists', () => {
    const fresh = ['Standard', 'Hardcore']
    expect(migrateLeague('Hardcore Mirage', fresh)).toBe('Hardcore')
  })

  it('returns the current value when fresh list is empty', () => {
    expect(migrateLeague('Mirage', [])).toBe('Mirage')
  })

  it('returns null for empty current league', () => {
    expect(migrateLeague('', ['Phrecia', 'Standard'])).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// refreshLeagues integration
// ---------------------------------------------------------------------------

function makeFakeStore(initial: Record<string, unknown>): Store<AppSettings> {
  const data: Record<string, unknown> = { ...initial }
  return {
    get: (key: string) => data[key],
    set: (key: string, value: unknown) => {
      data[key] = value
    },
    _data: data,
  } as unknown as Store<AppSettings> & { _data: Record<string, unknown> }
}

describe('refreshLeagues', () => {
  it('persists fetched lists and migrates active profile league when poe1 is active', async () => {
    const profiles = initProfileStore(mkdtempSync(join(tmpdir(), 'scalpel-league-profiles-')))
    const poe1 = { ...profiles.createDefault(1), league: 'Mirage' }
    profiles.saveProfile(poe1)
    const store = makeFakeStore({
      [ACTIVE_PROFILE_ID_KEY]: poe1.id,
      [LAST_PROFILE_ID_POE1_KEY]: poe1.id,
      poeVersion: 1,
      leaguesPoe1: [],
      leaguesPoe2: [],
    })
    const fresh1 = [
      'Return of the Settlers',
      'Hardcore Return of the Settlers',
      'Ruthless Return of the Settlers',
      'HC Ruthless Return of the Settlers',
      'Standard',
      'Hardcore',
    ]
    const fresh2 = ['Fate of the Vaal', 'HC Fate of the Vaal', 'Standard', 'Hardcore']
    const fetcher = async (v: 1 | 2): Promise<string[] | null> => (v === 1 ? fresh1 : fresh2)

    const changed = await refreshLeagues(store, fetcher)

    expect(store.get('leaguesPoe1')).toEqual(fresh1)
    expect(store.get('leaguesPoe2')).toEqual(fresh2)
    expect(profiles.getProfile(poe1.id)?.league).toBe('Return of the Settlers')
    expect(changed).toContain('leaguesPoe1')
    expect(changed).toContain('activeProfile')
  })

  it('migrates Hardcore Mirage -> Hardcore Return of the Settlers', async () => {
    const profiles = initProfileStore(mkdtempSync(join(tmpdir(), 'scalpel-league-profiles-')))
    const poe1 = { ...profiles.createDefault(1), league: 'Hardcore Mirage' }
    profiles.saveProfile(poe1)
    const store = makeFakeStore({
      [ACTIVE_PROFILE_ID_KEY]: poe1.id,
      [LAST_PROFILE_ID_POE1_KEY]: poe1.id,
      poeVersion: 1,
      leaguesPoe1: [],
      leaguesPoe2: [],
    })
    const fresh1 = ['Return of the Settlers', 'Hardcore Return of the Settlers', 'Standard', 'Hardcore']
    const fetcher = async (v: 1 | 2): Promise<string[] | null> =>
      v === 1 ? fresh1 : ['Fate of the Vaal', 'HC Fate of the Vaal', 'Standard', 'Hardcore']

    await refreshLeagues(store, fetcher)

    expect(profiles.getProfile(poe1.id)?.league).toBe('Hardcore Return of the Settlers')
  })

  it('does not return activeProfile when the inactive version migrates', async () => {
    const profiles = initProfileStore(mkdtempSync(join(tmpdir(), 'scalpel-league-profiles-')))
    const poe1 = { ...profiles.createDefault(1), league: 'Mirage' }
    const poe2 = { ...profiles.createDefault(2), league: 'Fate of the Vaal' }
    profiles.saveProfile(poe1)
    profiles.saveProfile(poe2)
    const store = makeFakeStore({
      [ACTIVE_PROFILE_ID_KEY]: poe2.id,
      [LAST_PROFILE_ID_POE1_KEY]: poe1.id,
      poeVersion: 2,
      leaguesPoe1: [],
      leaguesPoe2: [],
    })
    const fetcher = async (v: 1 | 2): Promise<string[] | null> =>
      v === 1
        ? ['Return of the Settlers', 'Hardcore Return of the Settlers', 'Standard', 'Hardcore']
        : ['Fate of the Vaal', 'HC Fate of the Vaal', 'Standard', 'Hardcore']

    const changed = await refreshLeagues(store, fetcher)

    expect(profiles.getProfile(poe1.id)?.league).toBe('Return of the Settlers')
    expect(profiles.getProfile(poe2.id)?.league).toBe('Fate of the Vaal')
    expect(changed).not.toContain('activeProfile')
  })

  it('makes no migrations when the user is on Standard (persists across leagues)', async () => {
    const profiles = initProfileStore(mkdtempSync(join(tmpdir(), 'scalpel-league-profiles-')))
    const poe1 = { ...profiles.createDefault(1), league: 'Standard' }
    profiles.saveProfile(poe1)
    const store = makeFakeStore({
      [ACTIVE_PROFILE_ID_KEY]: poe1.id,
      poeVersion: 1,
      leaguesPoe1: [],
      leaguesPoe2: [],
    })
    const fresh1 = ['Return of the Settlers', 'Hardcore Return of the Settlers', 'Standard', 'Hardcore']
    const fetcher = async (): Promise<string[] | null> => fresh1

    const changed = await refreshLeagues(store, fetcher)

    expect(profiles.getProfile(poe1.id)?.league).toBe('Standard')
    expect(changed).not.toContain('activeProfile')
  })

  it('uses the hardcoded fallback list when the API returns null', async () => {
    const store = makeFakeStore({
      poeVersion: 1,
      leaguesPoe1: [],
      leaguesPoe2: [],
    })
    const fetcher = async (): Promise<string[] | null> => null

    await refreshLeagues(store, fetcher)

    const list = store.get('leaguesPoe1') as string[]
    expect(list.length).toBeGreaterThan(0)
  })

  it('does not re-persist the list or rewrite the league when nothing changed', async () => {
    const profiles = initProfileStore(mkdtempSync(join(tmpdir(), 'scalpel-league-profiles-')))
    const poe1 = { ...profiles.createDefault(1), league: 'Mirage' }
    profiles.saveProfile(poe1)
    const fresh1 = ['Mirage', 'Hardcore Mirage', 'Standard', 'Hardcore']
    const store = makeFakeStore({
      [ACTIVE_PROFILE_ID_KEY]: poe1.id,
      poeVersion: 1,
      leaguesPoe1: fresh1,
      leaguesPoe2: ['Fate of the Vaal', 'HC Fate of the Vaal', 'Standard', 'Hardcore'],
    })
    const fetcher = async (v: 1 | 2): Promise<string[] | null> =>
      v === 1 ? fresh1 : ['Fate of the Vaal', 'HC Fate of the Vaal', 'Standard', 'Hardcore']

    const changed = await refreshLeagues(store, fetcher)

    expect(changed).toEqual([])
  })

  it('migrates every stale profile for a game without rewriting the active profile for another game', async () => {
    const profiles = initProfileStore(mkdtempSync(join(tmpdir(), 'scalpel-league-profiles-')))
    const poe1Trade = {
      ...profiles.createDefault(1),
      name: 'Trade',
      league: 'Mirage',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }
    const poe1Hc = {
      ...profiles.createDefault(1),
      name: 'HC',
      league: 'Hardcore Mirage',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    const poe2Active = { ...profiles.createDefault(2), name: 'PoE2 active', league: 'Fate of the Vaal' }
    profiles.saveProfile(poe1Trade)
    profiles.saveProfile(poe1Hc)
    profiles.saveProfile(poe2Active)

    const store = makeFakeStore({
      [PROFILE_VERSION_KEY]: 2,
      [ACTIVE_PROFILE_ID_KEY]: poe2Active.id,
      [LAST_PROFILE_ID_POE1_KEY]: poe1Hc.id,
      leaguesPoe1: [],
      leaguesPoe2: [],
    })
    const fresh1 = ['Return of the Settlers', 'Hardcore Return of the Settlers', 'Standard', 'Hardcore']
    const fresh2 = ['Fate of the Vaal', 'HC Fate of the Vaal', 'Standard', 'Hardcore']
    const fetcher = async (v: 1 | 2): Promise<string[] | null> => (v === 1 ? fresh1 : fresh2)

    const changed = await refreshLeagues(store, fetcher)

    expect(profiles.getProfile(poe1Trade.id)?.league).toBe('Return of the Settlers')
    expect(profiles.getProfile(poe1Hc.id)?.league).toBe('Hardcore Return of the Settlers')
    expect(profiles.getProfile(poe2Active.id)?.league).toBe('Fate of the Vaal')
    expect(changed).not.toContain('activeProfile')
  })
})
