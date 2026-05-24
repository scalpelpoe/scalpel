import type { ConditionResult, FilterCondition, PoeItem } from '../../shared/types'
import { boolMatch, compareNum } from './matcher'

/**
 * Evaluate a single filter condition that only exists in PoE2 filters. Called
 * from the main matcher's default branch so any condition it doesn't natively
 * handle gets a second chance here before falling back to 'unknown'. Returning
 * 'unknown' for a truly unfamiliar name keeps the existing "unknowns don't
 * poison matches" behavior intact.
 *
 * PoE1-only conditions live inline in matcher.ts; mixing them across files
 * would be cross-talk we explicitly want to avoid. Anything PoE2-exclusive
 * belongs in this file.
 *
 * Conditions whose underlying clipboard field is genuinely unavailable still
 * return 'unknown' (rather than a hardcoded 'false', which would make "X False"
 * rules silently match every item). Conditions are evaluated definitively here
 * once the parser surfaces the underlying field.
 */
export function evaluatePoe2Condition(cond: FilterCondition, item: PoeItem): ConditionResult {
  const { type, operator, values } = cond

  switch (type) {
    case 'TwiceCorrupted':
      // Surfaced by the clipboard parser (PoE2 "Twice Corrupted" line). An
      // item without that line is definitively not twice corrupted.
      return boolMatch(item.twiceCorrupted ?? false, values[0]) ? 'pass' : 'fail'

    case 'HasVaalUniqueMod':
      return boolMatch(item.hasVaalUniqueMod ?? false, values[0]) ? 'pass' : 'fail'

    case 'IsVaalUnique':
      // EE2 derivation: a Vaal Unique is a Unique carrying a Vaal Unique mod.
      return boolMatch(item.rarity === 'Unique' && (item.hasVaalUniqueMod ?? false), values[0]) ? 'pass' : 'fail'

    case 'UnidentifiedItemTier':
      if (item.unidentifiedItemTier == null) return 'unknown'
      return compareNum(item.unidentifiedItemTier, operator, parseInt(values[0], 10)) ? 'pass' : 'fail'

    default:
      return 'unknown'
  }
}
