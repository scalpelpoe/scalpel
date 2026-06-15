import { getPoeVersion } from '@main/game-state'
import { isPremiumMod } from './premium'
import { attachTierLadder } from './tier-attach'
import { BENEFICIAL_NEGATIVE_KEYWORDS } from '@shared/data/trade/beneficial-negatives'
import { isClusterJewel } from '@shared/poe-item'
import type { ModTier } from '@shared/data/tiers/types'
import type { StatFilter } from '../../trade'
import { findAdvMod } from '../adv-mods'
import { computeValueBounds } from '../bounds'
import { isDefenseMod, isLocalMod, isLowPriority } from '../classification'
import type { MatchContext } from '../context'
import { matchModToStat } from '../mod-matcher'
import { accumulatePseudo, PSEUDO_CONTRIBUTIONS, type PseudoContribution } from '../pseudo'

// Gem-level gear mods are discrete brackets where +2 listings are far pricier
// than +1. An open-ended min would lump the item with more expensive listings;
// without advanced-mod data a +1 roll also floors to 0 (floor(1*0.9)).
// Pin min=max=value for any mod whose cleaned text starts with "+N to Level of".
export const GEM_LEVEL_MOD = /^\+\d+ to Level of /i

// Tinctures: disambiguate duplicate stat texts (e.g. "#% increased effect" has two stat IDs)
const TINCTURE_STAT_REMAP: Record<string, string> = {
  'explicit.stat_2448920197': 'explicit.stat_3529940209', // "#% increased effect" -> tincture-specific variant
}

// Item class -> the trailing trade-stat qualifier its mods should prefer. The trade
// API tags otherwise-identical display text (e.g. "#% increased Duration") with
// "(Charm)"/"(Flask)"/"(Jewel)" to disambiguate; the clipboard carries only the bare
// text, so we tell the matcher which qualified variant to pick (issue #397).
const QUALIFIER_BY_ITEM_CLASS: Record<string, string> = {
  Charms: 'Charm',
  Flasks: 'Flask',
  Jewels: 'Jewel',
}

// Rarity is an important PoE2 mod that should default on, so it overrides the
// low-priority default there (see classification.ts LOW_PRIORITY_PATTERNS).
const RARITY_MOD = /rarity of items found/i

// Off by default when a roll is this many tiers (or more) below the best tier the
// item's ilvl could roll. Raise to be more lenient, lower to be stricter.
const LOW_TIER_GAP = 2

/** Tier-aware adjustment to a row's default-enabled state. Caller passes the
 *  baseline `enabled` for an ordinary (non-structural, non-forced) explicit row.
 *  - Low-tier-off: if a tierLadder + itemLevel are known, the row is turned off
 *    when its tier is LOW_TIER_GAP+ below the best tier achievable at that ilvl.
 *  - T1-on: a T1 roll is always on (overrides the quality default).
 *  No ladder / no ilvl / no tier -> low-tier rule skipped. */
export function resolveTierDefault(args: {
  baseEnabled: boolean
  matchedTier: number | undefined
  tierLadder: ModTier[] | undefined
  itemLevel: number | undefined
}): boolean {
  const { baseEnabled, matchedTier, tierLadder, itemLevel } = args
  let enabled = baseEnabled
  if (enabled && matchedTier != null && tierLadder && itemLevel != null) {
    const achievable = tierLadder.filter((t) => t.ilvl <= itemLevel)
    if (achievable.length > 0) {
      const bestTier = Math.min(...achievable.map((t) => t.tier))
      if (matchedTier - bestTier >= LOW_TIER_GAP) enabled = false
    }
  }
  if (matchedTier === 1) enabled = true
  return enabled
}

/** Merge rows that share the same stat id by summing their values.
 *  The trade index collapses duplicate explicit rolls (e.g. two "Rarity of Items found"
 *  prefix+suffix) into a single magnitude, so emitting two separate rows produces wrong
 *  price-check results. Single-id groups pass through unchanged.
 *  Merged rows occupy the position of the first occurrence in the output. */
function mergeDuplicateStats(rows: StatFilter[], pct: number): StatFilter[] {
  // Map preserves insertion order, so grouping and then emitting map.values()
  // keeps each merged row at its group's first-seen position.
  const groups = new Map<string, StatFilter[]>()
  for (const row of rows) {
    const existing = groups.get(row.id)
    if (existing) existing.push(row)
    else groups.set(row.id, [row])
  }

  const result: StatFilter[] = []
  for (const group of groups.values()) {
    const first = group[0]
    if (group.length === 1) {
      result.push(first)
      continue
    }
    // Sum values, recompute min/max from the summed value rather than the partial mins
    const allNull = group.every((r) => r.value == null)
    const sum = allNull ? null : group.reduce((acc, r) => acc + (r.value ?? 0), 0)
    let mergedMin: number | null
    if (sum == null) mergedMin = null
    else if (sum >= 0) mergedMin = Math.floor(sum * pct)
    else mergedMin = Math.ceil(sum * (2 - pct))
    // Pinned exact rows (min=max=value per-row) must stay exact through the merge.
    if (sum != null && group.every((r) => r.value != null && r.min === r.value && r.max === r.value)) {
      mergedMin = sum
    }
    const nonNullMaxes = group.map((r) => r.max).filter((m): m is number => m != null)
    const mergedMax = nonNullMaxes.length > 0 ? nonNullMaxes.reduce((a, b) => a + b, 0) : null
    // text is display-only (the query uses value/min/max). The matcher parses the
    // value from the first number in the text, so replacing the first occurrence of
    // the old value reliably hits that number.
    let mergedText = first.text
    if (first.value != null && sum != null) {
      mergedText = first.text.replace(String(Math.abs(first.value)), String(Math.abs(sum)))
    }
    result.push({
      ...first,
      value: sum,
      min: mergedMin,
      max: mergedMax,
      enabled: group.some((r) => r.enabled === true),
      text: mergedText,
      modTier: undefined,
      modRange: undefined,
      tierLadder: undefined,
      perfectRoll: undefined,
      tierQualityMult: undefined,
    })
  }
  return result
}

/** Collapse the junk rows produced when a single stat wraps across multiple
 *  clipboard lines. clipboard.ts emits each physical line AND the joined whole
 *  for multi-line advanced mods; the grammatical fragments ("...type among",
 *  "your Ailments on them") are a prefix/suffix of the trade stat text, so the
 *  substring fallback in mod-matcher resolves them to the SAME stat id as the
 *  joined row but with a null value. The joined row carries the real value, so a
 *  same-id sibling with a null value (and no option) is always that artifact --
 *  drop it. Genuine hybrid mods are unaffected: their lines match DIFFERENT stat
 *  ids, so no value-bearing sibling shares the fragment's id. */
export function dropFragmentDuplicates(rows: StatFilter[]): StatFilter[] {
  const idsWithValue = new Set(rows.filter((r) => r.value != null).map((r) => r.id))
  return rows.filter((r) => r.value != null || r.option != null || !idsWithValue.has(r.id))
}

export function processExplicits(ctx: MatchContext): StatFilter[] {
  const {
    explicits,
    itemInfo,
    advancedMods,
    isWeapon,
    hasLocalMods,
    isGemItem,
    isTimelessJewel,
    hasDefenses,
    pct,
    pseudoAccumulator,
    isRelic,
    isTablet,
  } = ctx
  const out: StatFilter[] = []
  // PoE2's trade API has no crafted.* stat category - crafted mods are queried as
  // explicit.* like any other affix. They also aren't trivially re-rolled the way PoE1
  // bench crafts are, so they're enabled by default. The crafted flag still drives the
  // display color; only trade matching/enablement diverge.
  const isPoe2 = getPoeVersion() === 2

  // Track which pseudos have at least one real (non-attribute-derived) contributor on this
  // item, so the post-loop pass can decide whether to activate deferred attribute contributions.
  const pseudosWithRealContributor = new Set<string>()
  // Attribute mods (Str -> Life, Int -> Mana) are deferred until the full loop completes so
  // we can check whether their target pseudo has a real contributor before folding them in.
  const deferredAttr: Array<{ row: StatFilter; contributions: PseudoContribution[]; value: number; forced: boolean }> =
    []

  // Relic affixes are matched against the sanctum.* stat list by buildRelicFilters;
  // tablet affixes by buildTabletFilters (clipboard phrasing differs from trade text).
  // Running either through the explicit matcher risks false or missing matches.
  for (const mod of isGemItem || isRelic || isTablet ? [] : explicits) {
    let isCrafted = /\s*\(crafted\)\s*$/i.test(mod)
    let cleaned = mod.replace(/\s*\(crafted\)\s*$/i, '').trim()
    // Skip timeless jewel mods handled by the timeless chip system
    if (
      isTimelessJewel &&
      (/Passives in radius are Conquered/i.test(cleaned) ||
        /^Historic$/i.test(cleaned) ||
        /Commanded|Commissioned|Carved|Bathed|Denoted|Remembrancing/i.test(cleaned))
    )
      continue
    // Detect crafted/fractured/foulborn from advanced mod data BEFORE matching, so
    // crafted mods (like "Trigger a Socketed Spell when you Use a Skill") are queried
    // against the crafted.* stat list instead of explicit.* -- matching the wrong list
    // fails silently and the mod disappears from the price checker.
    let isFractured = false
    let isFoulborn = false
    let isRandomSupport = false
    let advMod: ReturnType<typeof findAdvMod>
    if (advancedMods) {
      advMod = findAdvMod(advancedMods, cleaned, 'explicit')
      if (advMod?.fractured) isFractured = true
      if (advMod?.foulborn) isFoulborn = true
      if (advMod?.crafted) isCrafted = true
      if (advMod?.randomSupport) isRandomSupport = true
    }
    const useLocal = hasLocalMods && isLocalMod(cleaned, isWeapon)
    // Trade stats that share display text across item categories carry a trailing
    // qualifier ("#% increased Duration (Charm)" / "(Flask)", jewel-only globals as
    // "(Jewel)"). Pass the item's category so the matcher picks the right variant.
    const preferQualifier = QUALIFIER_BY_ITEM_CLASS[itemInfo?.itemClass ?? ''] ?? null
    // In PoE2 a crafted mod trades as an explicit (no crafted.* stats exist).
    const craftedForTrade = isCrafted && !isPoe2
    const matched = matchModToStat(
      cleaned,
      useLocal,
      craftedForTrade ? 'crafted' : 'explicit',
      isRandomSupport,
      preferQualifier,
    )
    if (matched) {
      const lowPriority = isLowPriority(cleaned) && !(isPoe2 && RARITY_MOD.test(cleaned))

      if (advancedMods && advMod) {
        // Apply magnitude multiplier from implicit (e.g. Cogwork Ring "25% increased Suffix Modifier magnitudes")
        if (advMod?.magnitudeMultiplier && matched.value != null) {
          const oldVal = matched.value
          matched.value = Math.trunc(oldVal * advMod.magnitudeMultiplier)
          // Update the display text to show the multiplied value
          cleaned = cleaned.replace(String(Math.abs(oldVal)), String(Math.abs(matched.value)))
        }
      }

      if (itemInfo?.itemClass === 'Tinctures' && TINCTURE_STAT_REMAP[matched.statId]) {
        matched.statId = TINCTURE_STAT_REMAP[matched.statId]
      }

      // Determine if this value is fixed or rolled, and capture tier/range for display
      // Fixed values (min === max in tier range, or no range) use exact match
      // Rolled values use percentage-based min
      let isFixedValue = false
      let matchedTier: number | undefined
      let matchedRange: { min: number; max: number } | undefined
      let advModRanges: Array<{ value: number; min: number; max: number }> | undefined
      let advModName: string | undefined
      let advModMult: number | undefined
      // A unique mod rolled at or above its best possible value. Ranged mods are "perfect"
      // at the max and "over-rolled" (Vaal/corruption) above it; a fixed singular-value mod
      // is special only when over-rolled strictly above its single value. Drives the
      // price-check default-enable for uniques (issue #378). Uses the normalized range
      // (see normRange below) so detrimental rolls on a sign-flipped reduced bracket are
      // NOT mistaken for perfect.
      let perfectRoll = false
      if (advancedMods && matched.value != null) {
        const rawCleaned = mod.replace(/\s*\(crafted\)\s*$/i, '').trim()
        const advMod = findAdvMod(advancedMods, cleaned, 'explicit', rawCleaned)
        if (advMod) {
          const range = advMod.ranges.find((r) => r.value === matched.value || r.value === -(matched.value ?? 0))
          // When the mod matched only via sign inversion (clipboard "fewer N" / "reduced N"
          // against the trade API's positive "additional" / "increased" stat, value negated
          // to -N), the advanced-mod range is still in clipboard space (positive) while
          // matched.value is negative. Flip the range into the matched value's sign space so
          // every downstream consumer (modRange display + tint, unique min-floor) agrees on
          // sign -- otherwise the negative roll reads as outside its own range and tints red
          // (Constricting Command "fewer enemies Surrounded"). A symmetric bracket that
          // already straddles zero is unaffected (the flip is a normalization no-op).
          const inverted =
            range != null && matched.value != null && range.value === -matched.value && range.value !== matched.value
          const signedRange = inverted ? { min: -range!.min, max: -range!.max } : range
          // "reduced" mods report a sign-flipped bracket ({min:20, max:-20}); normalize so
          // min<=max before any consumer reads it (matchedRange -> modRange display+tint, the
          // unique min-floor below, perfectRoll). advModRanges keeps the raw orientation for
          // tier-ladder matching against RePoE's stored ranges.
          const normRange = signedRange
            ? { min: Math.min(signedRange.min, signedRange.max), max: Math.max(signedRange.min, signedRange.max) }
            : null
          if (normRange && normRange.min === normRange.max) isFixedValue = true
          if (!range && advMod.ranges.length === 0) isFixedValue = true
          if (advMod.tier > 0) matchedTier = advMod.tier
          if (normRange && normRange.min !== normRange.max) matchedRange = { min: normRange.min, max: normRange.max }
          if (normRange && itemInfo?.rarity === 'Unique' && matched.value != null) {
            perfectRoll =
              normRange.min === normRange.max ? matched.value > normRange.max : matched.value >= normRange.max
          }
          // Capture the full per-stat ranges and mod name for tier-ladder resolution.
          advModRanges = advMod.ranges
          advModName = advMod.name
          advModMult = advMod.magnitudeMultiplier
        }
      }
      // For negative values: "reduced" mods use min (trade API expects min for beneficial reduction),
      // while truly negative mods (e.g. "-50% to Lightning Resistance") use max. Some keywords mark
      // the negative as beneficial (more negative = better, use max). Shared with buildTabletFilters.
      const isNegative = matched.value != null && matched.value < 0
      const isBeneficialNegative = isNegative && BENEFICIAL_NEGATIVE_KEYWORDS.some((p) => p.test(mod))
      const bounds = computeValueBounds({ value: matched.value, pct, isBeneficialNegative, isFixedValue })
      let minValue = bounds.min
      // For uniques, don't default below the mod's minimum possible roll unless the item's actual
      // value is already below it (e.g. from Volatile Vaal Orb)
      if (
        minValue != null &&
        itemInfo?.rarity === 'Unique' &&
        matchedRange &&
        matched.value != null &&
        matched.value >= matchedRange.min &&
        minValue < matchedRange.min
      ) {
        minValue = matchedRange.min
      }
      let maxValue = bounds.max

      // Skip for cluster jewels -- their mods grant passives, not item stats
      // Skip "X per Y" mods -- they're conditional and shouldn't inflate pseudo totals
      const isPerMod = /\bper\b/i.test(cleaned)
      const isCluster = itemInfo ? isClusterJewel(itemInfo) : false
      const pseudoList = isCluster || isPerMod ? undefined : PSEUDO_CONTRIBUTIONS[matched.statId]
      // Split contributions: real (non-attribute-derived) ones are processed immediately;
      // attribute-derived ones (Str -> Life, Int -> Mana) are deferred until post-loop.
      const realContribs = pseudoList?.filter((c) => !c.attributeDerived)
      const attrContribs = pseudoList?.filter((c) => c.attributeDerived)
      // Only real (non-attribute) contributions decide suppression up front; attribute
      // contributions are deferred until we know whether their pseudo has a real contributor.
      const suppressesSourceRow = realContribs != null && realContribs.some((c) => !c.keepSourceRow)
      if (realContribs && realContribs.length > 0 && matched.value != null) {
        accumulatePseudo(pseudoAccumulator, realContribs, matched.value, isWeapon)
        for (const c of realContribs) pseudosWithRealContributor.add(c.pseudoId)
      }

      // Hybrid companion detection: if this mod shares an advanced mod block with a
      // "Socketed Gems are Supported by" line but ISN'T the socketed gem line itself,
      // it's the less important hybrid bonus and should be off by default
      let isHybridCompanion = false
      if (advancedMods && !/^Socketed Gems are Supported by/i.test(cleaned)) {
        const parentMod = advancedMods.find(
          (am) =>
            am.type !== 'implicit' &&
            am.lines.some((l) => /Socketed Gems are Supported by/i.test(l)) &&
            am.lines.some((l) => {
              const s = l
                .replace(/(-?\d+(?:\.\d+)?)\(-?\d+(?:\.\d+)?--?\d+(?:\.\d+)?\)/g, '$1')
                .replace(/([a-zA-Z]\w*)\s*\([^)]*\)/g, '$1')
                .replace(/\s*[—–-]+\s*Unscalable Value$/i, '')
                .trim()
              return s === cleaned
            }),
        )
        if (parentMod) isHybridCompanion = true
      }

      // Remap stat ID prefix based on mod source (fractured/crafted). Deferred
      // until after the pseudo accumulation above so PSEUDO_CONTRIBUTIONS (keyed
      // by explicit.* IDs) still hits for fractured/crafted mods -- they
      // otherwise contribute to total ele res / total life same as a regular roll.
      if (isFractured && matched.statId.startsWith('explicit.')) {
        matched.statId = `fractured.${matched.statId.split('.').slice(1).join('.')}`
      } else if (craftedForTrade && matched.statId.startsWith('explicit.')) {
        matched.statId = `crafted.${matched.statId.split('.').slice(1).join('.')}`
      }

      const tierLadder = attachTierLadder({
        baseType: itemInfo?.baseType,
        ranges: advModRanges,
        value: matched.value,
        tier: matchedTier,
        aggregated: matched.aggregated ?? false,
        rarity: itemInfo?.rarity,
        name: advModName,
      })
      // T1 rolls: search the whole T1 bracket (its low value), not just this specific
      // roll, so the search matches any T1 item regardless of where in the bracket it
      // landed. Only when we have a ladder; negative mods keep their own min semantics.
      if (matchedTier === 1 && minValue != null && !isNegative && tierLadder) {
        const t1 = tierLadder.find((t) => t.tier === 1)
        if (t1) minValue = Math.floor(t1.range.min)
      }
      // Gem-level mods: pin min=max=rolled value. The +level brackets are discrete
      // (a +2 item costs far more than a +1), so an open-ended min merges the item
      // with strictly-better pricier listings. Placed after T1 widening so T1 logic
      // cannot undo the exact pin.
      if (GEM_LEVEL_MOD.test(cleaned) && matched.value != null) {
        minValue = matched.value
        maxValue = matched.value
      }
      const structurallyOff =
        craftedForTrade ||
        suppressesSourceRow ||
        isHybridCompanion ||
        (hasDefenses && isDefenseMod(cleaned)) ||
        useLocal ||
        itemInfo?.itemClass === 'Maps' ||
        // PoE2 waystone prefix/suffix affixes are monster-difficulty mods, not price
        // drivers -- default them off like PoE1 maps. The yield chips (tier, pack size,
        // rarity, magic/rare monsters) come from buildMapFilters (type 'map'), so they
        // are unaffected and keep their own enabled-by-default state.
        itemInfo?.itemClass === 'Waystones'
      const forcedOn = isFractured || isFoulborn
      // A detrimental negative roll (value < 0 and not a beneficial negative like
      // "reduced mana cost") is a downside, not a reason to buy. Default it off,
      // overriding the ordinary / low-priority / PoE2-rarity-on reasons. Premium and
      // fractured/foulborn still surface it.
      const isDetrimental = isNegative && !isBeneficialNegative
      const baseEnabled = forcedOn || (!lowPriority && !structurallyOff && !isDetrimental)
      const isPremium = isPremiumMod(itemInfo, matched.statId)
      const enabledFinal =
        isPremium ||
        (forcedOn || structurallyOff || isDetrimental
          ? baseEnabled
          : resolveTierDefault({
              baseEnabled,
              matchedTier,
              tierLadder,
              itemLevel: itemInfo?.itemLevel,
            }))
      out.push({
        id: matched.statId,
        text: isFractured ? `${cleaned} (Fractured)` : cleaned,
        value: matched.value,
        min: minValue,
        max: maxValue,
        enabled: enabledFinal,
        type: isFractured ? 'fractured' : isCrafted ? 'crafted' : 'explicit',
        option: matched.option,
        aggregated: matched.aggregated,
        foulborn: isFoulborn || undefined,
        perfectRoll: perfectRoll || undefined,
        premium: isPremium || undefined,
        modTier: matchedTier,
        modRange: matchedRange,
        tierLadder,
        tierQualityMult: advModMult,
        fixedRoll: isFixedValue || undefined,
      })
      // Defer attribute contributions (Str -> Life, Int -> Mana) until post-loop so we
      // can check whether their target pseudo has a real contributor on this item.
      if (attrContribs && attrContribs.length > 0 && matched.value != null) {
        deferredAttr.push({
          row: out[out.length - 1],
          contributions: attrContribs,
          value: matched.value,
          forced: forcedOn,
        })
      }
      // For fractured mods, also add the unfractured (explicit) version, disabled by default
      if (isFractured) {
        const explicitId = `explicit.${matched.statId.split('.').slice(1).join('.')}`
        out.push({
          id: explicitId,
          text: cleaned,
          value: matched.value,
          min: minValue,
          max: maxValue,
          enabled: false,
          type: 'explicit',
          aggregated: matched.aggregated,
          modTier: matchedTier,
          modRange: matchedRange,
          tierLadder,
          tierQualityMult: advModMult,
        })
      }
    }
  }

  // Attribute rows fold into Total Life/Mana only when EVERY pseudo the mod feeds has
  // a real (non-attribute) contributor. A partial fold (e.g. a Str+Int hybrid on an
  // item with Life but no Mana) would lose the unfolded half and hide the row, so in
  // that case leave the raw attribute row surfaced and accumulate nothing.
  for (const d of deferredAttr) {
    const allActive = d.contributions.every((c) => pseudosWithRealContributor.has(c.pseudoId))
    if (!allActive) continue
    accumulatePseudo(pseudoAccumulator, d.contributions, d.value, isWeapon)
    if (!d.forced && d.contributions.some((c) => !c.keepSourceRow)) d.row.enabled = false
  }

  return mergeDuplicateStats(dropFragmentDuplicates(out), pct)
}
