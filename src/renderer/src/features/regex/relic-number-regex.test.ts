import { describe, it, expect } from 'vitest'
import { generateNumberRegex } from './relic-number-regex'
import { generateNumberRegex as upstream } from './__fixtures__/poe2re/GenerateRelicNumberRegex'

describe('relic generateNumberRegex parity with poe2.re', () => {
  it('matches the vendored upstream for round10=false across 0..250', () => {
    for (let n = 0; n <= 250; n++) {
      expect(generateNumberRegex(String(n), false), `n=${n}`).toBe(upstream(String(n), false))
    }
  })

  it('matches the vendored upstream for round10=true across 0..250', () => {
    for (let n = 0; n <= 250; n++) {
      expect(generateNumberRegex(String(n), true), `n=${n}`).toBe(upstream(String(n), true))
    }
  })

  it('includes a 3-digit branch so high rolls (100+) match', () => {
    // Regression for the bug this fixed: the older generator emitted [4-9]\\d which
    // misses 100+ rolls; the current one must match them.
    const re = new RegExp(generateNumberRegex('40', false))
    expect(re.test('150')).toBe(true)
    expect(re.test('40')).toBe(true)
  })
})
