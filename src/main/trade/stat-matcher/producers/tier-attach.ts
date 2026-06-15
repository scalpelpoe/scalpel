import { getTierData } from '@main/tier-data'
import { resolveTierLadder } from '@shared/data/tiers/resolve'
import type { ModTier } from '@shared/data/tiers/types'

/** Resolve a tier ladder for a matched affix, or undefined when not applicable
 *  (no data, Unique item, unknown base, no match, or hybrid multi-stat mod).
 *
 *  The advanced-mod bracket Scalpel parses is the UNMODIFIED roll range (RePoE's
 *  stored range), even on quality-increased mods - the in-game clipboard reports
 *  the base range and base value, and Scalpel scales the displayed value up by
 *  the quality multiplier separately. So matching uses the raw ranges directly;
 *  the multiplier only affects the renderer's modified-space search input (it
 *  rides to the renderer as StatFilter.tierQualityMult, not through here). */
export function attachTierLadder(args: {
  baseType: string | undefined
  ranges: Array<{ value: number; min: number; max: number }> | undefined
  /** The matched literal value, used for fixed-value (rangeless) mods. */
  value?: number | null
  tier: number | undefined
  aggregated: boolean
  rarity: string | undefined
  name?: string
}): ModTier[] | undefined {
  const { baseType, ranges, value, tier, aggregated, rarity, name } = args
  if (rarity === 'Unique') return undefined
  if (!baseType || tier == null) return undefined
  const data = getTierData()
  if (!data) return undefined
  // Rolled mods carry per-stat ranges from the clipboard bracket. Fixed-value mods
  // (e.g. "30% increased Movement Speed", "+2 to Level of all Projectile Skills")
  // print no bracket, so match on the literal value against the tier whose stat is
  // a fixed point (min === max === value).
  const matchRanges =
    ranges && ranges.length > 0
      ? ranges.map((r) => ({ min: r.min, max: r.max }))
      : value != null
        ? [{ min: value, max: value }]
        : null
  if (!matchRanges) return undefined
  const ladder = resolveTierLadder(data, baseType, matchRanges, tier, aggregated, name)
  return ladder?.scrubbable ? ladder.tiers : undefined
}
