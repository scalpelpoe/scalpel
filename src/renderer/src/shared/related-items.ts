import relatedItemsPoe1 from '@shared/data/items/related-items.json'
import relatedItemsPoe2 from '@shared/data/items/related-items-poe2.json'
import { getCurrentPoeVersion } from './constants'

export interface RelatedRef {
  /** Display name. For uniques this is the unique name; for base items it's the baseType. */
  name: string
  /** Only set for uniques (matches PoE's base item name). */
  baseType?: string
  category: 'base' | 'unique' | 'divination' | 'gem' | 'beast'
}

export interface RelatedEntry {
  query: RelatedRef[]
  items: RelatedRef[]
}

function buildIndex(data: RelatedEntry[]): Map<string, RelatedEntry> {
  const m = new Map<string, RelatedEntry>()
  for (const entry of data) {
    for (const q of entry.query) m.set(q.name, entry)
  }
  return m
}

/** Per-version indexes keyed by query-ref name for O(1) lookup. PoE1 and PoE2 datasets
 *  are kept strictly separate - names like "Tabula Rasa" exist in both games but refer
 *  to different items, so a merged map would cause cross-version collisions. */
const INDEX_BY_VERSION: Record<1 | 2, Map<string, RelatedEntry>> = {
  1: buildIndex(relatedItemsPoe1 as RelatedEntry[]),
  2: buildIndex(relatedItemsPoe2 as RelatedEntry[]),
}

/**
 * Find the related-items entry triggered by an item, or null if no match.
 * Keyed by PoeItem.name (which equals unique name for uniques, baseType otherwise).
 * The version selects the dataset - PoE1 and PoE2 are kept separate so shared
 * names (e.g. "Tabula Rasa") resolve to the right game's entry and never bleed
 * across versions. It defaults to the running game (getCurrentPoeVersion) so the
 * single-arg plugin SDK surface stays version-correct without callers passing it.
 * Curated dataset only -- price-check sister shows hand-authored "related" lists,
 * not auto-derived "uniques on this base" siblings (those belong on the filter
 * page's UniquesForBase carousel).
 */
export function findRelated(itemName: string, version: 1 | 2 = getCurrentPoeVersion()): RelatedEntry | null {
  return INDEX_BY_VERSION[version].get(itemName) ?? null
}
