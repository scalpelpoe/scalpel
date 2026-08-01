import { describe, expect, it } from 'vitest'
import { beastRegex } from './vendor/beast/GeneratedBeastRegex'

describe('synced beast dataset', () => {
  it('loads a populated beast list', () => {
    // Upstream's list is craftable (red) and harvest beasts only, not the full
    // ~380-beast bestiary -- currently 51 rows, all red. 30 leaves headroom for
    // upstream churn while still catching a truncated/empty sync.
    expect(beastRegex.length).toBeGreaterThan(30)
  })

  it('every row carries a non-empty name and regex fragment', () => {
    for (const b of beastRegex) {
      expect(b.beast.length, JSON.stringify(b)).toBeGreaterThan(0)
      expect(b.regex.length, JSON.stringify(b)).toBeGreaterThan(0)
      expect(typeof b.harvest).toBe('boolean')
      expect(typeof b.red).toBe('boolean')
    }
  })

  it('preserves non-ASCII names through the sync (mojibake guard)', () => {
    // "Black M<o-acute>rrigan" is the join key against poe.ninja's payload. If the
    // sync script drops its UTF-8 encoding this name arrives mangled and the beast
    // silently loses its price. Built from a code point so this test file stays ASCII.
    const expected = `Black M${String.fromCharCode(0xf3)}rrigan`
    const names = beastRegex.map((b) => b.beast)
    expect(names).toContain(expected)
    expect(names.some((n) => n.includes('�'))).toBe(false)
  })

  it('marks red beasts with craft recipes', () => {
    const red = beastRegex.filter((b) => b.red)
    expect(red.length).toBeGreaterThan(10)
    expect(red.some((b) => b.recipe.length > 0)).toBe(true)
  })
})
