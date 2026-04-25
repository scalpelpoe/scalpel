import { describe, it, expect } from 'vitest'
import { atLeastRegex } from './number-regex'

/** Helper: compile the generated regex and check whether a candidate number matches.
 *  The full-match anchors match the full string so "4" doesn't slip past "([5-9]|\d.)". */
function matches(pattern: string, candidate: number): boolean {
  const re = new RegExp(`^${pattern}$`)
  return re.test(String(candidate))
}

describe('atLeastRegex', () => {
  it('returns an always-matching pattern for non-positive minima', () => {
    expect(atLeastRegex(0)).toBe('\\d+')
    expect(atLeastRegex(-5)).toBe('\\d+')
  })

  it('handles min=1 as "any positive integer"', () => {
    const pat = atLeastRegex(1)
    expect(pat).toBe('[1-9]\\d*')
    expect(matches(pat, 1)).toBe(true)
    expect(matches(pat, 999)).toBe(true)
    // Leading-zero forms shouldn't match.
    expect(new RegExp(`^${pat}$`).test('01')).toBe(false)
  })

  it('single-digit minimums accept the range + any 2/3-digit', () => {
    const pat = atLeastRegex(5)
    for (let n = 5; n <= 999; n++) expect(matches(pat, n), `n=${n}`).toBe(true)
    for (let n = 0; n < 5; n++) expect(matches(pat, n), `n=${n}`).toBe(false)
  })

  it('two-digit exact boundary (min=70) accepts 70..999', () => {
    const pat = atLeastRegex(70)
    for (let n = 70; n <= 999; n++) expect(matches(pat, n), `n=${n}`).toBe(true)
    for (let n = 0; n < 70; n++) expect(matches(pat, n), `n=${n}`).toBe(false)
  })

  it('two-digit partial (min=75) accepts 75..999', () => {
    const pat = atLeastRegex(75)
    for (let n = 75; n <= 999; n++) expect(matches(pat, n), `n=${n}`).toBe(true)
    for (let n = 0; n < 75; n++) expect(matches(pat, n), `n=${n}`).toBe(false)
  })

  it('three-digit exact boundary (min=100) accepts any 3-digit', () => {
    const pat = atLeastRegex(100)
    // Boundary of 100 with no remainder -> [1-9]..
    expect(pat).toBe('[1-9]..')
    for (let n = 100; n <= 999; n++) expect(matches(pat, n), `n=${n}`).toBe(true)
    expect(matches(pat, 99)).toBe(false)
  })

  it('three-digit partial (min=175) accepts 175..999', () => {
    const pat = atLeastRegex(175)
    for (let n = 175; n <= 999; n++) expect(matches(pat, n), `n=${n}`).toBe(true)
    for (const n of [0, 50, 100, 174]) expect(matches(pat, n), `n=${n}`).toBe(false)
  })

  it('two-adjacent-digits collapses to [AB] form instead of [A-B]', () => {
    // 80 and 89 -> [89].; range check keeps this compact (8|9 would be 2 chars vs [89]=4
    // but the function uses [89] for 2-char ranges and [A-B] for wider ranges).
    const pat = atLeastRegex(80)
    expect(pat).toContain('[89]')
  })
})
