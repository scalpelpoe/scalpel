import { setPoeVersion } from '@main/game-state'
import { beforeEach, describe, expect, it } from 'vitest'
import { deriveContext } from '../context'
import { buildBasePercentileFilter } from './base-percentile'

// Astral Plate bounds in the generated sheet: ar [711, 782].
// floor(782 * 1.2) = 938 -> perfect 20-quality roll.
const itemInfo = {
  sockets: '',
  linkedSockets: 0,
  quality: 20,
  itemLevel: 84,
  baseType: 'Astral Plate',
  rarity: 'Rare',
  itemClass: 'Body Armours',
  gemLevel: 0,
  corrupted: false,
  mirrored: false,
  identified: true,
}

const defenses = { armour: 938, evasion: 0, energyShield: 0, ward: 0, block: 0 }

function ctx(
  overrides: { itemInfo?: Partial<typeof itemInfo>; defenses?: Partial<typeof defenses>; explicits?: string[] } = {},
) {
  return deriveContext({
    implicits: [],
    explicits: overrides.explicits ?? [],
    itemInfo: { ...itemInfo, ...overrides.itemInfo },
    defenses: { ...defenses, ...overrides.defenses },
    advancedMods: undefined,
    defaultPercent: 90,
  })
}

describe('buildBasePercentileFilter', () => {
  beforeEach(() => {
    setPoeVersion(1)
  })

  it('emits a default-enabled chip for a perfect base', () => {
    const out = buildBasePercentileFilter(ctx())
    expect(out).toEqual([
      {
        id: 'defence.base_percentile',
        text: 'Base Percentile: 100%',
        value: 100,
        min: 100,
        max: null,
        enabled: true,
        type: 'defence',
      },
    ])
  })

  it('emits a default-disabled chip for a non-perfect base', () => {
    // round(750 * 1.2) = 900 -> base 750 -> percentile 55
    const out = buildBasePercentileFilter(ctx({ defenses: { armour: 900 } }))
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe('Base Percentile: 55%')
    expect(out[0].value).toBe(55)
    expect(out[0].enabled).toBe(false)
    expect(out[0].min).toBe(55)
  })

  it('renders a lo-hi range and stays disabled when rolls collide', () => {
    // 50% reduced Armour, quality 0, Astral Plate [711, 782]: bases 741
    // (round(370.5) = 371) and 742 (round(371) = 371) both display 371 ->
    // percentiles round(100*30/71) = 42 and round(100*31/71) = 44.
    const out = buildBasePercentileFilter(
      ctx({
        itemInfo: { quality: 0 },
        defenses: { armour: 371 },
        explicits: ['50% reduced Armour'],
      }),
    )
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe('Base Percentile: 42-44%')
    expect(out[0].value).toBe(44)
    expect(out[0].min).toBe(42)
    expect(out[0].enabled).toBe(false)
  })

  it('skips PoE2', () => {
    setPoeVersion(2)
    expect(buildBasePercentileFilter(ctx())).toEqual([])
  })

  it('skips uniques', () => {
    expect(buildBasePercentileFilter(ctx({ itemInfo: { rarity: 'Unique' } }))).toEqual([])
  })

  it('skips unidentified items', () => {
    expect(buildBasePercentileFilter(ctx({ itemInfo: { identified: false } }))).toEqual([])
  })

  it('skips bases without bounds data', () => {
    expect(buildBasePercentileFilter(ctx({ itemInfo: { baseType: 'Leather Belt' } }))).toEqual([])
  })

  it('skips when the displayed value matches no roll (data drift)', () => {
    expect(buildBasePercentileFilter(ctx({ defenses: { armour: 5000 } }))).toEqual([])
  })
})
