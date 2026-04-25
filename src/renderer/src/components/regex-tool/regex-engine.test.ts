import { describe, it, expect } from 'vitest'
import { buildMapRegex } from './regex-engine'
import type { MapMod } from '../../../../shared/data/regex/map-mods'

/** Fabricate a MapMod with just the fields buildMapRegex touches. Ids are unique and
 *  chosen not to collide with anything in the real optimization table so the tests
 *  exercise the "no optimization applies" path deterministically. */
function mod(id: number, regex: string): MapMod {
  return { id, regex, text: '', danger: 'harmless', nightmare: false }
}

describe('buildMapRegex', () => {
  it('returns an empty string when nothing is selected', () => {
    expect(buildMapRegex([], [], 'any')).toBe('')
  })

  it('emits a negated group for avoid-only', () => {
    const out = buildMapRegex([mod(9000001, 'aaa'), mod(9000002, 'bbb')], [], 'any')
    // Order inside the alternation depends on the Set iteration order, so just assert
    // the shape and that both tokens are present.
    expect(out).toMatch(/^"!(aaa|bbb)\|(aaa|bbb)"$/)
  })

  it('emits a plain alternation for want=any', () => {
    const out = buildMapRegex([], [mod(9000003, 'ccc'), mod(9000004, 'ddd')], 'any')
    expect(out).toMatch(/^"(ccc|ddd)\|(ccc|ddd)"$/)
  })

  it('emits one quoted token per mod for want=all', () => {
    const out = buildMapRegex([], [mod(9000005, 'eee'), mod(9000006, 'fff')], 'all')
    // "all" uses one token per quoted group so poe.re's "match all" parser can AND them.
    expect(out).toBe('"eee" "fff"')
  })

  it('concatenates avoid + want with a space', () => {
    const out = buildMapRegex([mod(9000007, 'aaa')], [mod(9000008, 'bbb')], 'any')
    expect(out).toBe('"!aaa" "bbb"')
  })

  it('concatenates avoid + want=all correctly', () => {
    const out = buildMapRegex([mod(9000009, 'aaa')], [mod(9000010, 'bbb'), mod(9000011, 'ccc')], 'all')
    expect(out).toBe('"!aaa" "bbb" "ccc"')
  })

  it('passes a single want=any mod through without trailing pipe', () => {
    const out = buildMapRegex([], [mod(9000012, 'solo')], 'any')
    expect(out).toBe('"solo"')
  })
})
