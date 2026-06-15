import { afterEach, describe, expect, it } from 'vitest'
import { _setPremiumModsForTests } from '@main/premium-mods'
import { setPoeVersion } from '@main/game-state'
import type { PremiumModsData } from '@shared/data/items/premium-mods-types'
import { resolveUniqueOverride } from './overrides'

// Minimal ItemInfo helper -- provides all required fields with cheap defaults.
function makeItem(overrides: { name?: string; itemClass?: string; rarity?: string } = {}) {
  return {
    sockets: '',
    linkedSockets: 0,
    quality: 0,
    itemLevel: 0,
    baseType: '',
    rarity: overrides.rarity ?? 'Unique',
    itemClass: overrides.itemClass ?? 'Rings',
    name: overrides.name,
    gemLevel: 0,
    corrupted: false,
    mirrored: false,
  }
}

afterEach(() => {
  _setPremiumModsForTests(null)
  setPoeVersion(1)
})

// --- Case 1: exact-name entry ---

describe('resolveUniqueOverride - exact name entry', () => {
  it('returns mode and mods map keyed by id', () => {
    const data: PremiumModsData = {
      schemaVersion: 2,
      poe1: {
        "Ventor's Gamble": {
          mode: 'stat_list',
          mods: [
            { id: 'explicit.stat_1000', text: 'Quantity' },
            { id: 'explicit.stat_1001', text: 'Rarity' },
          ],
          confidence: 'verified',
        },
      },
      poe2: {},
    }
    _setPremiumModsForTests(data)
    setPoeVersion(1)
    const result = resolveUniqueOverride(makeItem({ name: "Ventor's Gamble", itemClass: 'Rings' }))
    expect(result).not.toBeNull()
    expect(result!.mode).toBe('stat_list')
    expect(result!.mods.size).toBe(2)
    expect(result!.mods.has('explicit.stat_1000')).toBe(true)
    expect(result!.mods.has('explicit.stat_1001')).toBe(true)
    expect(result!.mods.get('explicit.stat_1000')!.text).toBe('Quantity')
  })
})

// --- Case 2: familyMatch prefix matching ---

describe('resolveUniqueOverride - familyMatch', () => {
  it('matches an item name by prefix when familyMatch is true', () => {
    const data: PremiumModsData = {
      schemaVersion: 2,
      poe1: {
        'Time-Lost': {
          mode: 'all_explicits',
          familyMatch: true,
          confidence: 'speculative',
        },
      },
      poe2: {},
    }
    _setPremiumModsForTests(data)
    setPoeVersion(1)
    const result = resolveUniqueOverride(makeItem({ name: 'Time-Lost Emerald', itemClass: 'Jewels' }))
    expect(result).not.toBeNull()
    expect(result!.mode).toBe('all_explicits')
  })

  it('does NOT prefix-match when familyMatch is not set', () => {
    const data: PremiumModsData = {
      schemaVersion: 2,
      poe1: {
        'Time-Lost': {
          mode: 'all_explicits',
          // familyMatch intentionally omitted
          confidence: 'speculative',
        },
      },
      poe2: {},
    }
    _setPremiumModsForTests(data)
    setPoeVersion(1)
    const result = resolveUniqueOverride(makeItem({ name: 'Time-Lost Emerald', itemClass: 'Jewels' }))
    expect(result).toBeNull()
  })
})

// --- Case 3: exact match wins over familyMatch ---

describe('resolveUniqueOverride - exact over family', () => {
  it('uses the exact entry when both exact and familyMatch entries could apply', () => {
    const data: PremiumModsData = {
      schemaVersion: 2,
      poe1: {
        'Time-Lost': {
          mode: 'all_explicits',
          familyMatch: true,
          confidence: 'speculative',
        },
        'Time-Lost Emerald': {
          mode: 'stat_list',
          mods: [{ id: 'explicit.stat_9999', text: 'Exact mod' }],
          confidence: 'verified',
        },
      },
      poe2: {},
    }
    _setPremiumModsForTests(data)
    setPoeVersion(1)
    const result = resolveUniqueOverride(makeItem({ name: 'Time-Lost Emerald', itemClass: 'Jewels' }))
    expect(result).not.toBeNull()
    expect(result!.mode).toBe('stat_list')
    expect(result!.mods.has('explicit.stat_9999')).toBe(true)
  })
})

// --- Case 4: class rule, no per-unique entry ---

describe('resolveUniqueOverride - class rule only', () => {
  it('applies class rule for a Unique Tablet with no per-unique entry', () => {
    const data: PremiumModsData = {
      schemaVersion: 2,
      poe1: {},
      poe2: {},
      itemClassRules: [
        {
          game: 'poe1',
          itemClass: 'Tablet',
          rarity: 'Unique',
          mode: 'all_explicits',
          lowerIsBetter: ['explicit.stat_bad'],
          nonStatFilters: ['misc.corrupted'],
        },
      ],
    }
    _setPremiumModsForTests(data)
    setPoeVersion(1)
    const result = resolveUniqueOverride(makeItem({ name: 'Apocryphal Tablet', itemClass: 'Tablet' }))
    expect(result).not.toBeNull()
    expect(result!.mode).toBe('all_explicits')
    expect(result!.lowerIsBetter.has('explicit.stat_bad')).toBe(true)
    expect(result!.nonStatFilters.has('misc.corrupted')).toBe(true)
    expect(result!.mods.size).toBe(0)
  })
})

// --- Case 5: per-unique mode wins over class rule mode ---

describe('resolveUniqueOverride - entry mode beats class rule mode', () => {
  it('uses entry mode, but still merges class-rule lowerIsBetter/nonStatFilters', () => {
    const data: PremiumModsData = {
      schemaVersion: 2,
      poe1: {
        'Apocryphal Tablet': {
          mode: 'stat_list',
          mods: [{ id: 'explicit.stat_tab1', text: 'Tab mod' }],
          nonStatFilters: ['misc.quality'],
          confidence: 'verified',
        },
      },
      poe2: {},
      itemClassRules: [
        {
          game: 'poe1',
          itemClass: 'Tablet',
          rarity: 'Unique',
          mode: 'all_explicits',
          lowerIsBetter: ['explicit.stat_bad'],
          nonStatFilters: ['misc.corrupted'],
        },
      ],
    }
    _setPremiumModsForTests(data)
    setPoeVersion(1)
    const result = resolveUniqueOverride(makeItem({ name: 'Apocryphal Tablet', itemClass: 'Tablet' }))
    expect(result).not.toBeNull()
    // Entry mode wins
    expect(result!.mode).toBe('stat_list')
    // Class-rule lowerIsBetter still merges
    expect(result!.lowerIsBetter.has('explicit.stat_bad')).toBe(true)
    // nonStatFilters merged from both entry and class rule
    expect(result!.nonStatFilters.has('misc.quality')).toBe(true)
    expect(result!.nonStatFilters.has('misc.corrupted')).toBe(true)
  })
})

// --- Case 6: faction rule ---

describe('resolveUniqueOverride - faction rule', () => {
  it('returns mode null and defaultFilters for a unique with no entry but in a factionRule', () => {
    const data: PremiumModsData = {
      schemaVersion: 2,
      poe1: {},
      poe2: {},
      factionRules: [
        {
          game: 'poe1',
          tag: 'faction-good',
          uniques: ['Mageblood'],
          defaultFilters: { corrupted: false },
        },
      ],
    }
    _setPremiumModsForTests(data)
    setPoeVersion(1)
    const result = resolveUniqueOverride(makeItem({ name: 'Mageblood', itemClass: 'Belts' }))
    expect(result).not.toBeNull()
    expect(result!.mode).toBeNull()
    expect(result!.defaultFilters.corrupted).toBe(false)
  })

  it('faction defaultFilters override entry defaultFilters on conflict', () => {
    const data: PremiumModsData = {
      schemaVersion: 2,
      poe1: {
        Mageblood: {
          mode: 'stat_list',
          mods: [],
          defaultFilters: { corrupted: true },
          confidence: 'verified',
        },
      },
      poe2: {},
      factionRules: [
        {
          game: 'poe1',
          tag: 'faction-good',
          uniques: ['Mageblood'],
          defaultFilters: { corrupted: false },
        },
      ],
    }
    _setPremiumModsForTests(data)
    setPoeVersion(1)
    const result = resolveUniqueOverride(makeItem({ name: 'Mageblood', itemClass: 'Belts' }))
    expect(result).not.toBeNull()
    // Faction overrides entry: corrupted false wins over entry's true
    expect(result!.defaultFilters.corrupted).toBe(false)
  })
})

// --- Case 7: legacy string[] entry returns null ---

describe('resolveUniqueOverride - legacy array entry', () => {
  it('returns null for a legacy string[] entry (handled by premium path)', () => {
    const data: PremiumModsData = {
      schemaVersion: 2,
      poe1: {
        'Tabula Rasa': ['explicit.stat_1234'],
      },
      poe2: {},
    }
    _setPremiumModsForTests(data)
    setPoeVersion(1)
    const result = resolveUniqueOverride(makeItem({ name: 'Tabula Rasa', itemClass: 'Body Armours' }))
    expect(result).toBeNull()
  })
})

// --- Case 8: non-unique rarity and unknown name ---

describe('resolveUniqueOverride - null cases', () => {
  it('returns null for non-unique rarity', () => {
    const data: PremiumModsData = {
      schemaVersion: 2,
      poe1: { 'Some Ring': { mode: 'stat_list', mods: [], confidence: 'verified' } },
      poe2: {},
    }
    _setPremiumModsForTests(data)
    setPoeVersion(1)
    const result = resolveUniqueOverride(makeItem({ name: 'Some Ring', itemClass: 'Rings', rarity: 'Rare' }))
    expect(result).toBeNull()
  })

  it('returns null when no entry, class rule, or faction rule matches', () => {
    const data: PremiumModsData = { schemaVersion: 2, poe1: {}, poe2: {} }
    _setPremiumModsForTests(data)
    setPoeVersion(1)
    const result = resolveUniqueOverride(makeItem({ name: 'Unknown Amulet', itemClass: 'Amulets' }))
    expect(result).toBeNull()
  })

  it('returns null when itemInfo is undefined', () => {
    const data: PremiumModsData = { schemaVersion: 2, poe1: {}, poe2: {} }
    _setPremiumModsForTests(data)
    expect(resolveUniqueOverride(undefined)).toBeNull()
  })
})

// --- Case 9: game separation ---

describe('resolveUniqueOverride - game separation', () => {
  it('does not resolve a poe1 entry when game version is 2', () => {
    const data: PremiumModsData = {
      schemaVersion: 2,
      poe1: {
        'Oni-Goroshi': {
          mode: 'stat_list',
          mods: [{ id: 'explicit.stat_oni', text: 'Her Embrace' }],
          confidence: 'verified',
        },
      },
      poe2: {},
    }
    _setPremiumModsForTests(data)
    setPoeVersion(2)
    const result = resolveUniqueOverride(makeItem({ name: 'Oni-Goroshi', itemClass: 'Thrusting One Hand Swords' }))
    expect(result).toBeNull()
  })
})
