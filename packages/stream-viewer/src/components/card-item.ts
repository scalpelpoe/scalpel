import type { Card, SnapshotItem } from '@scalpel/stream-contract'

const cache = new WeakMap<Card, SnapshotItem>()

/** A gem or rune card as the item the tooltip renders: size, ilvl, flags, sockets and price
 *  take defaults, and there is never a price check. Memoised per card so a pin keeps its identity. */
export function cardToItem(card: Card): SnapshotItem {
  let item = cache.get(card)
  if (!item) {
    item = { ...card, w: 1, h: 1, ilvl: null, flags: {}, sockets: [], price: null }
    cache.set(card, item)
  }
  return item
}
