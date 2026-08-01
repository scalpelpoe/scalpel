/** Bestiary pack engine. Port of poe.re's Beast page (poe-vendor-string
 *  src/pages/beast/Beast.tsx `generateRegex`), plus Scalpel's pin/mute layer.
 *
 *  UPSTREAM QUIRKS PRESERVED BUG-FOR-BUG. Each has a named test in
 *  beast-engine.test.ts; "fixing" one fails the suite on purpose.
 *
 *   1. The overflow check terminates the whole pack rather than skipping the
 *      offending beast and trying the next, cheaper, possibly shorter one. The
 *      auto-pack is therefore always a contiguous top-N-by-value prefix.
 *   2. The length check runs BEFORE the min/max chaos checks, so a beast the
 *      bounds would have excluded can still end the pack by being too long.
 *   3. The accumulator starts empty and every append is `acc + '|' + regex`, so
 *      the first entry is measured as `0 + len + 1`. The leading pipe is then
 *      stripped. Net: the usable budget is `limit - 1`.
 *   4. `listingCount > 5` is upstream's anti-price-fixing guard (strictly
 *      greater). Upstream applies it at data load; we apply it here so unpriced
 *      and thin-market beasts stay visible in the UI and remain pinnable.
 *
 *  Output is plain `a|b|c` -- no quote wrapping, no anchors. */

import { sanitizeBeastState, type BeastState } from './beast-state'
import { beastRegex, type BeastRegex } from './vendor/beast/GeneratedBeastRegex'

/** A poe.ninja beast price line, normalized by the main process. */
export interface BeastPriceLine {
  name: string
  chaosValue: number
  divineValue?: number
  listingCount: number
  /** 7-day percent-change series, shaped for PriceChip's sparkline. */
  graph?: (number | null)[]
}

/** A beast row: static regex data joined with its live price. */
export interface PricedBeast {
  name: string
  regex: string
  recipe: string
  harvest: boolean
  red: boolean
  chaosValue: number
  divineValue?: number
  listingCount: number
  graph?: (number | null)[]
}

export interface BeastRegexResult {
  regex: string
  /** Names actually emitted, for row highlighting. */
  included: Set<string>
  /** Pinned names the character budget could not fit, for the warn banner. */
  droppedPins: string[]
}

/** Upstream's two budgets: the menagerie search box takes 100 characters,
 *  everything else 250. */
export function beastBudget(state: BeastState): number {
  return state.menagerieLimit ? 100 : 250
}

/** poe.ninja's economy names lag upstream's dataset across a beast rename, so an
 *  exact-name join prices the renamed beast at 0c and drops it from the pack.
 *  Keyed by the current upstream name, valued with legacy names to try in order.
 *
 *  Craicic Croaker is Craicic Chimeral renamed: upstream's row carries Chimeral's
 *  exact recipe ("Apply a Hinekora's Lock - To a Magic Item") under the new name,
 *  while poe.ninja still lists the old one at a four-figure chaos price.
 *
 *  Retire an entry once poe.ninja reports the new name; the exact-name hit wins
 *  over the alias either way, so a stale entry is inert rather than wrong. */
const PRICE_NAME_ALIASES = new Map<string, string[]>([['Craicic Croaker', ['Craicic Chimeral']]])

function findAliasedPrice(byName: Map<string, BeastPriceLine>, name: string): BeastPriceLine | undefined {
  for (const legacy of PRICE_NAME_ALIASES.get(name) ?? []) {
    const hit = byName.get(legacy)
    if (hit) return hit
  }
  return undefined
}

/** Join the static dataset against live prices by exact name. Returns every
 *  beast -- unpriced and thin-market ones included -- so the UI can list them
 *  and the user can pin them. All pack filtering happens in buildBeastRegex.
 *
 *  Sorted by chaos descending, ties by name ascending. The tie-break is explicit
 *  rather than leaning on Array.sort stability plus upstream keeping its source
 *  array alphabetical. */
export function buildBeastRows(data: BeastRegex[], prices: BeastPriceLine[]): PricedBeast[] {
  const byName = new Map(prices.map((p) => [p.name, p]))
  return data
    .map((b) => {
      const p = byName.get(b.beast) ?? findAliasedPrice(byName, b.beast)
      return {
        name: b.beast,
        regex: b.regex,
        recipe: b.recipe,
        harvest: b.harvest,
        red: b.red,
        chaosValue: p?.chaosValue ?? 0,
        divineValue: p?.divineValue,
        listingCount: p?.listingCount ?? 0,
        graph: p?.graph,
      }
    })
    .sort((a, b) => b.chaosValue - a.chaosValue || a.name.localeCompare(b.name))
}

export function buildBeastRegex(rows: PricedBeast[], state: BeastState): BeastRegexResult {
  const pinned = new Set(state.pinned)
  const muted = new Set(state.muted)
  const limit = beastBudget(state)
  const included = new Set<string>()
  const droppedPins: string[] = []

  let acc = ''
  // Quirk 3: the '+ 1' is the pipe that substring(1) strips at the end.
  const fits = (fragment: string): boolean => acc.length + fragment.length + 1 <= limit
  const append = (row: PricedBeast): void => {
    acc += `|${row.regex}`
    included.add(row.name)
  }

  // Pins first, in price order, bypassing every filter. A pin that does not fit
  // is reported but does not stop the remaining (possibly shorter) pins -- unlike
  // the auto-pack below, where the early stop is upstream behaviour we keep.
  for (const row of rows) {
    if (!pinned.has(row.name)) continue
    if (!fits(row.regex)) {
      droppedPins.push(row.name)
      continue
    }
    append(row)
  }

  // Auto-pack: upstream generateRegex, filter order intact.
  for (const row of rows) {
    if (pinned.has(row.name) || muted.has(row.name)) continue
    if (state.redOnly && !row.red) continue
    if (row.chaosValue <= 0) continue
    if (row.listingCount <= 5) continue
    if (!state.includeHarvest && row.harvest) continue
    if (!fits(row.regex)) break // quirk 1 + quirk 2
    if (row.chaosValue > (state.maxChaos ?? 9999999)) continue
    if (row.chaosValue < (state.minChaos ?? 0)) continue
    append(row)
  }

  return { regex: acc.substring(1), included, droppedPins }
}

/** Re-derive a saved Beasts preset's regex against a fresh price snapshot.
 *
 *  This is the whole reason a Beasts preset stores settings instead of a regex:
 *  the pack is only meaningful against the economy it was priced from, so a
 *  hotkey bound three weeks ago should still paste today's valuable beasts.
 *  Convenience wrapper that bakes in the bundled dataset; buildBeastRows still
 *  takes its data as a parameter so tests can drive it with fixtures. */
export function deriveBeastPresetRegex(preset: { beast?: BeastState }, lines: BeastPriceLine[]): string {
  return buildBeastRegex(buildBeastRows(beastRegex, lines), sanitizeBeastState(preset.beast)).regex
}
