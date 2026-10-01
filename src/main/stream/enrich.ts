import type { PriceCheck, SnapshotItem } from '@scalpel/stream-contract'
import type { PriceInfo } from '@shared/contracts/prices'
import type { TierDataset } from '@shared/data/tiers/types'
import type { NormalizedCharacter } from './normalize'
import type { NinjaItemData } from './sources/ninja-types'
import { applyTiers } from './tiers'

export interface EnrichDeps {
  /** Scalpel's PoE2 tier dataset; null until it has loaded. */
  tierData: TierDataset | null
  /** Unique price by name and base from Scalpel's poe.ninja economy snapshot. */
  uniquePrice: (name: string, baseType: string) => PriceInfo | undefined
  /** Precomputed viewer price check for a source item; null when it can't be price-checked. */
  priceCheck?: (raw: NinjaItemData) => PriceCheck | null
}

/** PoE2 prices in Scalpel carry exalted-equivalents in `chaosValue` (see
 *  prices.poe2.ts); show divines once an item is worth at least one. */
export function toSnapshotPrice(info: PriceInfo | undefined): SnapshotItem['price'] {
  if (!info) return null
  if (info.divineValue !== undefined && info.divineValue >= 1) {
    return { amount: Math.round(info.divineValue * 10) / 10, currency: 'divine' }
  }
  if (info.chaosValue > 0) return { amount: Math.max(1, Math.round(info.chaosValue)), currency: 'exalted' }
  return null
}

/** Layer tier badges and unique prices onto a freshly normalized character, in place. */
export function enrichCharacter(normalized: NormalizedCharacter, deps: EnrichDeps): void {
  for (const [item, raw] of normalized.sourceOf) {
    if (deps.tierData) applyTiers(item, raw, deps.tierData)
    if (item.rarity === 'unique' && item.name) item.price = toSnapshotPrice(deps.uniquePrice(item.name, item.baseType))
    if (deps.priceCheck) {
      const pc = deps.priceCheck(raw)
      if (pc) item.priceCheck = pc
    }
  }
}
