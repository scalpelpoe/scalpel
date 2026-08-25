import type { Visibility, ComparisonOperator, ConditionType, ActionType, ConditionResult, ItemRarity } from './core'
import type { PriceInfo } from './prices'

export interface FilterCondition {
  type: ConditionType
  operator: ComparisonOperator
  values: string[]
  explicitOperator?: boolean
}

export interface RgbaColor {
  r: number
  g: number
  b: number
  a: number
}

export interface FilterAction {
  type: ActionType
  values: string[]
}

export interface TierTag {
  typePath: string
  tier: string
}

export interface FilterBlock {
  id: string
  visibility: Visibility
  conditions: FilterCondition[]
  actions: FilterAction[]
  continue: boolean
  lineStart: number
  lineEnd: number
  bodyEndLine?: number
  leadingComment?: string
  inlineComment?: string
  tierTag?: TierTag
}

export interface FilterFile {
  path: string
  blocks: FilterBlock[]
  rawLines: string[]
  eol?: '\r\n' | '\n'
}

export interface FilterListEntry {
  path: string
  name: string
  online: boolean
}

export interface AdvancedMod {
  type: 'prefix' | 'suffix' | 'implicit'
  name: string
  tier: number
  tags: string[]
  lines: string[]
  ranges: Array<{ value: number; min: number; max: number }>
  fractured?: boolean
  crafted?: boolean
  eldritch?: boolean
  /** Which eldritch altar granted the implicit. `eldritch` only says one of them did;
   *  the price-check source badge needs to know which, so it is kept separately rather
   *  than widening the boolean its existing consumers read. */
  eldritchSource?: 'searing-exarch' | 'eater-of-worlds'
  foulborn?: boolean
  magnitudeMultiplier?: number
  randomSupport?: boolean
}

export interface PoeItem {
  itemClass: string
  rarity: ItemRarity
  name: string
  baseType: string
  mapTier: number
  itemLevel: number
  quality: number
  sockets: string
  linkedSockets: number
  armour: number
  evasion: number
  energyShield: number
  ward: number
  block: number
  reqStr: number
  reqDex: number
  reqInt: number
  /** "Requires Level" from the requirements section. Absent on items that print
   *  no requirements block (most currency, maps, div cards). */
  requiredLevel?: number
  corrupted: boolean
  twiceCorrupted?: boolean
  hasVaalUniqueMod?: boolean
  identified: boolean
  mirrored: boolean
  /** PoE2 Well of Souls sanctification: mod values boosted past their normal caps.
   *  Marked by a standalone "Sanctified" clipboard line; only rares can carry it. */
  sanctified?: boolean
  synthesised: boolean
  isSynthetic?: boolean
  fractured: boolean
  transfigured: boolean
  alternateQuality?: boolean
  vaalGem?: boolean
  blighted: boolean
  uberBlighted?: boolean
  scourged: boolean
  vestigial?: boolean
  foulborn?: boolean
  zanaMemory: boolean
  implicitCount: number
  gemLevel: number
  stackSize: number
  maxStackSize?: number
  influence: string[]
  explicits: string[]
  implicits: string[]
  enchants: string[]
  runes?: string[]
  imbues: string[]
  grantedSkills?: string[]
  memoryStrands?: number
  /** Allflame crafting (3.29): the chance the item's next craft collapses to a single
   *  outcome, in whole percent. Rises with every craft, so lower is better. */
  intangibility?: number
  unidentifiedItemTier?: number
  areaLevel?: number
  advancedMods?: AdvancedMod[]
  mapQuantity?: number
  mapRarity?: number
  mapPackSize?: number
  mapMoreScarabs?: number
  mapMoreCurrency?: number
  mapMoreMaps?: number
  mapMoreDivCards?: number
  mapReward?: string
  mapRevives?: number
  mapDropChance?: number
  mapGold?: number
  mapMagicMonsters?: number
  mapRareMonsters?: number
  physDamageMin?: number
  physDamageMax?: number
  eleDamageAvg?: number
  chaosDamageAvg?: number
  attacksPerSecond?: number
  critChance?: number
  width?: number
  height?: number
  /** Heist job requirements. One entry on a contract, one per revealed wing job
   *  on a blueprint. */
  heistJobs?: Array<{ skill: string; level: number }>
  /** Heist blueprint target, e.g. "Currency" or "Enchanted Armaments". */
  heistTarget?: string
  monsterLevel?: number
  wingsRevealed?: number
  wingsTotal?: number
  logbookFactions?: string[]
  logbookBosses?: string[]
  atzoatlRooms?: string[]
  atzoatlOpenCount?: number
  storedExperience?: number
  ultimatumChallenge?: string
  ultimatumRewardText?: string
  ultimatumRequired?: string
  /** Chart zone name as printed on the clipboard, e.g. "Sea Pillars". PoE1
   *  `Chart` item class only. Part of the chart's trade identity: the trade API
   *  indexes each zone as its own type + discriminator. */
  chartZone?: string
  /** Chart shape, e.g. "Straight". PoE1 `Chart` item class only. */
  chartShape?: string
  /** Map area a Scrying Orb is bound to, e.g. "Dunes", from its "Map Area:"
   *  line. Part of the orb's trade identity: the trade API indexes each area as
   *  its own type + discriminator (see shared/data/trade/scrying-orbs.ts). */
  scryingArea?: string
  /** Mercenary build a Mercenary Warrant sells, e.g. "Mysterious Diver" or
   *  "Infamous Mysterious Diver", from its "Build:" line. Part of the warrant's
   *  trade identity: the trade API indexes each build as its own type +
   *  discriminator (see shared/data/trade/mercenary-warrants.ts). */
  mercenaryBuild?: string
  /** Mercenary level a Mercenary Warrant sells, capped at 83. Indexes as
   *  misc_filters.ilvl on trade, not as area level. */
  mercenaryLevel?: number
  /** Skill blocks printed on a Mercenary Warrant, in clipboard order. The
   *  mercenary's kit is what actually sets a warrant's price, and every skill
   *  and every support-at-tier is its own presence-only trade stat id
   *  (mercenary.skill_* / mercenary.support_*, matched by text). */
  mercenarySkills?: MercenarySkill[]
}

/** One skill on a Mercenary Warrant's mercenary plus the supports linked to it.
 *  `supports` keeps the clipboard's own wording, tier included -- e.g.
 *  "Greater Critical Chance (Tier: 3)" -- because the tier is part of the
 *  support's trade identity, not a value on it. */
export interface MercenarySkill {
  name: string
  supports: string[]
}

export interface Zone {
  areaLevel: number
  areaCode: string
}

export interface EvaluatedCondition {
  condition: FilterCondition
  result: ConditionResult
}

export interface MatchResult {
  block: FilterBlock
  blockIndex: number
  isFirstMatch: boolean
  evaluatedConditions: EvaluatedCondition[]
  hasUnknowns: boolean
}

/** What a "remove this base" action would do, resolved in the main process.
 *  A base is often named by several tiers at once (stacked currency is tiered by
 *  StackSize), so removal spans every tier that catches the item -- `tierCount`
 *  is how many, and `skipped` are the ones that keep it anyway. */
export interface RemovalPreview {
  /** The block that still catches the item afterwards, or null for none. */
  landsOn: MatchResult | null
  /** How many tiers the base will be stripped from. */
  tierCount: number
  /** Tiers that name the item but cannot be stripped, so it stays visible. */
  skipped: { tier: string; reason: 'token' | 'last-base' }[]
  /** Hide tier the item will be added to, or null when none is needed or none
   *  exists. */
  hideDestination: string | null
  /** True when stripping the naming tiers is enough on its own -- the item then
   *  lands on a Hide block. Landing on nothing is NOT hidden: the game draws it
   *  with default styling. */
  alreadyHidden: boolean
  /** Set when the tier the item is on names this base and nothing else, so the
   *  tier simply *is* the item: hiding it means flipping that block to `Hide`,
   *  with no base moved anywhere. Preferred over every other route when
   *  available -- it is the only one that leaves the base lists untouched, and it
   *  is the one case a `last-base` tier can be hidden at all. */
  flipTier: string | null
}

/**
 * Why a sibling tier cannot receive this item. Such tiers are dropped from the
 * dropdown rather than shown, so this is a filtering reason, not a display one.
 *
 * - `conditions` -- the tier's non-BaseType conditions rule the item out. PoE2's
 *   trial-coin tiers are `ItemLevel` bands over a single base, so an ilvl 83
 *   Djinn Barya belongs to exactly one of them by definition; the others are not
 *   somewhere it can be moved to, whatever they name.
 * - `no-basetype` -- the tier catches by class rules and lists no bases. Adding a
 *   `BaseType` line would narrow it from "everything of this class" to "only this
 *   base" -- the mirror of the widening hazard behind `SourceLockReason`.
 * - `outranked` -- the source tier cannot give the base up and sits earlier in the
 *   file, so it keeps winning the first-match race.
 */
export type MoveBlockedReason = 'conditions' | 'no-basetype' | 'outranked'

/**
 * Why the tier an item currently sits on cannot be stripped. Mirrors
 * `checkRemovable`'s refusals: taking the last named base off a block deletes its
 * `BaseType` line, widening the block to everything its remaining conditions
 * allow -- a `Show` tier gated only on `ItemLevel >= 80` then lights up every
 * high-level drop in the game.
 */
export type SourceLockReason = 'last-base' | 'token'

export interface TierSibling {
  tier: string
  visibility: Visibility
  blockIndex: number
  block: FilterBlock
  match: MatchResult
}

export interface TierGroup {
  typePath: string
  /** Only tiers that could actually receive the item, plus the one it is on. */
  siblings: TierSibling[]
  currentTier: string
}

export interface StackSizeBreakpoint {
  min: number
  max: number
  activeMatch: MatchResult | null
  tierGroup?: TierGroup
}

export interface OverlayData {
  item: PoeItem
  matches: MatchResult[]
  stackBreakpoints?: StackSizeBreakpoint[]
  qualityBreakpoints?: StackSizeBreakpoint[]
  strandBreakpoints?: StackSizeBreakpoint[]
  tierGroup?: TierGroup
  priceInfo?: PriceInfo
  /** Live divine rate + Divine Orb sparkline, shipped alongside priceInfo so
   *  the hero's NinjaPriceChip can render pair-currency displays (the 1/N
   *  divine fraction needs the divine-rate chart). */
  chaosPerDivine?: number
  divineGraph?: (number | null)[]
}

export interface SearchableItem {
  name: string
  baseType: string
  itemClass: string
  rarity: 'Unique' | 'Currency' | 'Gem'
  blocks: Array<{ visibility: 'Show' | 'Hide'; actions: FilterAction[]; continue: boolean }> | null
  reward?: string
  iconKey?: string
  flags?: { zanaMemory?: boolean }
}

export const HIDEABLE_TAB_KEYS = ['item', 'pricecheck', 'dust', 'divcards', 'timeless', 'regex', 'extras'] as const

export type HideableTabKey = (typeof HIDEABLE_TAB_KEYS)[number]

export function isHideableTabKey(k: string): k is HideableTabKey {
  return (HIDEABLE_TAB_KEYS as readonly string[]).includes(k)
}
