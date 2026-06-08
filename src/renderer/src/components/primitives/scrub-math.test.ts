import { describe, it, expect } from 'vitest'
import { placeholderRangeMidpoint, scrubAccumulate, snapToStep } from './scrub-math'

describe('scrubAccumulate', () => {
  it('scrubs tiny integer stats slowly so a +1/2/3 range is not crossed in a few pixels', () => {
    // step 1, magnitude 0 -> tiny tier speed 0.15: dx 30 -> +30*0.15*1/3 = +1.5 (20px per step)
    expect(scrubAccumulate(0, 30, 1)).toBeCloseTo(1.5)
  })
  it('leaves the speed floor at 0.5 once an integer stat passes magnitude 5', () => {
    // step 1, magnitude 5 -> not tiny -> speed 0.5: dx 30 -> 5 + 30*0.5*1/3 = +5 -> 10
    expect(scrubAccumulate(5, 30, 1)).toBeCloseTo(10)
  })
  it('boosts decimal stats 4x so their many fine steps are not sluggish to cross', () => {
    // step < 1 is never tiny; decimal boost applies the 4x multiplier to the 0.5 floor.
    // step 0.01, magnitude 0 -> speed 0.5*4=2: dx 30 -> +30*2*0.01/3 = +0.2
    expect(scrubAccumulate(0, 30, 0.01)).toBeCloseTo(0.2)
    // step 0.1, magnitude 0 -> speed 0.5*4=2: dx 30 -> +30*2*0.1/3 = +2
    expect(scrubAccumulate(0, 30, 0.1)).toBeCloseTo(2)
  })
  it('moves faster for large magnitudes', () => {
    // magnitude 1000 -> speed 5: dx 30 -> +30*5*1/3 = +50
    expect(scrubAccumulate(1000, 30, 1)).toBeCloseTo(1050)
  })
})

describe('snapToStep', () => {
  it('removes floating-point junk from fractional steps', () => {
    expect(snapToStep(1.45000001, 0.1, 1)).toBeCloseTo(1.5)
  })
  it('rounds to the nearest step for integer steps', () => {
    expect(snapToStep(63.7, 1, 0)).toBe(64)
  })
})

describe('placeholderRangeMidpoint', () => {
  it('returns the midpoint of an integer range', () => {
    expect(placeholderRangeMidpoint('20-40')).toBe(30)
  })
  it('returns the midpoint of a decimal range', () => {
    expect(placeholderRangeMidpoint('1-1.5')).toBe(1.25)
  })
  it('returns null for a non-range placeholder', () => {
    expect(placeholderRangeMidpoint('0')).toBeNull()
    expect(placeholderRangeMidpoint('--')).toBeNull()
    expect(placeholderRangeMidpoint('16')).toBeNull()
  })
})
