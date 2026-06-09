import type { ModTier, TierDataset, TierLadder, TierStat } from './types'

type CompactMod = TierDataset['mods'][number]

/** RePoE stores some stats in internal units the game renders scaled. `_permyriad`
 *  stats (per-10,000, e.g. leech) display as a percentage = value / 100. Tier matching
 *  and the scrub range work in the displayed value-space, so normalize raw stats here.
 *  Other internal-unit suffixes can be added if they surface. */
function displayDivisor(id: string): number {
  return id.endsWith('_permyriad') ? 100 : 1
}

/** Sort key for a [min,max] pair so two stat sets can be compared order-independently.
 *  The sort exists only to make the key stable regardless of advRanges ordering;
 *  we compare exact stat pairs so lexical vs numeric sort is irrelevant - identical
 *  pair-sets always produce identical keys. */
function pairKey(pairs: Array<[number, number]>): string {
  return pairs
    .map(([a, b]) => `${a}:${b}`)
    .sort()
    .join('|')
}

/** Collapse a mod's raw stats into the row's value-space. */
export function computeTierRange(
  stats: Array<[string, number, number]>,
  aggregated: boolean,
): { min: number; max: number } {
  if (stats.length === 1) {
    const [id, lo, hi] = stats[0]
    const d = displayDivisor(id)
    return { min: lo / d, max: hi / d }
  }
  const min = stats.reduce((s, [id, lo]) => s + lo / displayDivisor(id), 0) / stats.length
  const max = stats.reduce((s, [id, , hi]) => s + hi / displayDivisor(id), 0) / stats.length
  void aggregated // caller guarantees aggregated when stats.length > 1
  return { min, max }
}

function toStat([id, min, max]: [string, number, number]): TierStat {
  return { id, min, max }
}

/**
 * Resolve the full tier ladder for the affix that rolled `advRanges` (its current
 * per-stat roll ranges) at in-game tier `advTier` on `baseType`. Matches the group
 * by stat-range equality (locale-independent), so it works for non-English clients.
 * Returns null for unknown base, no match, or a hybrid (non-aggregated multi-stat) mod.
 */
export function resolveTierLadder(
  data: TierDataset,
  baseType: string,
  advRanges: Array<{ min: number; max: number }>,
  advTier: number,
  aggregated: boolean,
  advName?: string,
): TierLadder | null {
  const poolIdx = data.bases[baseType]
  if (poolIdx == null) return null
  const groups = data.pools[poolIdx]
  if (!groups) return null
  const target = pairKey(advRanges.map((r) => [r.min, r.max]))

  for (const [group, idxList] of Object.entries(groups)) {
    let matchedAsc = -1
    for (let i = 0; i < idxList.length; i++) {
      const m: CompactMod = data.mods[idxList[i]]
      if (pairKey(m.s.map(([id, lo, hi]) => [lo / displayDivisor(id), hi / displayDivisor(id)])) === target) {
        // If multiple tiers share identical ranges, prefer a name match when given.
        if (matchedAsc === -1 || (advName && m.n === advName)) matchedAsc = i
      }
    }
    if (matchedAsc === -1) continue

    const matched: CompactMod = data.mods[idxList[matchedAsc]]
    if (matched.s.length > 1 && !aggregated) return null // hybrid mod, not scrubbable

    const tiers: ModTier[] = idxList.map((idx, asc) => {
      const m: CompactMod = data.mods[idx]
      return {
        tier: advTier + (matchedAsc - asc),
        name: m.n,
        ilvl: m.l,
        stats: m.s.map(toStat),
        range: computeTierRange(m.s, aggregated),
        text: m.t,
      }
    })
    return { group, scrubbable: true, tiers }
  }
  return null
}

/** The tier a given value falls into: the highest tier whose range.min <= value
 *  (clamps to the lowest tier below the floor). `tiers` ascending by value. */
export function valueToTier(tiers: ModTier[], value: number): ModTier {
  let chosen = tiers[0]
  for (const t of tiers) {
    if (value >= t.range.min) chosen = t
  }
  return chosen
}
