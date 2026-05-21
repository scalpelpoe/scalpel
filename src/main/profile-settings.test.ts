import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import type Store from 'electron-store'
import type { AppSettings } from '../shared/types'
import { initProfileStore } from './profiles/store'
import { switchActiveProfileByGameVariant, writeActiveProfileSetting } from './profile-settings'

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

    const store = makeStore({ poeVersion: 1, activeProfileId: poe1.id, league: 'Mirage', leaguePoe1: 'Mirage' })

    writeActiveProfileSetting(store, 'league', 'Return of the Settlers')

    expect(store.get('league')).toBe('Return of the Settlers')
    expect(store.get('leaguePoe1')).toBe('Return of the Settlers')
    expect(profiles.getProfile(poe1.id)?.league).toBe('Return of the Settlers')
  })

  it('switches game variant from the target profile instead of stale mirror settings', () => {
    const profiles = setupProfiles()
    const poe1 = profiles.createDefault(1)
    const poe2 = { ...profiles.createDefault(2), filterPath: 'C:\\filters\\poe2.filter', league: 'Fate of the Vaal' }
    profiles.saveProfile(poe1)
    profiles.saveProfile(poe2)

    const store = makeStore({
      poeVersion: 1,
      activeProfileId: poe1.id,
      filterPath: 'C:\\filters\\poe1.filter',
      filterPathPoe2: 'C:\\stale\\mirror.filter',
      leaguePoe2: 'Stale League',
    })

    switchActiveProfileByGameVariant(store, 2)

    expect(store.get('activeProfileId')).toBe(poe2.id)
    expect(store.get('poeVersion')).toBe(2)
    expect(store.get('filterPath')).toBe('C:\\filters\\poe2.filter')
    expect(store.get('filterPathPoe2')).toBe('C:\\filters\\poe2.filter')
    expect(store.get('league')).toBe('Fate of the Vaal')
  })
})
