import { describe, it, expect } from 'vitest'
import { buildRelicRegex, type RelicSelections } from './relic-engine'
import type { RelicMod } from '@shared/data/regex/relic-mods'
import { generateNumberRegex } from './relic-number-regex'

// Inline fixtures (independent of the generated data) so expectations are stable.
const P1: RelicMod = {
  id: 1,
  regex: 'lif',
  text: '#% increased maximum Life',
  affix: 'PREFIX',
  ranges: [[5, 25]],
  values: [],
}
const P2: RelicMod = {
  id: 2,
  regex: 'ed mo',
  text: '#% increased Movement Speed',
  affix: 'PREFIX',
  ranges: [[3, 10]],
  values: [],
}
const S1: RelicMod = {
  id: 3,
  regex: 'vo',
  text: '#% chance to Avoid gaining an Affliction',
  affix: 'SUFFIX',
  ranges: [[6, 15]],
  values: [],
}
const S2: RelicMod = {
  id: 4,
  regex: 'f k',
  text: '#% increased quantity of Keys',
  affix: 'SUFFIX',
  ranges: [[6, 25]],
  values: [],
}
const MODS = [P1, P2, S1, S2]

const sel = (over: Partial<RelicSelections>): RelicSelections => ({
  want: new Set<number>(),
  wantValues: {},
  matchType: 'any',
  ...over,
})

describe('buildRelicRegex', () => {
  it('returns empty string when nothing is selected', () => {
    expect(buildRelicRegex({ mods: MODS, selections: sel({}) })).toBe('')
  })

  it('emits a single bare prefix token', () => {
    expect(buildRelicRegex({ mods: MODS, selections: sel({ want: new Set([1]) }) })).toBe('"lif"')
  })

  it('joins multiple prefixes with | and drops the empty suffix side', () => {
    expect(buildRelicRegex({ mods: MODS, selections: sel({ want: new Set([1, 2]) }) })).toBe('"lif|ed mo"')
  })

  it('any mode: prefix and suffix tokens combine into one alternation', () => {
    expect(buildRelicRegex({ mods: MODS, selections: sel({ want: new Set([1, 3]), matchType: 'any' }) })).toBe(
      '"lif|vo"',
    )
  })

  it('both mode emits a prefix group AND a suffix group', () => {
    expect(buildRelicRegex({ mods: MODS, selections: sel({ want: new Set([1, 3]), matchType: 'both' }) })).toBe(
      '"lif" "vo"',
    )
  })

  it('both mode with multiple mods per side', () => {
    expect(buildRelicRegex({ mods: MODS, selections: sel({ want: new Set([1, 2, 3, 4]), matchType: 'both' }) })).toBe(
      '"lif|ed mo" "vo|f k"',
    )
  })

  it('both mode with only one side selected degrades to a single group (matches poe2.re)', () => {
    expect(buildRelicRegex({ mods: MODS, selections: sel({ want: new Set([1]), matchType: 'both' }) })).toBe('"lif"')
  })

  it('prefixes a magnitude via generateNumberRegex when a value is set', () => {
    const num = generateNumberRegex('10', false)
    expect(buildRelicRegex({ mods: MODS, selections: sel({ want: new Set([1]), wantValues: { 1: 10 } }) })).toBe(
      `"${num}.*lif"`,
    )
  })

  it('ignores a falsy (0) value, emitting the bare token', () => {
    expect(buildRelicRegex({ mods: MODS, selections: sel({ want: new Set([1]), wantValues: { 1: 0 } }) })).toBe('"lif"')
  })
})
