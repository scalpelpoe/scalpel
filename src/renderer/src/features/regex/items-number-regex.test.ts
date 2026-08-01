import { describe, expect, it } from 'vitest'
import { generateNumberRegex } from './__fixtures__/poere/GenerateNumberRegex'
import { itemsNumberRegex } from './items-number-regex'

describe('itemsNumberRegex parity with poe.re GenerateNumberRegex', () => {
  it('matches upstream for every integer 0-999, both optimize flags', () => {
    for (let n = 0; n <= 999; n++) {
      const s = String(n)
      expect(itemsNumberRegex(s, false), `n=${n} optimize=false`).toBe(generateNumberRegex(s, false))
      expect(itemsNumberRegex(s, true), `n=${n} optimize=true`).toBe(generateNumberRegex(s, true))
    }
  })

  it('matches upstream for non-numeric and mixed inputs', () => {
    for (const input of ['', 'abc', '12.5', ' 42 ', '1a2', '0007', '1000', '12345']) {
      expect(itemsNumberRegex(input, false), `input=${JSON.stringify(input)}`).toBe(generateNumberRegex(input, false))
      expect(itemsNumberRegex(input, true), `input=${JSON.stringify(input)}`).toBe(generateNumberRegex(input, true))
    }
  })
})
