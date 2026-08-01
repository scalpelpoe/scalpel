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
}

/** PoE1 "+#% Chance to Block Attack Damage while wielding a Staff":
 *  jewels → untagged explicit.stat_1778298516
 *  staves → explicit.stat_1001829678 "(Staves)"
 *  A blanket remap from jewels→staves broke Cobalt/Abyss jewel searches. Prefer the
 *  trade-stat `(Staves)` qualifier via QUALIFIER_BY_ITEM_CLASS, and pin here when the
 *  matcher still lands on the wrong twin (API order / missing qualifier). */
export const STAFF_BLOCK_ATTACK_STAT = {
  jewels: 'explicit.stat_1778298516',
  staves: 'explicit.stat_1001829678',
} as const

const STAFF_BLOCK_ATTACK_IDS = new Set<string>([STAFF_BLOCK_ATTACK_STAT.jewels, STAFF_BLOCK_ATTACK_STAT.staves])

export function resolveStaffBlockAttackStatId(statId: string, itemClass: string | undefined): string {
  if (!STAFF_BLOCK_ATTACK_IDS.has(statId)) return statId
  const isJewel = itemClass === 'Jewels' || itemClass === 'Abyss Jewels'
  return isJewel ? STAFF_BLOCK_ATTACK_STAT.jewels : STAFF_BLOCK_ATTACK_STAT.staves
}
