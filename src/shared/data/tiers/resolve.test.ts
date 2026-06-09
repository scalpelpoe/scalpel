import { describe, it, expect } from 'vitest'
import { resolveTierLadder, valueToTier, computeTierRange } from './resolve'
import type { TierDataset } from './types'

const data: TierDataset = {
  schemaVersion: 1,
  mods: [
    { n: 'Hale', l: 1, g: 'IncreasedLife', s: [['base_maximum_life', 3, 9]], t: '+(3-9) to maximum Life' }, // 0
    { n: 'Healthy', l: 6, g: 'IncreasedLife', s: [['base_maximum_life', 10, 19]], t: '' }, // 1
    { n: 'Stout', l: 33, g: 'IncreasedLife', s: [['base_maximum_life', 60, 69]], t: '' }, // 2
    {
      n: 'Honed',
      l: 33,
      g: 'PhysicalDamage',
      s: [
        ['min', 4, 6],
        ['max', 8, 11],
      ],
      t: '',
    }, // 3
    {
      n: 'of the Parched',
      l: 1,
      g: 'ManaLeech',
      s: [['om_physical_attack_damage_permyriad', 500, 590]],
      t: 'Leech (5-5.9)% of Physical Attack Damage as Mana',
    }, // 4
  ],
  pools: [{ IncreasedLife: [0, 1, 2], PhysicalDamage: [3], ManaLeech: [4] }],
  bases: { 'Iron Ring': 0 },
}

describe('computeTierRange', () => {
  it('single-stat returns that stat range', () => {
    expect(computeTierRange([['base_maximum_life', 60, 69]], false)).toEqual({ min: 60, max: 69 })
  })
  it('aggregated multi-stat averages mins and maxes', () => {
    expect(
      computeTierRange(
        [
          ['min', 4, 6],
          ['max', 8, 11],
        ],
        true,
      ),
    ).toEqual({ min: 6, max: 8.5 })
  })
  it('permyriad stat divides by 100 to get displayed value', () => {
    expect(computeTierRange([['om_x_permyriad', 500, 590]], false)).toEqual({ min: 5, max: 5.9 })
  })
})

describe('resolveTierLadder', () => {
  it('resolves a single-stat ladder by range match and anchors tier numbers to advTier', () => {
    // Rolled the middle tier "Healthy" (10-19), shown in-game as Tier 5.
    const ladder = resolveTierLadder(data, 'Iron Ring', [{ min: 10, max: 19 }], 5, false)
    expect(ladder).not.toBeNull()
    expect(ladder!.group).toBe('IncreasedLife')
    expect(ladder!.tiers.map((t) => t.range)).toEqual([
      { min: 3, max: 9 },
      { min: 10, max: 19 },
      { min: 60, max: 69 },
    ])
    // Anchored: matched (index 1) = advTier 5; lower value = higher number, higher value = lower.
    expect(ladder!.tiers.map((t) => t.tier)).toEqual([6, 5, 4])
  })

  it('resolves an aggregated multi-stat ladder', () => {
    const ladder = resolveTierLadder(
      data,
      'Iron Ring',
      [
        { min: 4, max: 6 },
        { min: 8, max: 11 },
      ],
      1,
      true,
    )
    expect(ladder).not.toBeNull()
    expect(ladder!.group).toBe('PhysicalDamage')
    expect(ladder!.tiers[0].range).toEqual({ min: 6, max: 8.5 })
  })

  it('returns null for a hybrid multi-stat mod (not aggregated)', () => {
    const ladder = resolveTierLadder(
      data,
      'Iron Ring',
      [
        { min: 4, max: 6 },
        { min: 8, max: 11 },
      ],
      1,
      false,
    )
    expect(ladder).toBeNull()
  })

  it('returns null for an unknown base or no range match', () => {
    expect(resolveTierLadder(data, 'Gold Ring', [{ min: 10, max: 19 }], 5, false)).toBeNull()
    expect(resolveTierLadder(data, 'Iron Ring', [{ min: 999, max: 1000 }], 5, false)).toBeNull()
  })

  it('resolves a permyriad stat using displayed value-space (divide by 100)', () => {
    const ladder = resolveTierLadder(data, 'Iron Ring', [{ min: 5, max: 5.9 }], 4, false)
    expect(ladder).not.toBeNull()
    expect(ladder!.group).toBe('ManaLeech')
    expect(ladder!.tiers[0].range).toEqual({ min: 5, max: 5.9 })
  })
})

describe('valueToTier', () => {
  const ladder = resolveTierLadder(data, 'Iron Ring', [{ min: 10, max: 19 }], 5, false)!
  it('maps a value to the highest tier whose range.min <= value', () => {
    expect(valueToTier(ladder.tiers, 65).tier).toBe(4) // top tier (60-69)
    expect(valueToTier(ladder.tiers, 12).tier).toBe(5) // middle (10-19)
    expect(valueToTier(ladder.tiers, 0).tier).toBe(6) // clamps to lowest tier
  })
})
