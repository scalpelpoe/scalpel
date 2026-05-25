// src/main/learning/decay.test.ts
import { describe, it, expect } from 'vitest'
import { decayFactor, mergeObservation, decayedSample, HALF_LIFE_MS } from './decay'

describe('decayFactor', () => {
  it('is 1 at zero elapsed and 0.5 at one half-life', () => {
    expect(decayFactor(0)).toBe(1)
    expect(decayFactor(HALF_LIFE_MS)).toBeCloseTo(0.5, 6)
  })
})

describe('mergeObservation', () => {
  it('starts a fresh counter', () => {
    expect(mergeObservation(undefined, true, 1000)).toEqual({ enabledWeight: 1, shownWeight: 1, lastTs: 1000 })
    expect(mergeObservation(undefined, false, 1000)).toEqual({ enabledWeight: 0, shownWeight: 1, lastTs: 1000 })
  })

  it('decays the existing counter before adding the new observation', () => {
    const rec = { enabledWeight: 4, shownWeight: 4, lastTs: 0 }
    const merged = mergeObservation(rec, false, HALF_LIFE_MS)
    expect(merged.shownWeight).toBeCloseTo(3, 6) // 4*0.5 + 1
    expect(merged.enabledWeight).toBeCloseTo(2, 6) // 4*0.5 + 0
    expect(merged.lastTs).toBe(HALF_LIFE_MS)
  })
})

describe('decayedSample', () => {
  it('returns zeroed weights for a missing record', () => {
    expect(decayedSample(undefined, 1000)).toEqual({ enabledWeight: 0, shownWeight: 0 })
  })
  it('decays without mutating lastTs', () => {
    const s = decayedSample({ enabledWeight: 2, shownWeight: 2, lastTs: 0 }, HALF_LIFE_MS)
    expect(s.shownWeight).toBeCloseTo(1, 6)
    expect(s.enabledWeight).toBeCloseTo(1, 6)
  })
})
