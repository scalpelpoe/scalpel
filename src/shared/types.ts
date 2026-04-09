// Type definitions for the IPC and the frontend to talk to eachother. Truly boring stuff.

export type Visibility = 'Show' | 'Hide' | 'Minimal'
export type ComparisonOperator = '>' | '>=' | '=' | '==' | '<=' | '<'

// Any string is valid as new things can pop up from league to league
// Known types are handled explicitly by the matcher; unknown ones evaluate as 'unknown'.
export type ConditionType = string

export type ActionType =
  | 'SetTextColor'
  | 'SetBorderColor'
  | 'SetBackgroundColor'
  | 'SetFontSize'
  | 'PlaySound'
  | 'PlayAlertSound'
  | 'PlayAlertSoundPositional'
  | 'CustomAlertSound'
  | 'CustomAlertSoundOptional'
  | 'PlayEffect'
  | 'MinimapIcon'
  | 'DisableDropSound'
  | 'EnableDropSound'
  | 'DisableDropSoundIfAlertSound'
  | 'EnableDropSoundIfAlertSound'

export interface FilterCondition {
  type: ConditionType
  operator: ComparisonOperator // defaults to '=' for string/bool conditions
  values: string[] // always strings in storage; parsed as needed
  /** True if the operator was explicitly written in the filter file (e.g. "=0" vs bare values) */
  explicitOperator?: boolean
}

export interface RgbaColor {
  r: number
  g: number
  b: number
  a: number // 0-255
}

export interface FilterAction {
  type: ActionType
  values: string[]
}

export interface TierTag {
  /** e.g. "currency->fossil" */
  typePath: string
  /** e.g. "t1", "t2", "exhide" */
  tier: string
}

export interface FilterBlock {
  id: string // stable UUID for React keys
  visibility: Visibility
  conditions: FilterCondition[]
  actions: FilterAction[]
  continue: boolean
  lineStart: number
  lineEnd: number
  /** Any comment line immediately above the block */
  leadingComment?: string
  /** The inline comment on the Show/Hide line (e.g. "%D9 $type->currency->fossil $tier->t1") */
  inlineComment?: string
  /** Parsed FilterBlade tier tag from the inline comment */
  tierTag?: TierTag
}

export interface FilterFile {
  path: string
  blocks: FilterBlock[]
  /** Raw lines — used to write back changes while preserving unmodified sections */
  rawLines: string[]
}

// ─── Item Types ───────────────────────────────────────────────────────────

export type ItemRarity = 'Normal' | 'Magic' | 'Rare' | 'Unique'

export interface PoeItem {
  itemClass: string
  rarity: ItemRarity
  name: string
  baseType: string
  mapTier: number
  itemLevel: number
  quality: number
  sockets: string // e.g. "R-G-B B-G"
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
  identified: boolean
  mirrored: boolean
  synthesised: boolean
  fractured: boolean
  transfigured: boolean
  blighted: boolean
  scourged: boolean
  zanaMemory: boolean
  implicitCount: number
  gemLevel: number
  stackSize: number
  influence: string[]
  explicits: string[]
  implicits: string[]
  enchants: string[]
  imbues: string[]
  memoryStrands?: number
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
  physDamageMin?: number
  physDamageMax?: number
  eleDamageAvg?: number
  chaosDamageAvg?: number
  attacksPerSecond?: number
  width?: number
  height?: number
  monsterLevel?: number
  wingsRevealed?: number
  wingsTotal?: number
  logbookFactions?: string[]
  logbookBosses?: string[]
}

export interface AdvancedMod {
  type: 'prefix' | 'suffix' | 'implicit'
  name: string
  tier: number
  tags: string[]
  lines: string[] // the actual mod text lines
  ranges: Array<{ value: number; min: number; max: number }> // parsed roll ranges
  fractured?: boolean
  crafted?: boolean
  eldritch?: boolean
}

// ─── IPC Channel Payloads ─────────────────────────────────────────────────────

export type ConditionResult = 'pass' | 'fail' | 'unknown'

export interface EvaluatedCondition {
  condition: FilterCondition
  result: ConditionResult
}

export interface MatchResult {
  block: FilterBlock
  /** Index of the block in the filter file */
  blockIndex: number
  /** True if this is the first matching block (what the game actually applies) */
  isFirstMatch: boolean
  /** Per-condition evaluation results */
  evaluatedConditions: EvaluatedCondition[]
  /** True if some conditions couldn't be evaluated from clipboard data */
  hasUnknowns: boolean
}

/** Shows which filter block is active at a given stack size range */
export interface StackSizeBreakpoint {
  /** Minimum stack size for this range (inclusive) */
  min: number
  /** Maximum stack size for this range (inclusive), Infinity for unbounded */
  max: number
  /** The active (first) match at this stack size, or null if hidden by default */
  activeMatch: MatchResult | null
  /** Tier group for the active match at this stack size */
  tierGroup?: TierGroup
}

export interface TierSibling {
  tier: string
  visibility: Visibility
  blockIndex: number
  block: FilterBlock
  /** Pre-evaluated match result so FilterBlockEditor can display it directly */
  match: MatchResult
}

export interface TierGroup {
  typePath: string
  siblings: TierSibling[]
  /** The tier of the currently matched block */
  currentTier: string
}

export interface OverlayData {
  item: PoeItem
  matches: MatchResult[]
  /** For stackable items, shows how the active match changes at different stack sizes */
  stackBreakpoints?: StackSizeBreakpoint[]
  /** For items with quality, shows how the active match changes at different quality levels */
  qualityBreakpoints?: StackSizeBreakpoint[]
  /** For items with memory strands, shows how the active match changes at different strand levels */
  strandBreakpoints?: StackSizeBreakpoint[]
  /** For FilterBlade-style tiered blocks, the sibling tiers */
  tierGroup?: TierGroup
  /** poe.ninja price data */
  priceInfo?: PriceInfo
}

export interface InstallManifest {
  version: string
  electronVersion: string
  asarUrl: string
  asarSha512: string
  asarSize: number
  unpackedUrl?: string
  unpackedSha512?: string
  unpackedSize?: number
  nativeModules: Record<string, string>
}

export interface AppSettings {
  filterPath: string
  filterDir: string
  hotkey: string
  priceCheckHotkey: string
  overlayOpacity: number
  overlayScale: number
  closeOnClickOutside: boolean
  league: string
  reloadOnSave: boolean
  updateChannel: 'stable' | 'beta'
  tradeStatus: 'available' | 'securable'
  tradePriceOption: 'chaos_divine' | 'chaos_equivalent'
  priceCheckDefaultPercent: number
  chatCommands: Array<{ hotkey: string; command: string }>
  stashScrollEnabled: boolean
}

export interface FilterListEntry {
  /** Full path to the .filter file */
  path: string
  /** Display name (extracted from file for online filters, or filename for local) */
  name: string
  /** Whether this is from the onlinefilters subfolder */
  online: boolean
}

export interface PriceInfo {
  chaosValue: number
  divineValue?: number
  dustValue?: number
}

// ─── Edit History ────────────────────────────────────────────────────────────

export interface HistoryEntry {
  id: number
  timestamp: number
  description: string
  /** The kind of edit that was made */
  action: 'block-edit' | 'tier-move' | 'stack-threshold'
  /** Item name/baseType — used to show the item icon in the history panel */
  itemName?: string
}

// ─── Filter Versions ──────────────────────────────────────────────────────────

export interface FilterVersion {
  filename: string
  timestamp: number
  isCheckpoint: boolean
  label?: string
  filterName?: string
}
