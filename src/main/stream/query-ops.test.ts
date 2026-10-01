import { describe, expect, it } from 'vitest'
import { diffOps, removalOps, sentinelPath } from './query-ops'

describe('removalOps', () => {
  it('returns [] for equal values', () => {
    expect(removalOps({ a: 1 }, { a: 1 })).toEqual([])
  })
  it('deletes object keys the off-build dropped', () => {
    const on = { filters: { misc_filters: { filters: { ilvl: { min: 80 }, quality: { min: 20 } } } } }
    const off = { filters: { misc_filters: { filters: { quality: { min: 20 } } } } }
    expect(removalOps(on, off)).toEqual([{ op: 'delete', path: ['filters', 'misc_filters', 'filters', 'ilvl'] }])
  })
  it('disables array elements the off-build dropped, keeping indices stable', () => {
    const a = { id: 'a' },
      b = { id: 'b' },
      c = { id: 'c' }
    const on = { stats: [{ type: 'and', filters: [a, b, c] }] }
    const off = { stats: [{ type: 'and', filters: [a, c] }] }
    expect(removalOps(on, off)).toEqual([{ op: 'disable', path: ['stats', 0, 'filters', 1] }])
  })
  it('rejects added keys', () => {
    expect(removalOps({ a: 1 }, { a: 1, b: 2 })).toBeNull()
  })
  it('rejects changed primitives', () => {
    expect(removalOps({ a: { min: 1 } }, { a: { min: 2 } })).toBeNull()
  })
  it('rejects a dropped array element that is not an object', () => {
    expect(removalOps({ a: [1, 2] }, { a: [1] })).toBeNull()
  })
  it('rejects arrays that are not a subsequence', () => {
    expect(removalOps({ a: [{ x: 1 }, { x: 2 }] }, { a: [{ x: 3 }] })).toBeNull()
  })
})

describe('sentinelPath', () => {
  it('finds the leaf holding the sentinel', () => {
    expect(sentinelPath({ f: [{ value: { min: 5 } }] }, { f: [{ value: { min: 987654.25 } }] }, 987654.25)).toEqual([
      'f',
      0,
      'value',
      'min',
    ])
  })
  it('is null when the sentinel appears nowhere (the builder transformed or dropped it)', () => {
    expect(sentinelPath({ min: 5 }, { min: 987654 }, 987654.25)).toBeNull()
  })
  it('is null when anything besides the sentinel leaf changed', () => {
    expect(sentinelPath({ min: 5, x: 1 }, { min: 987654.25, x: 2 }, 987654.25)).toBeNull()
  })
  it('is null when the base lacks the leaf (default had no value there)', () => {
    expect(sentinelPath({}, { min: 987654.25 }, 987654.25)).toBeNull()
  })
})

describe('diffOps', () => {
  const misc = (filters: Record<string, unknown>) => ({ query: { filters: { misc_filters: { filters } } } })

  it('returns [] for equal values', () => {
    expect(diffOps({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toEqual([])
  })
  it('sets a changed leaf', () => {
    expect(diffOps(misc({ corrupted: { option: 'false' } }), misc({ corrupted: { option: 'true' } }))).toEqual([
      { op: 'set', path: ['query', 'filters', 'misc_filters', 'filters', 'corrupted', 'option'], value: 'true' },
    ])
  })
  it('sets an added key', () => {
    expect(diffOps(misc({ quality: { min: 20 } }), misc({ quality: { min: 20 }, ilvl: { min: 80 } }))).toEqual([
      { op: 'set', path: ['query', 'filters', 'misc_filters', 'filters', 'ilvl'], value: { min: 80 } },
    ])
  })
  it('sets an added nested group as one subtree', () => {
    const on = { query: { status: { option: 'online' } } }
    const variant = {
      query: {
        status: { option: 'online' },
        filters: { misc_filters: { filters: { corrupted: { option: 'true' } } } },
      },
    }
    expect(diffOps(on, variant)).toEqual([
      {
        op: 'set',
        path: ['query', 'filters'],
        value: { misc_filters: { filters: { corrupted: { option: 'true' } } } },
      },
    ])
  })
  it('deletes and sets in one diff', () => {
    expect(diffOps(misc({ ilvl: { min: 80 } }), misc({ ilvl: { max: 80 } }))).toEqual([
      { op: 'delete', path: ['query', 'filters', 'misc_filters', 'filters', 'ilvl', 'min'] },
      { op: 'set', path: ['query', 'filters', 'misc_filters', 'filters', 'ilvl', 'max'], value: 80 },
    ])
  })
  it('sets a subtree whose type changed', () => {
    expect(diffOps({ a: { b: 1 } }, { a: [1] })).toEqual([{ op: 'set', path: ['a'], value: [1] }])
    expect(diffOps({ a: 1 }, { a: null })).toEqual([{ op: 'set', path: ['a'], value: null }])
  })
  it('recurses into same-length arrays', () => {
    expect(diffOps({ s: [{ v: 1 }, { v: 2 }] }, { s: [{ v: 1 }, { v: 3 }] })).toEqual([
      { op: 'set', path: ['s', 1, 'v'], value: 3 },
    ])
  })
  it('disables array elements the variant dropped', () => {
    const a = { id: 'a' },
      b = { id: 'b' }
    expect(diffOps({ s: [a, b] }, { s: [b] })).toEqual([{ op: 'disable', path: ['s', 0] }])
  })
  it('treats undefined-valued keys as absent', () => {
    expect(diffOps({ a: 1 }, { a: 1, b: undefined })).toEqual([])
    expect(diffOps({ a: 1, b: undefined }, { a: 1 })).toEqual([])
    expect(diffOps({ a: undefined }, { a: 2 })).toEqual([{ op: 'set', path: ['a'], value: 2 }])
    expect(diffOps({ a: 2 }, { a: undefined })).toEqual([{ op: 'delete', path: ['a'] }])
  })
  it('returns null when an array grows', () => {
    expect(diffOps({ s: [{ id: 'a' }] }, { s: [{ id: 'a' }, { id: 'b' }] })).toBeNull()
  })
  it('returns null when a shorter array is not a subsequence', () => {
    expect(diffOps({ s: [1, 2] }, { s: [3] })).toBeNull()
  })
})
