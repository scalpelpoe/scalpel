import { STAT_ID_REMAPS } from '../stat-exceptions'
import { NUMERIC_CAPTURE, statTextToPattern, statTextToRelaxedPattern } from './pattern'
import type { StatEntry } from './stats-cache'
import { getStatEntries } from './stats-cache'
import { generateTextVariants } from './text-variants'

/** Direct text-to-stat mappings for mods where clipboard text is completely different
 *  from the trade API stat text (e.g. corruption implicits with different wording) */
const DIRECT_MOD_MAPPINGS: Record<string, { statId: string; value: number | null }> = {
  'contains a vaal side area': { statId: 'implicit.stat_2156201537', value: null },
  // "Trigger a Socketed Spell" bench craft. Trade API stores this under the chance-to-
  // trigger stat (crafted.stat_3079007202), with item-specific "8 second Cooldown" +
  // "150% more Cost" baked into the text. The bench version drops the chance prefix
  // and rephrases "on Using a Skill" -> "when you Use a Skill", so text matching can't
  // reach it. Mapped with value: null since the stat has no user-adjustable roll.
  'trigger a socketed spell when you use a skill, with a 8 second cooldown\nspells triggered this way have 150% more cost':
    { statId: 'crafted.stat_3079007202', value: null },
}

/** Stat IDs to skip entirely (duplicates where only one works for searching) */
const BLOCKED_STAT_IDS = new Set([
  'explicit.stat_3664950032', // "#% increased Quantity of Gold Dropped by Slain Enemies" (duplicate, broken)
])

/** Forbidden Shako-style randomized supports live under the `indexable_support_*`
 *  stat family, which shares display text with regular `stat_*` entries. We always
 *  filter one or the other out so the matcher doesn't coin-flip between them:
 *  default behavior excludes the indexable family (so regular items match correctly);
 *  callers that know they're looking at a randomized-support mod pass
 *  preferIndexableSupport=true to flip the filter. */
const INDEXABLE_SUPPORT_RE = /^[a-z]+\.indexable_support_\d+/

export function matchModToStat(
  modText: string,
  preferLocal = false,
  modType: 'explicit' | 'crafted' | 'implicit' | 'enchant' | 'imbued' = 'explicit',
  preferIndexableSupport = false,
): { statId: string; value: number | null; option?: number } | null {
  // Check direct mappings first (for mods with completely different trade API wording)
  const directKey = modText.toLowerCase().trim()
  if (DIRECT_MOD_MAPPINGS[directKey]) return DIRECT_MOD_MAPPINGS[directKey]

  const result = _matchModToStat(modText, preferLocal, modType, preferIndexableSupport)
  if (result && STAT_ID_REMAPS[result.statId]) {
    result.statId = STAT_ID_REMAPS[result.statId]
  }
  return result
}

function _matchModToStat(
  modText: string,
  preferLocal = false,
  modType: 'explicit' | 'crafted' | 'implicit' | 'enchant' | 'imbued' = 'explicit',
  preferIndexableSupport = false,
): { statId: string; value: number | null; option?: number } | null {
  const statEntries: StatEntry[] = getStatEntries()
  const typePrefix = `${modType}.`
  const textVariants = generateTextVariants(modText)
  const isNegativeMod = /-\d/.test(modText)
  const isReducedMod = /\breduced\b/i.test(modText)
  const isLessMod = /\bless\b/i.test(modText)
  // Detect if we flipped increased->reduced or more->less (value needs negation)
  const isFlippedToNegative = /\bincreased\b/i.test(modText) || /\bmore\b/i.test(modText)

  for (const variant of textVariants) {
    const variantFlipped = isFlippedToNegative && (/\breduced\b/i.test(variant) || /\bless\b/i.test(variant))
    // Match against whitespace-normalized input so multi-line mods joined with "\n"
    // match stat patterns whose text uses " " (or vice versa).
    const normalizedVariant = variant.replace(/\s+/g, ' ')
    let nonLocalMatch: { statId: string; value: number | null; option?: number; _textLen: number } | null = null
    let localMatch: { statId: string; value: number | null; option?: number; _textLen: number } | null = null

    for (const entry of statEntries) {
      if (!entry.id.startsWith(typePrefix)) continue
      if (BLOCKED_STAT_IDS.has(entry.id)) continue
      if (preferIndexableSupport ? !INDEXABLE_SUPPORT_RE.test(entry.id) : INDEXABLE_SUPPORT_RE.test(entry.id)) continue
      const isLocal = entry.text.includes('(Local)')
      const textForPattern = isLocal ? entry.text.replace(/\s*\(Local\)/, '') : entry.text
      const pattern = statTextToPattern(textForPattern)
      const match = normalizedVariant.match(pattern)
      if (match) {
        // For stats with two numeric values (e.g. "Adds # to # Damage"), average them
        const numericCaptures = Array.from(match)
          .slice(1)
          .filter((v) => v && NUMERIC_CAPTURE.test(v))
        const rawValue = match[1]
        let value: number | null
        if (numericCaptures.length >= 2) {
          value = numericCaptures.reduce((sum, v) => sum + parseFloat(v), 0) / numericCaptures.length
        } else {
          value = rawValue && NUMERIC_CAPTURE.test(rawValue) ? parseFloat(rawValue) : null
        }
        // Restore negative sign when matching via sign-flipped variant
        if (isNegativeMod && value != null && value > 0) value = -value
        // "reduced"/"less" mods are usually negative "increased"/"more" in trade API,
        // but only negate if the matched stat text doesn't already contain "reduced"/"less"
        const statHasReduced = /\breduced\b/i.test(entry.text) || /\bless\b/i.test(entry.text)
        if ((isReducedMod || isLessMod) && !statHasReduced && value != null && value > 0) value = -value
        // "increased" matched as "reduced" (or "more" as "less") -- negate
        if (variantFlipped && value != null && value > 0) value = -value
        // For option-based stats (like "Map contains #'s Citadel"), resolve the option ID
        let option: number | undefined
        if (entry.option && rawValue && !value) {
          const opt = entry.option.options.find((o) => o.text === rawValue)
          if (opt) option = opt.id
        }
        const result = { statId: entry.id, value, option, _textLen: entry.text.length }
        if (isLocal) {
          if (!localMatch || entry.text.length > localMatch._textLen) localMatch = result
        } else {
          if (!nonLocalMatch || entry.text.length > nonLocalMatch._textLen) nonLocalMatch = result
        }
      }
    }

    const result =
      preferLocal && localMatch ? localMatch : !preferLocal && nonLocalMatch ? nonLocalMatch : nonLocalMatch
    if (result) return result
  }

  // Fallback: try relaxed patterns where hardcoded numbers in stat text become wildcards.
  // Handles cases like trade API having "increased by 50% of Overcapped" but item text has a different value.
  for (const variant of textVariants) {
    const normalizedVariant = variant.replace(/\s+/g, ' ')
    let bestMatch: { statId: string; value: number | null; option?: number; _textLen: number } | null = null
    for (const entry of statEntries) {
      if (!entry.id.startsWith(typePrefix)) continue
      if (BLOCKED_STAT_IDS.has(entry.id)) continue
      if (preferIndexableSupport ? !INDEXABLE_SUPPORT_RE.test(entry.id) : INDEXABLE_SUPPORT_RE.test(entry.id)) continue
      if (entry.text.includes('(Local)')) continue // skip local in relaxed mode
      const relaxedPattern = statTextToRelaxedPattern(entry.text)
      const match = normalizedVariant.match(relaxedPattern)
      if (match) {
        const numericCaptures = Array.from(match)
          .slice(1)
          .filter((v) => v && NUMERIC_CAPTURE.test(v))
        const value = numericCaptures.length > 0 ? parseFloat(numericCaptures[0]) : null
        const result = { statId: entry.id, value, _textLen: entry.text.length }
        if (!bestMatch || entry.text.length > bestMatch._textLen) bestMatch = result
      }
    }
    if (bestMatch) return bestMatch
  }

  // Fallback: prefix or suffix match for Unscalable Value mods where the clipboard
  // text is a substring of the trade API stat text at one of its ends. Two real
  // shapes seen in practice:
  //   prefix:  clipboard "Bladefall deals extra Damage" matches stat
  //            "Bladefall deals extra Damage by #% of their value" (trailing "% of"
  //            chunk is unscalable so the clipboard hides it)
  //   suffix:  clipboard "Gain Alchemist's Genius when you use a Flask" matches stat
  //            "#% chance to gain Alchemist's Genius when you use a Flask" ("of the
  //            Essence" belt suffix has a hidden 100% chance, so the clipboard drops
  //            the leading "#% chance to ")
  for (const variant of textVariants) {
    let bestMatch: { statId: string; value: number | null; _textLen: number } | null = null
    for (const entry of statEntries) {
      if (!entry.id.startsWith(typePrefix)) continue
      if (BLOCKED_STAT_IDS.has(entry.id)) continue
      if (preferIndexableSupport ? !INDEXABLE_SUPPORT_RE.test(entry.id) : INDEXABLE_SUPPORT_RE.test(entry.id)) continue
      if (entry.text.includes('(Local)')) continue
      const statPlain = entry.text.replace(/#/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
      const variantPlain = variant.replace(/\d+/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
      if (variantPlain.length <= 10) continue
      if (statPlain.startsWith(variantPlain) || statPlain.endsWith(variantPlain)) {
        if (!bestMatch || entry.text.length > bestMatch._textLen) {
          bestMatch = { statId: entry.id, value: null, _textLen: entry.text.length }
        }
      }
    }
    if (bestMatch) return bestMatch
  }

  return null
}
