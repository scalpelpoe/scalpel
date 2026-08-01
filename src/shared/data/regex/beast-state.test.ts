import { describe, expect, it } from 'vitest'
import { DEFAULT_BEAST_STATE, beastStateEquals, sanitizeBeastState } from './beast-state'

describe('sanitizeBeastState', () => {
  it('returns defaults for non-objects', () => {
    expect(sanitizeBeastState(null)).toEqual(DEFAULT_BEAST_STATE)
    expect(sanitizeBeastState(undefined)).toEqual(DEFAULT_BEAST_STATE)
    expect(sanitizeBeastState('nope')).toEqual(DEFAULT_BEAST_STATE)
    expect(sanitizeBeastState(42)).toEqual(DEFAULT_BEAST_STATE)
    expect(sanitizeBeastState([])).toEqual(DEFAULT_BEAST_STATE)
  })

  it('keeps valid fields', () => {
    const s = sanitizeBeastState({
      minChaos: 10,
      maxChaos: 500,
      includeHarvest: true,
      menagerieLimit: true,
      redOnly: true,
      pinned: ['Vivid Vulture'],
      muted: ['Craicic Squid'],
    })
    expect(s).toEqual({
      minChaos: 10,
      maxChaos: 500,
      includeHarvest: true,
      menagerieLimit: true,
      redOnly: true,
      pinned: ['Vivid Vulture'],
      muted: ['Craicic Squid'],
    })
  })

  it('drops wrong-typed fields back to defaults', () => {
    const s = sanitizeBeastState({
      minChaos: 'ten',
      maxChaos: Number.NaN,
      includeHarvest: 'yes',
      menagerieLimit: 1,
      redOnly: null,
      pinned: 'Vivid Vulture',
      muted: [1, 2, 3],
    })
    expect(s).toEqual(DEFAULT_BEAST_STATE)
  })

  it('rejects negative and non-finite chaos bounds', () => {
    expect(sanitizeBeastState({ minChaos: -5 }).minChaos).toBeNull()
    expect(sanitizeBeastState({ maxChaos: Number.POSITIVE_INFINITY }).maxChaos).toBeNull()
  })

  it('filters non-string and empty entries out of pinned and muted', () => {
    const s = sanitizeBeastState({ pinned: ['Woods Ursa', '', 7, null], muted: [{}, 'Host Cobra'] })
    expect(s.pinned).toEqual(['Woods Ursa'])
    expect(s.muted).toEqual(['Host Cobra'])
  })

  it('dedupes names within each list', () => {
    const s = sanitizeBeastState({ pinned: ['Woods Ursa', 'Woods Ursa'] })
    expect(s.pinned).toEqual(['Woods Ursa'])
  })

  it('resolves a name present in both lists as pinned', () => {
    const s = sanitizeBeastState({ pinned: ['Woods Ursa'], muted: ['Woods Ursa', 'Host Cobra'] })
    expect(s.pinned).toEqual(['Woods Ursa'])
    expect(s.muted).toEqual(['Host Cobra'])
  })

  it('ignores prototype-pollution keys', () => {
    const s = sanitizeBeastState(JSON.parse('{"__proto__":{"polluted":true},"redOnly":true}'))
    expect(s.redOnly).toBe(true)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('round-trips through JSON', () => {
    const original = sanitizeBeastState({ minChaos: 3, redOnly: true, pinned: ['Woods Ursa'] })
    expect(sanitizeBeastState(JSON.parse(JSON.stringify(original)))).toEqual(original)
  })
})

describe('beastStateEquals', () => {
  it('is true for identical states', () => {
    expect(beastStateEquals(DEFAULT_BEAST_STATE, sanitizeBeastState({}))).toBe(true)
  })

  it('ignores ordering within pinned and muted', () => {
    const a = sanitizeBeastState({ pinned: ['A', 'B'], muted: ['C', 'D'] })
    const b = sanitizeBeastState({ pinned: ['B', 'A'], muted: ['D', 'C'] })
    expect(beastStateEquals(a, b)).toBe(true)
  })

  it('is false when any scalar differs', () => {
    const base = sanitizeBeastState({})
    expect(beastStateEquals(base, sanitizeBeastState({ redOnly: true }))).toBe(false)
    expect(beastStateEquals(base, sanitizeBeastState({ minChaos: 1 }))).toBe(false)
    expect(beastStateEquals(base, sanitizeBeastState({ menagerieLimit: true }))).toBe(false)
  })

  it('is false when a set differs', () => {
    const a = sanitizeBeastState({ pinned: ['A'] })
    const b = sanitizeBeastState({ pinned: ['A', 'B'] })
    expect(beastStateEquals(a, b)).toBe(false)
  })
})
