import { describe, it, expect, beforeEach } from 'vitest'
import { _setStatEntries } from './stats-cache'
import { PSEUDO_WEIGHT_GROUPS, _resetPseudoMap, ensurePseudoMapBuilt } from './pseudo'
import { getPoeVersion, setPoeVersion } from '../../game-state'

describe('PSEUDO_WEIGHT_GROUPS', () => {
  beforeEach(() => {
    _setStatEntries([])
    _resetPseudoMap()
  })

  it('inverts contributions into per-pseudo {id, weight} lists', () => {
    _setStatEntries([
      { id: 'explicit.stat_fire', text: '+#% to Fire Resistance', type: 'explicit' },
      { id: 'explicit.stat_life', text: '+# to maximum Life', type: 'explicit' },
      { id: 'explicit.stat_str', text: '+# to Strength', type: 'explicit' },
    ])
    ensurePseudoMapBuilt()

    // Fire resistance feeds Total Elemental Resistance.
    expect(PSEUDO_WEIGHT_GROUPS['pseudo.pseudo_total_elemental_resistance']).toContainEqual({
      id: 'explicit.stat_fire',
    })
    // Both maximum life and Strength feed Total Life.
    expect(PSEUDO_WEIGHT_GROUPS['pseudo.pseudo_total_life']).toContainEqual({ id: 'explicit.stat_life' })
    expect(PSEUDO_WEIGHT_GROUPS['pseudo.pseudo_total_life']).toContainEqual({ id: 'explicit.stat_str' })
  })

  it('ingests rune.* entries so socketed runes feed pseudos', () => {
    // GGG tags rune entries with type "augment" (not "rune"); detection is by id prefix.
    _setStatEntries([{ id: 'rune.stat_2901986750', text: '#% to all Elemental Resistances', type: 'augment' }])
    ensurePseudoMapBuilt()

    expect(PSEUDO_WEIGHT_GROUPS['pseudo.pseudo_total_elemental_resistance']).toContainEqual({
      id: 'rune.stat_2901986750',
    })
  })

  it('is cleared by _resetPseudoMap', () => {
    _setStatEntries([{ id: 'explicit.stat_fire', text: '+#% to Fire Resistance', type: 'explicit' }])
    ensurePseudoMapBuilt()
    expect(Object.keys(PSEUDO_WEIGHT_GROUPS).length).toBeGreaterThan(0)

    _resetPseudoMap()
    expect(Object.keys(PSEUDO_WEIGHT_GROUPS).length).toBe(0)
  })
})

describe('PoE2 Damage-as-Extra summary pseudos', () => {
  const ELE_ID = 'pseudo.pseudo_damage_as_extra_elemental'
  const ELE_CHAOS_ID = 'pseudo.pseudo_damage_as_extra_elemental_chaos'
  const ENTRIES = [
    { id: 'explicit.stat_extra_fire', text: 'Gain #% of Damage as Extra Fire Damage', type: 'explicit' },
    { id: 'explicit.stat_extra_cold', text: 'Gain #% of Damage as Extra Cold Damage', type: 'explicit' },
    { id: 'explicit.stat_extra_light', text: 'Gain #% of Damage as Extra Lightning Damage', type: 'explicit' },
    { id: 'explicit.stat_extra_chaos', text: 'Gain #% of Damage as Extra Chaos Damage', type: 'explicit' },
  ]

  it('maps the 3 elements to both pseudos and chaos to ele+chaos only (PoE2)', () => {
    const prev = getPoeVersion()
    setPoeVersion(2)
    try {
      _setStatEntries(ENTRIES)
      _resetPseudoMap()
      ensurePseudoMapBuilt()

      for (const eleId of ['explicit.stat_extra_fire', 'explicit.stat_extra_cold', 'explicit.stat_extra_light']) {
        expect(PSEUDO_WEIGHT_GROUPS[ELE_ID]).toContainEqual({ id: eleId })
        expect(PSEUDO_WEIGHT_GROUPS[ELE_CHAOS_ID]).toContainEqual({ id: eleId })
      }
      // Chaos feeds only ele+chaos, never the ele-only pseudo.
      expect(PSEUDO_WEIGHT_GROUPS[ELE_CHAOS_ID]).toContainEqual({ id: 'explicit.stat_extra_chaos' })
      expect(PSEUDO_WEIGHT_GROUPS[ELE_ID] ?? []).not.toContainEqual({ id: 'explicit.stat_extra_chaos' })
    } finally {
      setPoeVersion(prev)
    }
  })

  it('does not register the pseudos on PoE1', () => {
    const prev = getPoeVersion()
    setPoeVersion(1)
    try {
      _setStatEntries(ENTRIES)
      _resetPseudoMap()
      ensurePseudoMapBuilt()
      expect(PSEUDO_WEIGHT_GROUPS[ELE_ID]).toBeUndefined()
      expect(PSEUDO_WEIGHT_GROUPS[ELE_CHAOS_ID]).toBeUndefined()
    } finally {
      setPoeVersion(prev)
    }
  })

  it('excludes near-miss variants (Attacks Gain / Monsters deal / per Undead Minion)', () => {
    const prev = getPoeVersion()
    setPoeVersion(2)
    try {
      _setStatEntries([
        { id: 'explicit.stat_attacks_fire', text: 'Attacks Gain #% of Damage as Extra Fire Damage', type: 'explicit' },
        { id: 'explicit.stat_monster_fire', text: 'Monsters deal #% of Damage as Extra Fire', type: 'explicit' },
        {
          id: 'explicit.stat_chaos_per_minion',
          text: 'Gain #% of Damage as Chaos Damage per Undead Minion',
          type: 'explicit',
        },
      ])
      _resetPseudoMap()
      ensurePseudoMapBuilt()
      expect(PSEUDO_WEIGHT_GROUPS[ELE_ID]).toBeUndefined()
      expect(PSEUDO_WEIGHT_GROUPS[ELE_CHAOS_ID]).toBeUndefined()
    } finally {
      setPoeVersion(prev)
    }
  })
})
