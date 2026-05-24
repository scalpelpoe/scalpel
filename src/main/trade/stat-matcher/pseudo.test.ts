import { describe, it, expect, beforeEach } from 'vitest'
import { _setStatEntries } from './stats-cache'
import { PSEUDO_WEIGHT_GROUPS, _resetPseudoMap, ensurePseudoMapBuilt } from './pseudo'

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

  it('is cleared by _resetPseudoMap', () => {
    _setStatEntries([{ id: 'explicit.stat_fire', text: '+#% to Fire Resistance', type: 'explicit' }])
    ensurePseudoMapBuilt()
    expect(Object.keys(PSEUDO_WEIGHT_GROUPS).length).toBeGreaterThan(0)

    _resetPseudoMap()
    expect(Object.keys(PSEUDO_WEIGHT_GROUPS).length).toBe(0)
  })
})
