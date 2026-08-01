import { STAT_ID_REMAPS } from '../stat-exceptions'
import { NUMERIC_CAPTURE, statTextToPattern, statTextToRelaxedPattern } from './pattern'
import type { StatEntry } from './stats-cache'
import { getStatEntries } from './stats-cache'
import { foldedChanceForms, generateTextVariants } from './text-variants'

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

/** True when the `#` placeholders are a contiguous min-max roll range
 *  ("Adds # to #" / "Adds #-#"), not independent magnitudes in one line. */
function isMinMaxRangeStat(statText: string): boolean {
  return /#\s*(?:to|-)\s*#/.test(statText.replace(/\s+/g, ' '))
}

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
  modType: 'explicit' | 'crafted' | 'implicit' | 'enchant' | 'imbued' | 'sanctum' | 'skill' | 'rune' = 'explicit',
  preferIndexableSupport = false,
  preferQualifier: string | null = null,
): { statId: string; value: number | null; option?: number; aggregated?: boolean } | null {
  // Check direct mappings first (for mods with completely different trade API wording)
  const directKey = modText.toLowerCase().trim()
  if (DIRECT_MOD_MAPPINGS[directKey]) return DIRECT_MOD_MAPPINGS[directKey]

  const result = _matchModToStat(modText, preferLocal, modType, preferIndexableSupport, preferQualifier)
  if (result && STAT_ID_REMAPS[result.statId]) {
    result.statId = STAT_ID_REMAPS[result.statId]
  }
  return result
}

/** Trailing category qualifier on a stat text, e.g. "(Charm)" / "(Flask)" /
 *  "(Jewel)". The trade API appends these to disambiguate identical display text
 *  across item categories ("#% increased Duration (Charm)" vs "(Flask)"); the
 *  item clipboard carries only the bare text, so the matcher strips the qualifier
 *  and prefers the entry whose qualifier matches the item's class. `(Local)` is
 *  handled separately because it also gates local-vs-global affix logic. */
const TRAILING_QUALIFIER_RE = /\s*\(([^)]+)\)\s*$/

function _matchModToStat(
  modText: string,
  preferLocal = false,
  modType: 'explicit' | 'crafted' | 'implicit' | 'enchant' | 'imbued' | 'sanctum' | 'skill' | 'rune' = 'explicit',
  preferIndexableSupport = false,
  preferQualifier: string | null = null,
): { statId: string; value: number | null; option?: number; aggregated?: boolean } | null {
  const statEntries: StatEntry[] = getStatEntries()
  const typePrefix = `${modType}.`
  const textVariants = generateTextVariants(modText)
  const isNegativeMod = /-\d/.test(modText)
  const isReducedMod = /\breduced\b/i.test(modText)
  const isLessMod = /\bless\b/i.test(modText)
  // "fewer" is the negative inverse of the trade API's "additional" stat (e.g.
  // "Require # fewer enemies to be Surrounded"): matched via the fewer->additional
  // variant, the value needs negating just like reduced/less.
  const isFewerMod = /\bfewer\b/i.test(modText)
  // Detect if we flipped increased->reduced or more->less (value needs negation)
  const isFlippedToNegative = /\bincreased\b/i.test(modText) || /\bmore\b/i.test(modText)

  for (const variant of textVariants) {
    const variantFlipped = isFlippedToNegative && (/\breduced\b/i.test(variant) || /\bless\b/i.test(variant))
    // Match against whitespace-normalized input so multi-line mods joined with "\n"
    // match stat patterns whose text uses " " (or vice versa).
    const normalizedVariant = variant.replace(/\s+/g, ' ')
    let nonLocalMatch: {
      statId: string
      value: number | null
      option?: number
      aggregated?: boolean
      _textLen: number
      _patternLen: number
    } | null = null
    let localMatch: {
      statId: string
      value: number | null
      option?: number
      aggregated?: boolean
      _textLen: number
      _patternLen: number
    } | null = null
    let qualifiedMatch: {
      statId: string
      value: number | null
      option?: number
      aggregated?: boolean
      _textLen: number
      _patternLen: number
    } | null = null

    for (const entry of statEntries) {
      if (!entry.id.startsWith(typePrefix)) continue
      if (BLOCKED_STAT_IDS.has(entry.id)) continue
      if (preferIndexableSupport ? !INDEXABLE_SUPPORT_RE.test(entry.id) : INDEXABLE_SUPPORT_RE.test(entry.id)) continue
      const isLocal = entry.text.includes('(Local)')
      // A non-Local trailing category qualifier like "(Charm)"/"(Flask)"/"(Jewel)".
      // The clipboard never carries it, so strip it for pattern matching and bucket
      // the entry by qualifier -- it only counts when the item asked for that category.
      const qualifier = isLocal ? null : (TRAILING_QUALIFIER_RE.exec(entry.text)?.[1] ?? null)
      let textForPattern = entry.text
      if (isLocal) textForPattern = textForPattern.replace(/\s*\(Local\)/, '')
      else if (qualifier) textForPattern = textForPattern.replace(TRAILING_QUALIFIER_RE, '')
      const pattern = statTextToPattern(textForPattern)
      const match = normalizedVariant.match(pattern)
      if (match) {
        // For min-max roll stats (e.g. "Adds # to # Damage"), average the two
        // numbers -- the trade site indexes that average. Other multi-# stats
        // (e.g. "#% chance … Spend at least # Life") are independent magnitudes;
        // averaging them (50+200)/2=125 breaks Exact Values searches for Kitava's
        // Thirst foulborn / similar uniques. Prefer the first # (the primary
        // filter the trade UI exposes).
        const numericCaptures = Array.from(match)
          .slice(1)
          .filter((v) => v && NUMERIC_CAPTURE.test(v))
        const rawValue = match[1]
        let value: number | null
        const aggregated = numericCaptures.length >= 2 && isMinMaxRangeStat(entry.text)
        if (aggregated) {
          value = numericCaptures.reduce((sum, v) => sum + parseFloat(v), 0) / numericCaptures.length
        } else {
          value =
            numericCaptures.length > 0
              ? parseFloat(numericCaptures[0])
              : rawValue && NUMERIC_CAPTURE.test(rawValue)
                ? parseFloat(rawValue)
                : null
        }
        // Restore negative sign when matching via sign-flipped variant
        if (isNegativeMod && value != null && value > 0) value = -value
        // "reduced"/"less" mods are usually negative "increased"/"more" in trade API,
        // but only negate if the matched stat text doesn't already contain "reduced"/"less"
        const statHasReduced = /\breduced\b/i.test(entry.text) || /\bless\b/i.test(entry.text)
        if ((isReducedMod || isLessMod) && !statHasReduced && value != null && value > 0) value = -value
        // "fewer" matched against an "additional" stat -> negate (the clipboard's
        // fewer N is the trade API's -N). Skip if the stat itself says "fewer".
        const statHasFewer = /\bfewer\b/i.test(entry.text)
        if (isFewerMod && !statHasFewer && value != null && value > 0) value = -value
        // "increased" matched as "reduced" (or "more" as "less") -- negate
        if (variantFlipped && value != null && value > 0) value = -value
        // For option-based stats (like "Map contains #'s Citadel"), resolve the option ID
        let option: number | undefined
        if (entry.option && rawValue && !value) {
          const opt = entry.option.options.find((o) => o.text === rawValue)
          if (opt) option = opt.id
        }
        const result = {
          statId: entry.id,
          value,
          option,
          aggregated: aggregated || undefined,
          _textLen: entry.text.length,
          // Length of the text actually pattern-matched (the "(Local)"/category
          // qualifier stripped). Used to compare specificity across the local
          // and non-local buckets, where _textLen would unfairly credit the
          // "(Local)" suffix.
          _patternLen: textForPattern.length,
        }
        if (isLocal) {
          if (!localMatch || entry.text.length > localMatch._textLen) localMatch = result
        } else if (qualifier) {
          // Only the requested category's qualified entry is a candidate; entries
          // for other categories (e.g. "(Flask)" when matching a charm) are ignored
          // so they can't pollute the plain bucket once their qualifier is stripped.
          // Compare case-insensitively so PoE1 "(Staves)" matches prefer "Staves"
          // and PoE2 "(Jewel)" still matches prefer "Jewel".
          if (
            preferQualifier &&
            qualifier.toLowerCase() === preferQualifier.toLowerCase() &&
            (!qualifiedMatch || entry.text.length > qualifiedMatch._textLen)
          )
            qualifiedMatch = result
        } else {
          if (!nonLocalMatch || entry.text.length > nonLocalMatch._textLen) nonLocalMatch = result
        }
      }
    }

    let result = nonLocalMatch
    // preferLocal flips to the "(Local)" twin of a global lookalike (#399), but
    // only when the local match is at least as specific as the best non-local
    // one. A strictly more-specific non-local match must win: e.g. the glove
    // enchant "Break #% increased Armour" vs the local "#% increased Armour",
    // where the local pattern only matched by letting its "#" swallow the word
    // "Break" -- preferring local there searches the wrong stat (#449).
    if (preferLocal && localMatch && (!nonLocalMatch || localMatch._patternLen >= nonLocalMatch._patternLen)) {
      result = localMatch
    } else if (qualifiedMatch) {
      result = qualifiedMatch
    }
    if (result) return result
  }

  // Fallback: a mod whose "#% chance to" clause the trade API folded out of the
  // stat text it publishes -- "Melee Hits have 11% chance to Fortify" is indexed
  // as "Melee Hits Fortify" (stat_1166417447). The chance is still the filter's
  // value (probe: min 101 returns nothing, min 1 returns the 10-15% rolls), but
  // the stat text has no "#" for the pattern to capture it from, so restore it
  // here. Only "#"-less stats are candidates: a lookalike with its own roll
  // ("Bow Attacks fire # additional Arrows") would swallow the chance and search
  // the wrong number. Runs after the exact pass so a mod whose chance clause the
  // API *did* publish ("Melee Hits which Stun have #% chance to Fortify") always
  // matches its own stat first.
  const folded = foldedChanceForms(modText)
  if (folded) {
    for (const text of folded.texts) {
      const normalized = text.replace(/\s+/g, ' ')
      for (const entry of statEntries) {
        if (!entry.id.startsWith(typePrefix)) continue
        if (BLOCKED_STAT_IDS.has(entry.id)) continue
        if (preferIndexableSupport ? !INDEXABLE_SUPPORT_RE.test(entry.id) : INDEXABLE_SUPPORT_RE.test(entry.id))
          continue
        if (entry.text.includes('#') || entry.text.includes('(Local)')) continue
        if (statTextToPattern(entry.text).test(normalized)) return { statId: entry.id, value: folded.value }
      }
    }
  }

  // Fallback: try relaxed patterns where hardcoded numbers in stat text become wildcards.
  // Handles cases like trade API having "increased by 50% of Overcapped" but item text has a different value.
  for (const variant of textVariants) {
    const normalizedVariant = variant.replace(/\s+/g, ' ')
    let bestMatch: { statId: string; value: number | null; aggregated?: boolean; _textLen: number } | null = null
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
  // Digits are stripped on BOTH sides: synthesis implicits like
  // "Intimidate Enemies for 4 seconds on Hit with Attacks" hide the 100% chance
  // but keep a fixed "4" in display text, while the trade stat keeps both
  // "#% chance to" and that same "4". Stripping only the clipboard left the
  // hardcoded duration digit on the stat side and broke endsWith.
  for (const variant of textVariants) {
    let bestMatch: { statId: string; value: number | null; aggregated?: boolean; _textLen: number } | null = null
    for (const entry of statEntries) {
      if (!entry.id.startsWith(typePrefix)) continue
      if (BLOCKED_STAT_IDS.has(entry.id)) continue
      if (preferIndexableSupport ? !INDEXABLE_SUPPORT_RE.test(entry.id) : INDEXABLE_SUPPORT_RE.test(entry.id)) continue
      if (entry.text.includes('(Local)')) continue
      const statPlain = entry.text.replace(/#/g, '').replace(/\d+/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
      const variantPlain = variant.replace(/\d+/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
      if (variantPlain.length <= 10) continue
      // The chunk this fallback lets the clipboard hide is always an unscalable
      // roll/chance fragment (e.g. "#% chance to ", "by #% of their value"), which
      // leaves a "%" behind once "#" is stripped. If the dropped end is descriptive
      // text instead (e.g. "Allies in your Presence have"), this is a different stat,
      // not a hidden-prefix variant -- reject it so a plain "increased Attack Speed"
      // doesn't grab "Allies in your Presence have #% increased Attack Speed" (#399).
      let dropped: string | null = null
      if (statPlain.endsWith(variantPlain)) dropped = statPlain.slice(0, statPlain.length - variantPlain.length)
      else if (statPlain.startsWith(variantPlain)) dropped = statPlain.slice(variantPlain.length)
      if (dropped !== null && dropped.includes('%')) {
        if (!bestMatch || entry.text.length > bestMatch._textLen) {
          bestMatch = { statId: entry.id, value: null, _textLen: entry.text.length }
        }
      }
    }
    if (bestMatch) return bestMatch
  }

  return null
}
