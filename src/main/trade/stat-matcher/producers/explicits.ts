import { BENEFICIAL_NEGATIVE_KEYWORDS } from '../../../../shared/data/trade/beneficial-negatives'
import { isClusterJewel } from '../../../../shared/poe-item'
import type { StatFilter } from '../../trade'
import { findAdvMod } from '../adv-mods'
import { isDefenseMod, isLocalMod, isLowPriority } from '../classification'
import type { MatchContext } from '../context'
import { matchModToStat } from '../mod-matcher'
import { accumulatePseudo, PSEUDO_CONTRIBUTIONS } from '../pseudo'

// Tinctures: disambiguate duplicate stat texts (e.g. "#% increased effect" has two stat IDs)
const TINCTURE_STAT_REMAP: Record<string, string> = {
  'explicit.stat_2448920197': 'explicit.stat_3529940209', // "#% increased effect" -> tincture-specific variant
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
  } = ctx
  const out: StatFilter[] = []

  for (const mod of isGemItem ? [] : explicits) {
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
    const matched = matchModToStat(cleaned, useLocal, isCrafted ? 'crafted' : 'explicit', isRandomSupport)
    if (matched) {
      const lowPriority = isLowPriority(cleaned)

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
      if (advancedMods && matched.value != null) {
        const rawCleaned = mod.replace(/\s*\(crafted\)\s*$/i, '').trim()
        const advMod = findAdvMod(advancedMods, cleaned, 'explicit', rawCleaned)
        if (advMod) {
          const range = advMod.ranges.find((r) => r.value === matched.value || r.value === -(matched.value ?? 0))
          if (range && range.min === range.max) isFixedValue = true
          if (!range && advMod.ranges.length === 0) isFixedValue = true
          if (advMod.tier > 0) matchedTier = advMod.tier
          if (range && range.min !== range.max) matchedRange = { min: range.min, max: range.max }
        }
      }
      // For negative values: "reduced" mods use min (trade API expects min for beneficial reduction),
      // while truly negative mods (e.g. "-50% to Lightning Resistance") use max.
      const isNegative = matched.value != null && matched.value < 0
      // Negative mods: default to "bad" (less negative = better, use min).
      // Some keywords indicate the negative is beneficial (more negative = better, use max).
      const isBeneficialNegative = isNegative && BENEFICIAL_NEGATIVE_KEYWORDS.some((p) => p.test(mod))
      let minValue =
        matched.value != null && (!isNegative || !isBeneficialNegative)
          ? isFixedValue
            ? matched.value
            : isNegative
              ? Math.ceil(matched.value * (2 - pct)) // -30 at 90% -> -33 (more negative = wider search)
              : Math.floor(matched.value * pct)
          : null
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
      const maxValue = isBeneficialNegative && matched.value != null ? matched.value : null

      // Skip for cluster jewels -- their mods grant passives, not item stats
      // Skip "X per Y" mods -- they're conditional and shouldn't inflate pseudo totals
      const isPerMod = /\bper\b/i.test(cleaned)
      const isCluster = itemInfo ? isClusterJewel(itemInfo) : false
      const pseudoList = isCluster || isPerMod ? undefined : PSEUDO_CONTRIBUTIONS[matched.statId]
      if (pseudoList && matched.value != null) {
        accumulatePseudo(pseudoAccumulator, pseudoList, matched.value, isWeapon)
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
      } else if (isCrafted && matched.statId.startsWith('explicit.')) {
        matched.statId = `crafted.${matched.statId.split('.').slice(1).join('.')}`
      }

      out.push({
        id: matched.statId,
        text: isFractured ? `${cleaned} (Fractured)` : cleaned,
        value: matched.value,
        min: minValue,
        max: maxValue,
        enabled:
          isFractured ||
          isFoulborn ||
          (!lowPriority &&
            !isCrafted &&
            !pseudoList &&
            !isHybridCompanion &&
            !(hasDefenses && isDefenseMod(cleaned)) &&
            !useLocal &&
            !(itemInfo?.itemClass === 'Maps')),
        type: isFractured ? 'fractured' : isCrafted ? 'crafted' : 'explicit',
        option: matched.option,
        foulborn: isFoulborn || undefined,
        modTier: matchedTier,
        modRange: matchedRange,
      })
      // For fractured mods, also add the unfractured (explicit) version, disabled by default
      if (isFractured) {
        const explicitId = `explicit.${matched.statId.split('.').slice(1).join('.')}`
        out.push({
          id: explicitId,
          text: cleaned,
          value: matched.value,
          min: minValue,
          max: null,
          enabled: false,
          type: 'explicit',
          modTier: matchedTier,
          modRange: matchedRange,
        })
      }
    }
  }

  return out
}
