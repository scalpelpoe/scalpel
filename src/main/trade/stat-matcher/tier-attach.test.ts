import { describe, it, expect, beforeEach } from 'vitest'
import { _setTierDataForTests } from '../../tier-data'
import { attachTierLadder } from './producers/tier-attach'
import type { TierDataset } from '@shared/data/tiers/types'

const data: TierDataset = {
  schemaVersion: 1,
  mods: [
    { n: 'Hale', l: 1, g: 'IncreasedLife', s: [['base_maximum_life', 3, 9]], t: '' },
    { n: 'Healthy', l: 6, g: 'IncreasedLife', s: [['base_maximum_life', 10, 19]], t: '' },
    { n: 'Quick', l: 1, g: 'MovementVelocity', s: [['base_movement_velocity_+%', 25, 25]], t: '' },
    { n: 'Fast', l: 10, g: 'MovementVelocity', s: [['base_movement_velocity_+%', 30, 30]], t: '' },
  ],
  pools: [{ IncreasedLife: [0, 1], MovementVelocity: [2, 3] }],
  bases: { 'Iron Ring': 0 },
}

describe('attachTierLadder', () => {
  beforeEach(() => _setTierDataForTests(data))

  it('returns the ladder tiers for a scrubbable affix on a known base', () => {
    const tiers = attachTierLadder({
      baseType: 'Iron Ring',
      ranges: [{ value: 12, min: 10, max: 19 }],
      tier: 5,
      aggregated: false,
      rarity: 'Rare',
    })
    expect(tiers?.map((t) => t.range)).toEqual([
      { min: 3, max: 9 },
      { min: 10, max: 19 },
    ])
  })

  it('returns undefined on Unique rarity', () => {
    const tiers = attachTierLadder({
      baseType: 'Iron Ring',
      ranges: [{ value: 12, min: 10, max: 19 }],
      tier: 5,
      aggregated: false,
      rarity: 'Unique',
    })
    expect(tiers).toBeUndefined()
  })

  it('returns undefined when no tier data is loaded', () => {
    _setTierDataForTests(null)
    const tiers = attachTierLadder({
      baseType: 'Iron Ring',
      ranges: [{ value: 12, min: 10, max: 19 }],
      tier: 5,
      aggregated: false,
      rarity: 'Rare',
    })
    expect(tiers).toBeUndefined()
  })

  it('matches on the raw advanced-mod bracket (quality is transparent to matching)', () => {
    // The in-game clipboard reports the UNMODIFIED roll range even for a
    // quality-increased mod (the displayed value is scaled separately). So the
    // bracket equals RePoE's stored range and matches directly; the quality
    // multiplier never enters tier matching - it only scales the renderer's
    // search input via StatFilter.tierQualityMult.
    const tiers = attachTierLadder({
      baseType: 'Iron Ring',
      ranges: [{ value: 15, min: 10, max: 19 }],
      tier: 5,
      aggregated: false,
      rarity: 'Rare',
    })
    expect(tiers?.map((t) => t.range)).toEqual([
      { min: 3, max: 9 },
      { min: 10, max: 19 },
    ])
  })

  it('resolves a fixed-value (rangeless) mod by its literal value', () => {
    // "30% increased Movement Speed" prints no bracket, so ranges is empty; match
    // on value against the fixed-point tier (min === max === 30).
    const tiers = attachTierLadder({
      baseType: 'Iron Ring',
      ranges: [],
      value: 30,
      tier: 1,
      aggregated: false,
      rarity: 'Rare',
    })
    expect(tiers?.map((t) => t.range)).toEqual([
      { min: 25, max: 25 },
      { min: 30, max: 30 },
    ])
  })
})
