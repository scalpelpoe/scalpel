import type { Card } from '@scalpel/stream-contract'
import { describe, expect, it } from 'vitest'
import { cardToItem } from './card-item'

const card: Card = { name: 'Fireball', baseType: 'Fireball', rarity: 'gem', icon: 'https://x/y.webp', properties: [], requirements: [], sections: [] }

describe('cardToItem', () => {
  it('fills defaults and never carries a price check', () => {
    const item = cardToItem(card)
    expect(item).toMatchObject({ name: 'Fireball', rarity: 'gem', sockets: [], price: null, ilvl: null, flags: {} })
    expect(item.priceCheck).toBeUndefined()
  })
  it('returns the same object for the same card', () => {
    expect(cardToItem(card)).toBe(cardToItem(card))
  })
})
