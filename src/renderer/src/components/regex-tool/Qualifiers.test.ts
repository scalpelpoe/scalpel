import { describe, it, expect } from 'vitest'
import { buildQualifierRegex, QUALIFIERS } from './Qualifiers'

describe('buildQualifierRegex', () => {
  it('returns an empty string when no qualifiers are set', () => {
    expect(buildQualifierRegex({})).toBe('')
  })

  it('skips qualifiers with null or non-positive values', () => {
    expect(buildQualifierRegex({ quantity: null, packsize: 0, rarity: -5 })).toBe('')
  })

  it('emits a single "keyword.*atLeastRegex(N)suffix" token for one qualifier', () => {
    // quantity -> keyword "m q", suffix "%". 70 -> atLeastRegex yields ([7-9].|...).
    const out = buildQualifierRegex({ quantity: 70 })
    expect(out).toBe('"m q.*([7-9].|...)%"')
  })

  it('joins multiple qualifier tokens with spaces in QUALIFIERS declaration order', () => {
    const out = buildQualifierRegex({ packsize: 30, quantity: 70 })
    // General group order is quantity first, packsize second, so quantity's token
    // comes before packsize's regardless of the input-object key order.
    const tokens = out.match(/"[^"]*"/g) ?? []
    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toContain('m q') // quantity keyword
    expect(tokens[1]).toContain('iz') // packsize keyword
  })

  it('honors the suffix on each qualifier (all current ones use "%")', () => {
    const out = buildQualifierRegex({ morecurrency: 50 })
    expect(out.endsWith('%"')).toBe(true)
  })

  it('embeds atLeastRegex output -- number matching behavior is delegated', () => {
    // Trust number-regex.test for precision; here just verify integration.
    const atOne = buildQualifierRegex({ quantity: 1 })
    const atHundred = buildQualifierRegex({ quantity: 100 })
    expect(atOne).toContain('[1-9]\\d*')
    expect(atHundred).toContain('[1-9]..')
  })

  it('every exported qualifier has a keyword + suffix so buildQualifierRegex can compose them', () => {
    // Guardrail: if someone adds a new qualifier and forgets a field, we'd silently
    // emit malformed tokens. Catch that at test time.
    for (const q of QUALIFIERS) {
      expect(q.keyword, `${q.id} keyword`).toBeTruthy()
      expect(q.suffix, `${q.id} suffix`).toBeDefined()
      expect(q.id, 'qualifier id').toBeTruthy()
    }
  })
})
