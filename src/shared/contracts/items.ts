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
  corrupted: boolean
  twiceCorrupted?: boolean
  hasVaalUniqueMod?: boolean
  identified: boolean
  mirrored: boolean
  synthesised: boolean
  isSynthetic?: boolean
  fractured: boolean
  transfigured: boolean
  alternateQuality?: boolean
  vaalGem?: boolean
  blighted: boolean
  uberBlighted?: boolean
  scourged: boolean
  zanaMemory: boolean
  implicitCount: number
  gemLevel: number
  stackSize: number
  maxStackSize?: number
  influence: string[]
  explicits: string[]
  implicits: string[]
  enchants: string[]
  imbues: string[]
  grantedSkills?: string[]
  memoryStrands?: number
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
  heistJob?: { skill: string; level: number }
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

export interface TierSibling {
  tier: string
  visibility: Visibility
  blockIndex: number
  block: FilterBlock
  match: MatchResult
}

export interface TierGroup {
  typePath: string
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

export const HIDEABLE_TAB_KEYS = ['item', 'pricecheck', 'dust', 'divcards', 'regex', 'extras'] as const

export type HideableTabKey = (typeof HIDEABLE_TAB_KEYS)[number]

export function isHideableTabKey(k: string): k is HideableTabKey {
  return (HIDEABLE_TAB_KEYS as readonly string[]).includes(k)
}
