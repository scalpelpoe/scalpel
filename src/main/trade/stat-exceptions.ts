// Remap stat IDs that our case-insensitive matcher picks incorrectly.
// The trade API has near-duplicate stats with different IDs that only differ
// by capitalization or minor wording. This file corrects the ones we get wrong.
//
// Format: wrong stat ID -> correct stat ID
// Add entries here as they're discovered.

export const STAT_ID_REMAPS: Record<string, string> = {
  // "Socketed Gems are Supported by Level # Chance To Bleed" (capital T) is the wrong variant.
  // The correct one is "supported" (lowercase s) -> stat_2178803872
  'explicit.stat_4197676934': 'explicit.stat_2178803872',
  // "+#% Chance to Block Attack Damage while wielding a Staff" has two identical-text stat IDs.
  // stat_1778298516 doesn't work for uniques, stat_1001829678 does.
  'explicit.stat_1778298516': 'explicit.stat_1001829678',
}
