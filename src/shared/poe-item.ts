import type { PoeItem } from './types'

/** Cluster jewels are the "Small/Medium/Large Cluster Jewel" base types. They
 *  share the `Jewels` itemClass with abyss/regular/timeless jewels but trade
 *  in their own subcategory (jewel.cluster) and carry size-specific pricing
 *  semantics (passive-count brackets, distinct trade UI, etc.). */
export function isClusterJewel(item: { itemClass: string; baseType: string }): boolean {
  return item.itemClass === 'Jewels' && item.baseType.endsWith('Cluster Jewel')
}

/** PoE2 runeforging/runemastering upgrades a base into a distinct trade `type`
 *  (e.g. "Faithful Leggings" -> "Runeforged Faithful Leggings"). The clipboard
 *  keeps the prefix on `baseType`. Splits that prefix off so callers can choose
 *  the prefixed (premium rune market) or bare base for the trade search. The
 *  gem/map/currency exclusion lives at the call site, not here -- this is a pure
 *  string split. */
export function splitRuneTier(baseType: string): {
  tier: 'Runeforged' | 'Runemastered' | null
  bare: string
} {
  const m = baseType.match(/^(Runeforged|Runemastered)\s+(.+)$/)
  if (!m) return { tier: null, bare: baseType }
  return { tier: m[1] as 'Runeforged' | 'Runemastered', bare: m[2] }
}

/** All item-class strings that identify skill gems, across PoE1 and PoE2. The
 *  PoE1 clipboard emits "Gems"; PoE2 uses the more granular "Active Skill Gems"
 *  / "Support Skill Gems" strings. "Skill Gems" and "Support Gems" appear in
 *  filter files and trade data. Centralised here to avoid duplication -- see
 *  isClusterJewel for the precedent. */
export const SKILL_GEM_CLASSES = new Set([
  'Gems',
  'Skill Gems',
  'Active Skill Gems',
  'Support Gems',
  'Support Skill Gems',
])

/** Returns true when the item's class is any known gem class. */
export function isSkillGem(item: { itemClass: string }): boolean {
  return SKILL_GEM_CLASSES.has(item.itemClass)
}

/** Default "assume endgame" area level by game version. PoE1 FilterBlade splits
 *  campaign vs endgame at AreaLevel 68 and our baseline tier-16 map is area 83.
 *  PoE2 splits at 65 and the top waystone tier caps near 80. Used for synthetic
 *  items and as the fallback for clipboard-parsed items that carry no item level
 *  (currency), so AreaLevel-gated leveling rules don't win for bulk currency
 *  inspected outside a known zone. */
export function endgameAreaLevel(version: 1 | 2): number {
  return version === 2 ? 80 : 83
}

/** Build a synthetic `PoeItem` with sensible defaults. Used by any code path that needs
 *  to evaluate a filter or run a trade lookup without a real clipboard-parsed item --
 *  e.g. the item-search combobox, sister-overlay click-throughs, tier previews.
 *
 *  `version` hints the game so area-level-sensitive defaults land on the right side of
 *  each game's endgame threshold. PoE1 FilterBlade splits campaign vs endgame at
 *  AreaLevel 68 and our baseline tier-16 map is area 83, so we pretend 83. PoE2 uses
 *  65 as the endgame split and the top waystone tier caps around 80, so we pretend 80
 *  for PoE2 synthetics -- clearing every endgame-gated block without overshooting into
 *  pinnacle-boss-only zones that add niche extra rules. */
export function defaultPoeItem(overrides: Partial<PoeItem> = {}, version: 1 | 2 = 1): PoeItem {
  return {
    itemClass: '',
    rarity: 'Normal',
    name: '',
    baseType: '',
    mapTier: 0,
    itemLevel: 100,
    quality: 0,
    sockets: '',
    linkedSockets: 0,
    armour: 0,
    evasion: 0,
    energyShield: 0,
    ward: 0,
    block: 0,
    reqStr: 0,
    reqDex: 0,
    reqInt: 0,
    corrupted: false,
    identified: true,
    mirrored: false,
    synthesised: false,
    fractured: false,
    blighted: false,
    scourged: false,
    zanaMemory: false,
    implicitCount: 0,
    gemLevel: 0,
    transfigured: false,
    stackSize: 1,
    influence: [],
    explicits: [],
    implicits: [],
    areaLevel: endgameAreaLevel(version),
    isSynthetic: true,
    ...overrides,
  } as PoeItem
}
