import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PriceCheck } from '@scalpel/stream-contract'
import { describe, expect, it } from 'vitest'
import { enrichCharacter } from './enrich'
import { normalizeCharacter } from './normalize'
import { NinjaCharacterSchema } from './sources/ninja-types'

const character = NinjaCharacterSchema.parse(
  JSON.parse(readFileSync(resolve(__dirname, '__fixtures__/ninja-character.json'), 'utf8')),
)
const normalize = () =>
  normalizeCharacter(character, { now: new Date('2026-09-29T12:00:00Z'), hideCharacterName: false })
const pc: PriceCheck = { league: 'Standard', body: { query: {}, sort: { price: 'asc' } }, rows: [] }

describe('enrichCharacter priceCheck', () => {
  it('attaches the dep result where non-null and leaves the field absent where null', () => {
    const n = normalize()
    const raws = [...n.sourceOf.values()]
    const skip = raws[0]
    enrichCharacter(n, {
      tierData: null,
      uniquePrice: () => undefined,
      priceCheck: (raw) => (raw === skip ? null : pc),
    })
    for (const [item, raw] of n.sourceOf) {
      if (raw === skip) expect('priceCheck' in item).toBe(false)
      else expect(item.priceCheck).toEqual(pc)
    }
  })

  it('does nothing without the dep', () => {
    const n = normalize()
    enrichCharacter(n, { tierData: null, uniquePrice: () => undefined })
    for (const [item] of n.sourceOf) expect(item.priceCheck).toBeUndefined()
  })
})
