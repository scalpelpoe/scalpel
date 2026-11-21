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
    const out = buildQualifierRegex({ quantity: 70 })
    expect(out).toBe('"as d.*([7-9].|\\d..)%"')
  })

  it('joins multiple qualifier tokens with spaces in QUALIFIERS declaration order', () => {
    const out = buildQualifierRegex({ packsize: 30, quantity: 70 })
    // General group order is quantity first, packsize second, so quantity's token
    // comes before packsize's regardless of the input-object key order.
    const tokens = out.match(/"[^"]*"/g) ?? []
    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toContain('as d') // quantity keyword
    expect(tokens[1]).toContain('r pa') // packsize keyword
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

  // 3.30 map tooltip lines (wording from poe.re's OptimizedMapOutput.test.ts). Each keyword
  // must hit its own line and no other, or a qualifier silently accepts an unrelated stat.
  const TOOLTIP: Record<string, string> = {
    quantity: 'Atlas Drops: +45% (augmented)',
    packsize: 'Monster Pack Size: +45% (augmented)',
    morecurrency: 'More Currency: +45% (augmented)',
    morescarabs: 'More Threads: +45% (augmented)',
    moremaps: 'More Maps: +45% (augmented)',
    rarity: 'Item Rarity: +45% (augmented)',
    quality: 'Quality (Quantity): +45% (augmented)',
    quality_packsize: 'Quality (Pack Size): +45% (augmented)',
    quality_rarity: 'Quality (Rarity): +45% (augmented)',
    quality_currency: 'Quality (Currency): +45% (augmented)',
    quality_divination: 'Quality (Divination Cards): +45% (augmented)',
    quality_scarab: 'Quality (Threads): +45% (augmented)',
  }
  const OTHER_LINES = ['Item Quantity: +45% (augmented)', 'Threads: 45%', 'More Divination Cards: +45% (augmented)']

  it.each(QUALIFIERS.map((q) => q.id))('%s matches only its own 3.30 tooltip line', (id) => {
    const re = new RegExp(buildQualifierRegex({ [id]: 40 }).slice(1, -1), 'i')
    for (const [otherId, line] of Object.entries(TOOLTIP)) {
      expect(re.test(line), `${id} vs ${otherId}: ${line}`).toBe(otherId === id)
    }
    for (const line of OTHER_LINES) expect(re.test(line), `${id} vs ${line}`).toBe(false)
  })
})
