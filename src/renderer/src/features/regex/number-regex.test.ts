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

describe('atLeastRegex - PR #398 regressions', () => {
  // Upstream bugs the helper had before veiset/poe-vendor-string#398. Our impl is shaped
  // differently and these traced as correct during port; tests stay so we can't drift back.

  it('min=290 does not over-match values below the minimum', () => {
    const pat = atLeastRegex(290)
    for (let v = 200; v < 290; v++) expect(matches(pat, v), `v=${v}`).toBe(false)
    for (let v = 290; v <= 999; v++) expect(matches(pat, v), `v=${v}`).toBe(true)
  })

  it('min=175 still matches 200-999', () => {
    const pat = atLeastRegex(175)
    for (let v = 175; v <= 999; v++) expect(matches(pat, v), `v=${v}`).toBe(true)
  })

  it('min=185 still matches 200-999', () => {
    const pat = atLeastRegex(185)
    for (let v = 185; v <= 999; v++) expect(matches(pat, v), `v=${v}`).toBe(true)
  })

  it('min=105 matches X00 values (200, 300, ..., 900)', () => {
    const pat = atLeastRegex(105)
    for (const v of [200, 300, 400, 500, 600, 700, 800, 900]) {
      expect(matches(pat, v), `v=${v}`).toBe(true)
    }
  })
})

describe('atLeastRegex - exact-hundred boundaries collapse to compact form', () => {
  it.each([
    [100, '[1-9]..'],
    [200, '[2-9]..'],
    [500, '[5-9]..'],
    [900, '9..'],
  ])('min=%i produces %s', (n, expected) => {
    expect(atLeastRegex(n)).toBe(expected)
  })
})

describe('atLeastRegex - exhaustive correctness sweep', () => {
  it('every min in 1..999 matches exactly v>=min for v in 1..999', () => {
    const failures: string[] = []
    outer: for (let n = 1; n <= 999; n++) {
      const pat = atLeastRegex(n)
      const re = new RegExp(`^${pat}$`)
      for (let v = 1; v <= 999; v++) {
        const should = v >= n
        const does = re.test(String(v))
        if (should !== does) {
          failures.push(`n=${n} v=${v} should=${should} does=${does} re=${pat}`)
          if (failures.length >= 10) break outer
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('no generated pattern exceeds 30 characters for min in 1..999', () => {
    const oversized: { n: number; r: string }[] = []
    for (let n = 1; n <= 999; n++) {
      const r = atLeastRegex(n)
      if (r.length > 30) oversized.push({ n, r })
    }
    expect(oversized).toEqual([])
  })
})
