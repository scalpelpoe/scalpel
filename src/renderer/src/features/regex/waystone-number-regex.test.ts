import { describe, it, expect } from 'vitest'
import { generateNumberRegex } from './waystone-number-regex'
import { generateNumberRegex as reference } from './__fixtures__/poe2re/GenerateNumberRegex'

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
