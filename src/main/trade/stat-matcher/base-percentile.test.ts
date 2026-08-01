import { describe, expect, it } from 'vitest'
import { computeBasePercentile } from './base-percentile'

const noDef = { armour: 0, evasion: 0, energyShield: 0, ward: 0, block: 0 }

describe('computeBasePercentile', () => {
  it('detects a perfect 20-quality roll (Astral Plate)', () => {
    // base 782 rolled, 20% quality: round(782 * 1.2) = 938 displayed
    const pct = computeBasePercentile({
      bounds: { ar: [711, 782] },
      defenses: { ...noDef, armour: 938 },
      quality: 20,
      modLines: [],
    })
    expect(pct).toEqual({ lo: 100, hi: 100 })
  })

  it('detects a perfect roll on a small-range ES base where naive division fails', () => {
    // base 32 rolled, 20% quality: round(32 * 1.2) = 38 displayed. Naive
    // reverse math gives 38 / 1.2 = 31.67 -> 92nd percentile; enumeration
    // recovers the roll exactly (only base 32 rounds to 38).
    const pct = computeBasePercentile({
      bounds: { es: [28, 32] },
      defenses: { ...noDef, energyShield: 38 },
      quality: 20,
      modLines: [],
    })
    expect(pct).toEqual({ lo: 100, hi: 100 })
  })

  it('recovers a mid roll through quality, increased mods, and a crafted flat', () => {
    // base 740: round((740 + 80) * 1.50 * 1.20) = 1476 displayed
    const pct = computeBasePercentile({
      bounds: { ar: [711, 782] },
      defenses: { ...noDef, armour: 1476 },
      quality: 20,
      modLines: [
        '42% increased Armour',
        '8% increased Armour, Evasion and Energy Shield (implicit)',
        '+80 to Armour (crafted)',
      ],
    })
    // round(100 * (740 - 711) / 71) = 41
    expect(pct).toEqual({ lo: 41, hi: 41 })
  })

  it('computes a plain white base with no quality', () => {
    const pct = computeBasePercentile({
      bounds: { ar: [711, 782] },
      defenses: { ...noDef, armour: 750 },
      quality: 0,
      modLines: [],
    })
    // round(100 * 39 / 71) = 55
    expect(pct).toEqual({ lo: 55, hi: 55 })
  })

  it('sums flat ward mods and strips line annotations', () => {
    // base 60 (max), +15 flat: displayed 75
    const pct = computeBasePercentile({
      bounds: { ward: [30, 60] },
      defenses: { ...noDef, ward: 75 },
      quality: 0,
      modLines: ['+15 to Ward (fractured)'],
    })
    expect(pct).toEqual({ lo: 100, hi: 100 })
  })

  it('solves with the largest-range defence and ignores the others', () => {
    // ar span 71 beats es span 6. Probe-validated: intersecting defences
    // over-tightens on hybrids; the widest span alone matches GGG.
    const pct = computeBasePercentile({
      bounds: { ar: [711, 782], es: [43, 49] },
      defenses: { ...noDef, armour: 890, energyShield: 58 },
      quality: 20,
      modLines: [],
    })
    // round(b * 1.2) = 890 -> b = 742 -> round(100 * 31 / 71) = 44
    expect(pct).toEqual({ lo: 44, hi: 44 })
  })

  it('returns an honest range when two rolls collide on one displayed value', () => {
    // 50% reduced Armour: bases 197 (round(98.5) = 99) and 198 (round(99) = 99)
    // both display 99.
    const pct = computeBasePercentile({
      bounds: { ar: [100, 200] },
      defenses: { ...noDef, armour: 99 },
      quality: 0,
      modLines: ['50% reduced Armour'],
    })
    // percentiles round(97) = 97 and round(98) = 98
    expect(pct).toEqual({ lo: 97, hi: 98 })
  })

  it('mirrors GGG rounding: a near-max roll on a huge span maps to 100', () => {
    // span 300, base 299: round(299 * 1.15) = 344 displayed, uniquely base 299.
    // GGG's own percentile formula round(100 * 299 / 300) = 100, so reporting
    // 100 here MATCHES the value the trade site indexes for this item.
    const pct = computeBasePercentile({
      bounds: { ar: [0, 300] },
      defenses: { ...noDef, armour: 344 },
      quality: 15,
      modLines: [],
    })
    expect(pct).toEqual({ lo: 100, hi: 100 })
  })

  it('returns null when no roll reproduces the displayed value', () => {
    const pct = computeBasePercentile({
      bounds: { ar: [100, 200] },
      defenses: { ...noDef, armour: 500 },
      quality: 0,
      modLines: [],
    })
    expect(pct).toBeNull()
  })

  it('returns null when no bounded defence is displayed', () => {
    const pct = computeBasePercentile({
      bounds: { ar: [100, 200] },
      defenses: noDef,
      quality: 0,
      modLines: [],
    })
    expect(pct).toBeNull()
  })
})
