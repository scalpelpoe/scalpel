import { describe, it, expect } from 'vitest'
import { generateBoundedValueRegex, generateNumberRangeRegex, generateNumberRegex } from './waystone-number-regex'
import { generateNumberRegex as reference } from './__fixtures__/poe2re/GenerateNumberRegex'
import {
  generateNumberRangeRegex as upstreamRange,
  generateBoundedValueRegex as upstreamBounded,
} from './__fixtures__/poe2re/GenerateNumberRegexCurrent'

/** Parity against poe2.re's reference number-regex. We sweep representative values
 *  across every round10 / over100 combination and assert byte-for-byte equality. */
describe('generateNumberRegex: parity with poe2.re reference', () => {
  const values = [0, 1, 5, 9, 10, 15, 20, 24, 25, 30, 90, 99, 100, 101, 110, 150, 175, 199, 200, 250, 300]
  for (const round10 of [false, true]) {
    for (const over100 of [false, true]) {
      for (const v of values) {
        it(`value=${v} round10=${round10} over100=${over100}`, () => {
          expect(generateNumberRegex(String(v), round10, over100)).toBe(reference(String(v), round10, over100))
        })
      }
    }
  }
})

const toMatcher = (regex: string) => new RegExp(`^(?:${regex.replace(/\./g, '\\d')})$`)

describe('generateNumberRangeRegex', () => {
  const cases: [string, string, string][] = [
    ['23', '27', '2[3-7]'],
    ['20', '29', '2.'],
    ['10', '99', '[1-9].'],
    ['15', '42', '(1[5-9]|[2-3].|4[0-2])'],
    ['15', '40', '(1[5-9]|[2-3].|40)'],
    ['19', '30', '(19|2.|30)'],
    ['30', '50', '([3-4].|50)'],
    ['30', '59', '[3-5].'],
    ['23', '23', '23'],
    ['3', '7', '[3-7]'],
    ['5', '5', '5'],
    ['0', '9', '.'],
    ['5', '20', '([5-9]|1.|20)'],
    ['8', '12', '([8-9]|1[0-2])'],
    ['1', '99', '([1-9]|[1-9].)'],
  ]
  it.each(cases)('%s-%s -> %s', (min, max, expected) => {
    expect(generateNumberRangeRegex(min, max, false)).toBe(expected)
  })

  it('matches exactly the integers in range for every 1-2 digit range', () => {
    // Accumulate mismatches and assert once: ~490k expect() calls time out under
    // full-suite worker contention; one toEqual keeps the sweep exhaustive and fast.
    const mismatches: string[] = []
    for (let lo = 1; lo <= 99; lo++) {
      for (let hi = lo; hi <= 99; hi++) {
        const matcher = toMatcher(generateNumberRangeRegex(String(lo), String(hi), false))
        for (let n = 1; n <= 99; n++) {
          if (matcher.test(String(n)) !== (n >= lo && n <= hi)) mismatches.push(`[${lo}-${hi}] vs ${n}`)
        }
      }
    }
    expect(mismatches).toEqual([])
  })

  it('round10 floors both bounds', () => {
    expect(generateNumberRangeRegex('25', '48', true)).toBe('([2-3].|40)')
    expect(generateNumberRangeRegex('25', '29', true)).toBe('20')
  })

  it('returns empty for 3-digit or invalid input', () => {
    expect(generateNumberRangeRegex('100', '200', false)).toBe('')
    expect(generateNumberRangeRegex('10', '150', false)).toBe('')
    expect(generateNumberRangeRegex('abc', '27', false)).toBe('')
    expect(generateNumberRangeRegex('50', '30', false)).toBe('')
  })

  it('is upstream-parity for the full 1-99 sweep', () => {
    const mismatches: string[] = []
    for (let lo = 1; lo <= 99; lo++) {
      for (let hi = lo; hi <= 99; hi++) {
        const ours = generateNumberRangeRegex(String(lo), String(hi), false)
        const theirs = upstreamRange(String(lo), String(hi), false)
        if (ours !== theirs) mismatches.push(`[${lo}-${hi}]: ${ours} != ${theirs}`)
      }
    }
    expect(mismatches).toEqual([])
  })
})

describe('generateBoundedValueRegex', () => {
  it('escapes digits and anchors on the range-open paren', () => {
    expect(generateBoundedValueRegex('23', '27', false, false)).toBe('2[3-7]\\(')
    expect(generateBoundedValueRegex('15', '42', false, false)).toBe('(1[5-9]|[2-3]\\d|4[0-2])\\(')
  })
  it('is upstream-parity for 2-digit inputs', () => {
    expect(generateBoundedValueRegex('30', '59', false, false)).toBe(upstreamBounded('30', '59', false))
    expect(generateBoundedValueRegex('8', '12', true, false)).toBe(upstreamBounded('8', '12', true))
  })
  it('falls back to our scalar >= regex for 3-digit input (over100-aware, deviates from upstream)', () => {
    expect(generateBoundedValueRegex('100', '200', false, false)).toBe(`${generateNumberRegex('100', false, false)}\\(`)
  })
})
