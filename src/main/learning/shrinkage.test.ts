// src/main/learning/shrinkage.test.ts
import { describe, it, expect } from 'vitest'
import { blendEnableRate, decide } from './shrinkage'

const G = (enabledWeight: number, shownWeight: number, isGlobal = false) => ({ enabledWeight, shownWeight, isGlobal })

describe('blendEnableRate', () => {
  it('returns the shipped-default prior when there is no data', () => {
    expect(blendEnableRate([], true).rate).toBeCloseTo(0.6, 6)
    expect(blendEnableRate([], false).rate).toBeCloseTo(0.4, 6)
  })

  it('moves toward strong specific evidence', () => {
    // strong "always enabled" at the specific rung
    const blend = blendEnableRate([G(0, 0, true), G(10, 10)], false)
    expect(blend.rate).toBeGreaterThan(0.8)
    expect(blend.totalMass).toBeCloseTo(10, 6)
    expect(blend.specificMass).toBeCloseTo(10, 6)
  })

  it('separates global mass from specific mass', () => {
    const blend = blendEnableRate([G(20, 20, true), G(0, 0)], true)
    expect(blend.totalMass).toBeCloseTo(20, 6)
    expect(blend.specificMass).toBe(0)
  })
})

describe('decide', () => {
  it('eager flips once enough total mass crosses the margin', () => {
    expect(decide({ rate: 0.8, totalMass: 5, specificMass: 0 }, 'eager')).toBe(true)
    expect(decide({ rate: 0.2, totalMass: 5, specificMass: 0 }, 'eager')).toBe(false)
    expect(decide({ rate: 0.8, totalMass: 1, specificMass: 0 }, 'eager')).toBeNull() // too little mass
    expect(decide({ rate: 0.52, totalMass: 9, specificMass: 9 }, 'eager')).toBeNull() // inside margin
  })

  it('conservative needs decisive rate and specific mass', () => {
    expect(decide({ rate: 0.8, totalMass: 50, specificMass: 6 }, 'conservative')).toBe(true)
    expect(decide({ rate: 0.8, totalMass: 50, specificMass: 4 }, 'conservative')).toBeNull() // not enough specific mass
    expect(decide({ rate: 0.6, totalMass: 50, specificMass: 9 }, 'conservative')).toBeNull() // rate not decisive
    expect(decide({ rate: 0.25, totalMass: 50, specificMass: 9 }, 'conservative')).toBe(false)
  })
})
