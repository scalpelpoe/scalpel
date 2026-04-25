import relatedItemsData from '../../../shared/data/items/related-items.json'

export interface RelatedRef {
  /** Display name. For uniques this is the unique name; for base items it's the baseType. */
  name: string
  /** Only set for uniques (matches PoE's base item name). */
  baseType?: string
  category: 'base' | 'unique' | 'divination' | 'gem' | 'beast'
}

interface RelatedEntry {
  query: RelatedRef[]
  items: RelatedRef[]
}

const DATA = relatedItemsData as RelatedEntry[]

/** Index keyed by the name of any query ref so lookup is O(1). Unique and base names
 *  don't collide in PoE, so a single flat map is safe. */
const BY_QUERY_NAME: Map<string, RelatedEntry> = (() => {
  const m = new Map<string, RelatedEntry>()
  for (const entry of DATA) {
    for (const q of entry.query) m.set(q.name, entry)
  }
  return m
})()

/**
 * Find the related-items entry triggered by an item, or null if no match.
 * Keyed by PoeItem.name (which equals unique name for uniques, baseType otherwise).
 */
export function findRelated(itemName: string): RelatedEntry | null {
  return BY_QUERY_NAME.get(itemName) ?? null
}
