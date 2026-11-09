import { describe, expect, it } from 'vitest'
import {
  ACCUMULATOR_IDLE_MS,
  MAX_CLICKS_PER_EVENT,
  type NotchAccumulator,
  WHEEL_DELTA,
  normalizeToggleKey,
  pointInBounds,
  takeNotches,
  toggleKeyVk,
  wheelDeltaFromMouseData,
} from './wheel-click-shared'

describe('toggle key', () => {
  it('maps lock keys to their virtual-key codes', () => {
    expect(toggleKeyVk('CapsLock')).toBe(0x14)
    expect(toggleKeyVk('ScrollLock')).toBe(0x91)
  })
  it('falls back to CapsLock for missing or unknown values', () => {
    expect(toggleKeyVk(undefined)).toBe(0x14)
    expect(toggleKeyVk('NumLock')).toBe(0x14)
    expect(normalizeToggleKey(undefined)).toBe('CapsLock')
    expect(normalizeToggleKey('ScrollLock')).toBe('ScrollLock')
    expect(normalizeToggleKey(42)).toBe('CapsLock')
  })
})

const fresh = (): NotchAccumulator => ({ carry: 0, lastAt: 0 })

describe('takeNotches', () => {
  it('clicks once per standard notch, in either direction', () => {
    const acc = fresh()
    expect(takeNotches(acc, WHEEL_DELTA, 10)).toBe(1)
    expect(takeNotches(acc, -WHEEL_DELTA, 20)).toBe(1)
    expect(acc.carry).toBe(0)
  })

  it('accumulates hi-res partial deltas into one click per full notch', () => {
    const acc = fresh()
    // A hi-res wheel reporting one physical notch as 4 x 30.
    expect(takeNotches(acc, 30, 10)).toBe(0)
    expect(takeNotches(acc, 30, 20)).toBe(0)
    expect(takeNotches(acc, 30, 30)).toBe(0)
    expect(takeNotches(acc, 30, 40)).toBe(1)
    expect(acc.carry).toBe(0)
  })

  it('carries the remainder past a notch boundary', () => {
    const acc = fresh()
    expect(takeNotches(acc, 100, 10)).toBe(0)
    expect(takeNotches(acc, 100, 20)).toBe(1)
    expect(acc.carry).toBe(80)
  })

  it('splits a coalesced multi-notch event into several clicks', () => {
    expect(takeNotches(fresh(), WHEEL_DELTA * 3, 10)).toBe(3)
  })

  it('caps clicks for a single event', () => {
    expect(takeNotches(fresh(), WHEEL_DELTA * 50, 10)).toBe(MAX_CLICKS_PER_EVENT)
  })

  it('drops a stale partial notch after the idle window', () => {
    const acc = fresh()
    expect(takeNotches(acc, 90, 1000)).toBe(0)
    expect(takeNotches(acc, 90, 1000 + ACCUMULATOR_IDLE_MS + 1)).toBe(0)
    expect(acc.carry).toBe(90)
  })
})

describe('wheelDeltaFromMouseData', () => {
  it('reads the signed high word', () => {
    expect(wheelDeltaFromMouseData(120 << 16)).toBe(120)
    expect(wheelDeltaFromMouseData(0xff880000)).toBe(-120)
    expect(wheelDeltaFromMouseData(0xfff10000)).toBe(-15)
  })
})

describe('pointInBounds', () => {
  const b = { x: 100, y: 50, w: 800, h: 600 }
  it('includes the top-left edge and excludes the far edge', () => {
    expect(pointInBounds(100, 50, b)).toBe(true)
    expect(pointInBounds(899, 649, b)).toBe(true)
    expect(pointInBounds(900, 300, b)).toBe(false)
    expect(pointInBounds(99, 300, b)).toBe(false)
  })
  it('rejects everything when bounds are unknown', () => {
    expect(pointInBounds(0, 0, { x: 0, y: 0, w: 0, h: 0 })).toBe(false)
  })
})
