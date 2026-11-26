import { afterEach, describe, expect, it } from 'vitest'
import {
  getAllGameTitles,
  getGameIdentityHints,
  getGameTitleForVariant,
  getGameTitlesForVariant,
  matchGameWindow,
  resetGameTitleOverridesForTests,
  setGameTitleOverrides,
} from './game-window-identity'

const both = ['Path of Exile', 'Path of Exile 2']

afterEach(() => resetGameTitleOverridesForTests())

describe('matchGameWindow', () => {
  it('lets the title decide the variant for the shared pathofexilesteam.exe identity', () => {
    expect(matchGameWindow({ title: 'Path of Exile', appId: 'pathofexilesteam.exe' }, ['Path of Exile'])).toMatchObject(
      {
        accepted: true,
        variant: 1,
        score: 5,
      },
    )
    expect(matchGameWindow({ title: 'Path of Exile 2', appId: 'pathofexilesteam.exe' }, both)).toMatchObject({
      accepted: true,
      variant: 2,
      score: 5,
    })
  })

  it('rejects the shared executable without a game title or with the wrong profile', () => {
    expect(matchGameWindow({ appId: 'pathofexilesteam.exe' }, both)).toMatchObject({
      accepted: false,
      reason: 'no-game-signal',
    })
    expect(
      matchGameWindow({ title: 'Path of Exile 2', appId: 'pathofexilesteam.exe' }, ['Path of Exile']),
    ).toMatchObject({
      accepted: false,
      reason: 'variant-mismatch',
    })
    expect(
      matchGameWindow({ title: 'Path of Exile', appId: 'pathofexilesteam.exe' }, ['Path of Exile 2']),
    ).toMatchObject({
      accepted: false,
      reason: 'variant-mismatch',
    })
  })

  it('rejects a Steam client window that borrowed the game title', () => {
    const match = matchGameWindow({ title: 'Path of Exile', appId: 'steam.exe', className: 'Steam' }, both)
    expect(match).toMatchObject({ accepted: false, reason: 'launcher-window' })
  })

  it('rejects a launcher web helper that borrowed the game title', () => {
    const match = matchGameWindow({ title: 'Path of Exile 2', appId: 'steamwebhelper' }, both)
    expect(match).toMatchObject({ accepted: false, reason: 'launcher-window' })
  })

  it('accepts native Steam game windows whose title identifies the PoE variant', () => {
    expect(matchGameWindow({ title: 'Path of Exile 2', appId: 'steam_app_2694490' }, both)).toMatchObject({
      accepted: true,
      variant: 2,
      score: 5,
    })
    expect(matchGameWindow({ title: 'Path of Exile', appId: 'steam_app_238960' }, ['Path of Exile'])).toMatchObject({
      accepted: true,
      variant: 1,
      score: 5,
    })
  })

  it('does not treat an untitled or unrelated Steam game as PoE', () => {
    expect(matchGameWindow({ appId: 'steam_app_2694490' }, both)).toMatchObject({
      accepted: false,
      reason: 'no-game-signal',
    })
    expect(matchGameWindow({ title: 'Counter-Strike 2', appId: 'steam_app_2694490' }, both).accepted).toBe(false)
  })

  it('uses an explicit PoE2 title over a generic PoE app id', () => {
    expect(matchGameWindow({ title: 'Path of Exile 2 - Standard', appId: 'com.poe.game' }, both)).toMatchObject({
      accepted: true,
      variant: 2,
    })
  })

  it('lets a strong executable win over a loose title', () => {
    expect(matchGameWindow({ title: 'Path of Exile', appId: 'pathofexile2.exe' }, both)).toMatchObject({
      accepted: true,
      variant: 2,
    })
  })

  it('rejects the other variant for a specific game profile', () => {
    const match = matchGameWindow({ title: 'Path of Exile 2', appId: 'com.poe.game' }, ['Path of Exile'])
    expect(match).toMatchObject({ accepted: false, reason: 'variant-mismatch' })
  })

  it('accepts a launcher-launched game by title when the app id is generic', () => {
    expect(
      matchGameWindow({ title: 'Path of Exile 2 (GOG)', appId: 'wine', className: 'Wine' }, ['Path of Exile 2']),
    ).toMatchObject({ accepted: true, variant: 2 })
  })

  it('treats generic PoE app ids as game identities without a variant', () => {
    expect(matchGameWindow({ appId: 'com.poe.game' }, both)).toMatchObject({ accepted: true, variant: null, score: 1 })
  })

  it('lets the title decide the variant for the shared pathofexile-exe identity', () => {
    expect(matchGameWindow({ title: 'Path of Exile', appId: 'pathofexile-exe' }, ['Path of Exile'])).toMatchObject({
      accepted: true,
      variant: 1,
      score: 4,
    })
    expect(matchGameWindow({ title: 'Path of Exile 2', appId: 'pathofexile-exe' }, ['Path of Exile 2'])).toMatchObject({
      accepted: true,
      variant: 2,
      score: 4,
    })
  })

  it('rejects the wrong variant when the shared identity is paired with a decisive title', () => {
    expect(matchGameWindow({ title: 'Path of Exile 2', appId: 'pathofexile-exe' }, ['Path of Exile'])).toMatchObject({
      accepted: false,
      reason: 'variant-mismatch',
    })
  })

  it('accepts an exact custom profile title without a PoE-shaped name', () => {
    expect(matchGameWindow({ title: 'My Custom Game' }, ['My Custom Game'])).toMatchObject({
      accepted: true,
      variant: null,
      reason: 'expected-title',
    })
  })

  it('rejects a borrowed game title owned by an unrelated app id', () => {
    const match = matchGameWindow({ title: 'Path of Exile', appId: 'com.example.Other' }, both)
    expect(match).toMatchObject({ accepted: false, reason: 'unrelated-app-id' })
  })

  it('rejects trade, wiki and other utility windows', () => {
    expect(matchGameWindow({ title: 'Path of Exile Trade', appId: 'steamwebhelper' }, both)).toMatchObject({
      accepted: false,
      reason: 'utility-title',
    })
    expect(matchGameWindow({ title: 'PoE Wiki', appId: 'firefox' }, both)).toMatchObject({
      accepted: false,
      reason: 'utility-title',
    })
  })

  it('rejects unrelated windows', () => {
    expect(matchGameWindow({ title: 'Terminal', appId: 'com.example.Other' }, both).accepted).toBe(false)
    expect(matchGameWindow({}, both).accepted).toBe(false)
  })

  it('keeps no-game-signal windows out even with a loose title', () => {
    const match = matchGameWindow({ title: 'My PoE notes', appId: 'com.example.Notes' }, both)
    expect(match).toMatchObject({ accepted: false, reason: 'no-game-signal' })
  })
})

describe('game title overrides', () => {
  it('appends aliases after the canonical title slots', () => {
    setGameTitleOverrides({ poe1: '  My PoE  ', poe2: 'PoE Two' })
    expect(getGameTitleForVariant(1)).toBe('My PoE')
    expect(getGameTitlesForVariant(1)).toEqual(['Path of Exile', 'My PoE'])
    expect(getAllGameTitles()).toEqual(['Path of Exile', 'Path of Exile 2', 'My PoE', 'PoE Two'])
  })

  it('matches an exact custom title from the configured aliases', () => {
    setGameTitleOverrides({ poe1: 'My PoE' })
    expect(matchGameWindow({ title: 'My PoE' }, getAllGameTitles())).toMatchObject({
      accepted: true,
      variant: null,
      reason: 'expected-title',
    })
  })

  it('accepts the game under a plain custom title even when it exposes an app id', () => {
    setGameTitleOverrides({ poe1: 'My PoE' })
    expect(matchGameWindow({ title: 'My PoE', appId: 'pathofexilesteam.exe' }, getAllGameTitles())).toMatchObject({
      accepted: true,
      reason: 'game',
    })
  })

  it('parses Title|appId into identity hints without changing attach titles', () => {
    setGameTitleOverrides({ poe2: 'Path of Exile 2|pathofexilesteam.exe,steam_app_2694490' })
    expect(getGameTitleForVariant(2)).toBe('Path of Exile 2')
    expect(getGameTitlesForVariant(2)).toEqual(['Path of Exile 2'])
    expect(getGameIdentityHints()[2]).toEqual({
      appIds: ['pathofexilesteam.exe', 'steam_app_2694490'],
      classNames: [],
      instances: [],
    })
  })

  it('rejects a borrowed title when a configured app id does not match', () => {
    setGameTitleOverrides({ poe2: 'Path of Exile 2|pathofexilesteam.exe' })
    const titles = getAllGameTitles()
    expect(matchGameWindow({ title: 'Path of Exile 2', appId: 'pathofexilesteam.exe' }, titles).accepted).toBe(true)
    expect(matchGameWindow({ title: 'Path of Exile 2', appId: 'com.example.Other' }, titles)).toMatchObject({
      accepted: false,
      reason: 'identity-hint-mismatch',
    })
  })

  it('accepts comma-separated identity alternatives', () => {
    setGameTitleOverrides({ poe1: 'Path of Exile|pathofexilesteam.exe,steam_app_238960' })
    const titles = getAllGameTitles()
    expect(matchGameWindow({ title: 'Path of Exile', appId: 'steam_app_238960' }, titles).accepted).toBe(true)
  })

  it('keeps title-only sources working when no identity fields are exposed', () => {
    setGameTitleOverrides({ poe1: 'My PoE|pathofexilesteam.exe' })
    expect(matchGameWindow({ title: 'My PoE' }, getAllGameTitles())).toMatchObject({
      accepted: true,
      reason: 'expected-title',
    })
  })
})
