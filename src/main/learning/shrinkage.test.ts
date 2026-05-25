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
    expect(blend.specificObs).toBeCloseTo(10, 6)
  })

  it('does not count global-rung evidence as specific observations', () => {
    const blend = blendEnableRate([G(20, 20, true), G(0, 0)], true)
    expect(blend.rate).toBeGreaterThan(0.9) // global still shapes the rate (soft transfer)
    expect(blend.specificObs).toBe(0) // but no specific-context evidence yet
  })

  it('takes the best-supported specific rung as the observation count', () => {
    // class rung seen 4x, deeper influence rung seen 2x -> specificObs is the max (4)
    const blend = blendEnableRate([G(0, 0, true), G(4, 4), G(2, 2)], false)
    expect(blend.specificObs).toBeCloseTo(4, 6)
  })
})

describe('decide', () => {
  it('eager flips only after EAGER_MIN_OBS (2) consistent observations', () => {
    expect(decide({ rate: 0.8, specificObs: 2 }, 'eager')).toBe(true)
    expect(decide({ rate: 0.2, specificObs: 2 }, 'eager')).toBe(false)
    expect(decide({ rate: 0.8, specificObs: 1 }, 'eager')).toBeNull() // a single enable must not flip
    expect(decide({ rate: 0.52, specificObs: 9 }, 'eager')).toBeNull() // inside the rate margin
  })

  it('rounds the observation count so within-session decay does not delay the flip', () => {
    expect(decide({ rate: 0.8, specificObs: 1.97 }, 'eager')).toBe(true) // 2 obs lightly decayed
    expect(decide({ rate: 0.8, specificObs: 1.0 }, 'eager')).toBeNull() // genuinely only 1
  })

  it('conservative needs a decisive rate and more observations', () => {
    expect(decide({ rate: 0.8, specificObs: 5 }, 'conservative')).toBe(true)
    expect(decide({ rate: 0.8, specificObs: 4 }, 'conservative')).toBeNull() // not enough observations
    expect(decide({ rate: 0.6, specificObs: 9 }, 'conservative')).toBeNull() // rate not decisive
    expect(decide({ rate: 0.25, specificObs: 9 }, 'conservative')).toBe(false)
  })
})
