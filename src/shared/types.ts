// Type definitions for the IPC and the frontend to talk to eachother. Truly boring stuff.

import type { MacroScope } from './macro-scope'
import type { ThemePalette } from './theme/palette'

export type GameVariant = 1 | 2

export interface PoeProfile {
  schemaVersion: 1
  id: string
  name: string
  gameVariant: GameVariant
  createdAt: string
  updatedAt: string
  filterDir: string
  filterPath: string
  league: string
  tradePriceOption: TradePriceOption
  cheatSheets: CheatSheetsSettings
  regexPresets: RegexPreset[]
}

export interface PoeProfileSummary {
  id: string
  name: string
  gameVariant: GameVariant
  league: string
  filterDir: string
  filterPath: string
  createdAt: string
  updatedAt: string
  active: boolean
}

export type ProfileSettingKey = 'league' | 'filterPath' | 'filterDir' | 'tradePriceOption' | 'cheatSheets'

export type ProfileSettingValue<K extends ProfileSettingKey> = PoeProfile[K]

export interface RuntimeSettings extends AppSettings {
  activeProfile: PoeProfile | null
}

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

export type ItemRarity = 'Normal' | 'Magic' | 'Rare' | 'Unique' | 'Gem' | 'Currency'

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
  /** PoE2: clipboard had a "Twice Corrupted" section line. Implies corrupted. */
  twiceCorrupted?: boolean
  /** PoE2: clipboard carried a "{ Vaal Unique Modifier ... }" annotation. */
  hasVaalUniqueMod?: boolean
  identified: boolean
  mirrored: boolean
  synthesised: boolean
  /** True when the item was constructed by Scalpel (e.g. sister-overlay click,
   *  unique-card click) rather than parsed from a real clipboard paste. UI uses
   *  this to suppress fields that have no meaning on a placeholder item. */
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
  memoryStrands?: number
  /** PoE2: unidentified item implicit tier (rough rarity signal on unid drops).
   *  Not currently populated by the clipboard parser -- consumers should treat
   *  the absence as "unknown", not "tier 0". */
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
  // Inscribed Ultimatum lines. ultimatumChallenge stores the human text from
  // "Challenge:" (e.g. "Defeat waves of enemies"); the trade-side mapping
  // converts to internal ids. ultimatumRewardText is the raw "Reward:" line;
  // ultimatumRequired is the "Requires Sacrifice:" name with the count
  // stripped.
  ultimatumChallenge?: string
  ultimatumRewardText?: string
  ultimatumRequired?: string
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
  foulborn?: boolean
  magnitudeMultiplier?: number
  /** True for Forbidden Shako-style "Socketed Gems are Supported by..." mods that
   *  carry the "Unscalable Value" suffix in advanced data. These resolve to a
   *  separate `explicit.indexable_support_*` stat ID family on the trade API,
   *  not the regular `explicit.stat_*` ID their cleaned text would otherwise hit. */
  randomSupport?: boolean
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

/** Live zone state derived from the running PoE process's Client.txt log.
 *  `areaLevel` is the zone's monster/loot level (1-100ish); `areaCode` is
 *  the internal GGG identifier (e.g. "MapWorldsAtoll", "1_1_1"). The main
 *  process is the source of truth; the renderer subscribes via the
 *  `zone-changed` IPC channel. Null whenever the player is in a town or
 *  hideout, or before the first zone event has fired. */
export interface Zone {
  areaLevel: number
  areaCode: string
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
  /**
   * Version rules that are known-bricked (stuck, unable to auto-update, etc.). Each entry
   * is either a bare version (exact match) or comparator-prefixed (`<`, `<=`, `>`, `>=`,
   * `=`). When the running version matches, the app surfaces a banner asking the user to
   * reinstall manually. Parsed by `versionMatches` in `shared/version-match.ts`.
   */
  brickedReleases?: string[]
  /** Optional message shown on the bricked-release banner. Falls back to a generic one. */
  brickedMessage?: string
}

export interface RegexPresetTag {
  text: string
  color: string
  source?: 'qualifier' | 'avoid' | 'want' | 'custom' | 'flask'
  sourceId?: string | number
}

export interface RegexPreset {
  id: string
  generator?: string
  tags: RegexPresetTag[]
  avoid: number[]
  want: number[]
  wantMode: 'any' | 'all'
  qualifiers: Record<string, number>
  /** Per-mod magnitude thresholds for waystones, keyed by mod id. Absent on
   *  non-waystone presets and on presets saved before magnitudes shipped. */
  wantValues?: Record<number, number>
  avoidValues?: Record<number, number>
  nightmare: boolean
  customRegex?: string
  /** Computed regex string (stored so main process can paste without rebuilding) */
  regex?: string
  selectedPrefix?: string[]
  selectedSuffix?: string[]
  flaskIlevel?: number
  flaskHighestOnly?: boolean
  flaskMatchBoth?: boolean
  flaskMatchOpen?: boolean
  flaskIgnoreEffectTiers?: boolean
}

export interface CheatSheet {
  id: string
  label?: string
  /** Filename extension stored separately from id so we can reconstruct the on-disk path. */
  ext: string
  /** Area codes from Client.txt that this sheet's zone matches. Populated
   *  only for prefab-imported sheets; user-uploaded sheets have no
   *  zone metadata. */
  areaCodes?: string[]
}

export interface CheatSheetCategory {
  id: string
  name: string
  hotkey: string
  sheets: CheatSheet[]
  /** Slug of the prefab pack this category was imported from (cheat-sheet-
   *  prefabs/<slug>/). Set on import; never set for user-created categories.
   *  Lets the Starter Packs UI know whether to still surface a pack as
   *  available - one prefab can only be imported once. */
  prefabSlug?: string
}

export interface OverlayAnchor {
  fracX: number
  fracY: number
  fracW: number
  fracH: number
}

export interface CheatSheetsSettings {
  globalHotkey: string
  categories: CheatSheetCategory[]
  windowAnchor?: OverlayAnchor
  /** True when the user has the pinned-zone mini-overlay enabled. */
  pinned?: boolean
  /** Anchor for the pinned-zone overlay window. The fracH is content-driven
   *  at runtime and may not match what's persisted here; only fracX/Y/W are
   *  authoritative across restarts. */
  pinnedAnchor?: OverlayAnchor
}

/** Adaptive price-check defaults learning engine mode. */
export type AdaptiveMode = 'eager' | 'conservative' | 'off'

export type TradePriceOption =
  | 'chaos_divine'
  | 'chaos_equivalent'
  | 'chaos'
  | 'divine'
  | 'exalted_divine'
  | 'exalted_equivalent'
  | 'exalted'

/** Legacy settings keys that existed before the profile system. Used only by
 *  migrateFromLegacy() to read one-time migration data from the electron-store. */
export interface LegacyAppSettings {
  filterPathPoe1?: string
  filterPathPoe2?: string
  filterDirPoe1?: string
  filterDirPoe2?: string
  leaguePoe1?: string
  leaguePoe2?: string
  tradePriceOptionPoe1?: TradePriceOption
  tradePriceOptionPoe2?: TradePriceOption
  cheatSheetsPoe1?: CheatSheetsSettings
  cheatSheetsPoe2?: CheatSheetsSettings
  regexPresetsPoe1?: RegexPreset[]
  regexPresetsPoe2?: RegexPreset[]
  filterPath?: string
  filterDir?: string
}

export interface AppSettings {
  /** Cached league lists fetched from the trade APIs at app launch. The settings
   *  + onboarding dropdowns prefer these when populated; falls back to the
   *  hardcoded list in shared/game-features.ts if a fetch never succeeded. */
  leaguesPoe1: string[]
  leaguesPoe2: string[]
  /** Epoch ms of the last successful league refresh. Used by refreshLeagues()
   *  to short-circuit the network call when the cooldown hasn't elapsed. */
  leaguesFetchedAt?: number
  hotkey: string
  priceCheckHotkey: string
  overlayOpacity: number
  overlayScale: number
  /** Which side the overlay mounts on when a new item is scanned. 'both' = based on
   *  cursor X (default); 'right'/'left' = always that side regardless of cursor. Drag
   *  behavior is unaffected; this only picks the mount side at scan time. */
  openSide: 'both' | 'right' | 'left'
  closeOnClickOutside: boolean
  /** When true, the FilterPanel re-evaluates the currently displayed item
   *  using the area level reported by the Client.txt log watcher instead
   *  of whatever the clipboard parser or defaultPoeItem produced. Toggled
   *  from a pill in the FilterPanel hero; only visible when the player is
   *  in a real drop zone (not town, not hideout). */
  useCurrentZoneAreaLevel: boolean
  reloadOnSave: boolean
  updateChannel: 'stable' | 'beta'
  tradeStatus: 'securable' | 'online' | 'available'
  /** Maps to PoE trade `trade_filters.collapse.option`. When true, the API groups
   *  multiple listings from the same seller into one row. */
  tradeCollapseListings?: boolean
  /** Volume (0.0-1.0) for the filter sound preview button. */
  previewVolume?: number
  /** Default "Listed" time for price-check searches. Empty string = any time. */
  tradeDefaultListedTime?:
    | ''
    | '1hour'
    | '3hours'
    | '12hours'
    | '1day'
    | '3days'
    | '1week'
    | '2weeks'
    | '1month'
    | '2months'
  /** How price-check trade results render. Default = one-at-a-time expandable rows;
   *  Open All = every row pre-expanded; Shrinkydink = compact rows (no icon, inline meta). */
  tradeResultsView?: 'default' | 'open-all' | 'shrinkydink'
  priceCheckDefaultPercent: number
  tradeDefaultToBase: boolean
  tradeKeepUncheckedVisible?: boolean
  tradeNeverAutoSearch?: boolean
  chatCommands: Array<{ hotkey: string; command: string; autoSubmit?: boolean; scope?: MacroScope }>
  appMacros: Array<{ action: string; hotkey: string; tag?: string; scope?: MacroScope }>
  stashScrollEnabled: boolean
  poeVersion: GameVariant
  /** Regex presets are persisted per game. Each session reads/writes the slot
   *  matching `poeVersion` -- the relaunch-on-switch flow guarantees the active
   *  version is stable for the lifetime of the process. */
  regexPresetsPoe1: RegexPreset[]
  regexPresetsPoe2: RegexPreset[]
  /** Title-bar tab keys the user has hidden. Toggleable from View settings.
   *  'settings' and 'close' are never hidden. */
  hiddenTabs?: HideableTabKey[]
  /** When true, enables developer tooling (e.g. Load unpacked plugin button). */
  developerMode?: boolean
  /** Optional override for the plugin registry URL. Defaults to the
   *  filterscalpel/scalpel-plugins-registry repo when undefined. Set to a
   *  file:// URL or a personal-repo raw URL for local plugin testing. */
  pluginRegistryUrl?: string
  /** Selected theme: a preset id from src/shared/theme/presets.ts, or
   *  'custom' to use customThemePalette. Global - not mirrored per game. */
  themeId: string
  /** User's saved custom palette, used only when themeId === 'custom'. */
  customThemePalette: ThemePalette | null
  /** Controls the adaptive price-check defaults learning engine. 'eager' applies
   *  learned defaults after a little evidence; 'conservative' needs more evidence
   *  before changing a default; 'off' stops applying learned defaults but keeps
   *  recording so re-enabling is never cold-start. */
  adaptiveDefaultsMode: AdaptiveMode
  /** Runtime-only: the active profile data, populated from the profile store.
   *  Never persisted to electron-store. Filter path, league, etc. are
   *  accessed via activeProfile.* instead of top-level settings fields. */
  /** UUID of the active profile (loaded from profiles/ dir). */
  activeProfileId: string
  /** Last explicitly activated profile for each game. Used when switching games. */
  lastProfileIdPoe1: string
  lastProfileIdPoe2: string
  /** When true, the app starts hidden in the system tray instead of opening
   *  the settings window. Ignored when onboarding hasn't been completed yet --
   *  first-run always shows the window so the user can configure the app. */
  startInTray: boolean
  /** Saved app-window position (top-left DIP coordinates). Written after the
   *  user moves the window so the next session can restore it. Invalid or
   *  off-screen positions are clamped to the nearest display. */
  appWindowPosition?: { x: number; y: number }
  /** True once the user completes the first-run onboarding wizard. */
  onboardingCompleted: boolean
  /** First-run onboarding resume: current step key (saved on every step transition). */
  onboardingStep?: string
  /** Legacy first-run resume: which games the user selected in the old setup flow. */
  onboardingSelectedGames?: { poe1: boolean; poe2: boolean }
  /** Legacy first-run resume: name of the online filter imported per game, if any. */
  onboardingImportedOnline?: { poe1: string | null; poe2: string | null }
}

/** Title-bar tab keys the user is allowed to hide via View settings. Settings + Close
 *  intentionally aren't here (always-on); Audit + Tools also aren't here (temp tabs
 *  that only render when actively viewed). The tuple is the runtime source of truth;
 *  the union type is derived from it so the two can never drift. */
export const HIDEABLE_TAB_KEYS = ['item', 'pricecheck', 'dust', 'divcards', 'regex'] as const
export type HideableTabKey = (typeof HIDEABLE_TAB_KEYS)[number]

/** Type guard for filtering persisted-settings input. Existing users may have stale
 *  values in `hiddenTabs` (e.g. `'audit'` from before that became a temp tab); filter
 *  through this so consumers downstream never see a phantom key. */
export function isHideableTabKey(k: string): k is HideableTabKey {
  return (HIDEABLE_TAB_KEYS as readonly string[]).includes(k)
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
  /** 7 daily percent-change entries vs baseline; index 6 is today.
   *  null entries mean no listings for that day. Optional because legacy
   *  cached data may lack it and the renderer must tolerate its absence. */
  graph?: (number | null)[]
  /** poe.ninja URL category segment for this entry (e.g. 'currency', 'breach-catalyst').
   *  Set from the source type at fetch time so the deep-link button can land on the
   *  correct category page instead of the generic /currency hub. PoE2 only. */
  ninjaCategory?: string
}

// ─── Item Search ────────────────────────────────────────────────────────────

/** A row surfaced in the item-search combobox. The main process assembles these from
 *  the active filter + live price data; the renderer decorates each row with an
 *  `iconUrl` after fetching. */
export interface SearchableItem {
  name: string
  baseType: string
  itemClass: string
  rarity: 'Unique' | 'Currency' | 'Gem'
  /** Minimal filter-block info the renderer reuses for `<LootLabel />` styling.
   *  The array is the full Continue chain that matches this item in filter order:
   *  zero or more Continue decorators first, ending with the primary non-Continue
   *  match. Renderer composes them so Continue overlays are reflected in the
   *  label preview. `null` when no block matches. */
  blocks: Array<{ visibility: 'Show' | 'Hide'; actions: FilterAction[]; continue: boolean }> | null
  /** Div-card reward text -- searchable and shown inline when the match came via reward. */
  reward?: string
  /** Explicit icon-map key when the display name doesn't match the iconMap key (e.g.
   *  Originator Map rows share the Map display name but render with a Zana Map icon). */
  iconKey?: string
  /** Extra flags that vary between rows sharing the same baseType (e.g. Originator
   *  Map rows set zanaMemory=true; regular Map rows at the same tier leave it unset). */
  flags?: { zanaMemory?: boolean }
}

// ─── Edit History ────────────────────────────────────────────────────────────

export interface HistoryEntry {
  id: number
  timestamp: number
  description: string
  /** The kind of edit that was made */
  action: 'block-edit' | 'tier-move' | 'stack-threshold' | 'strand-threshold'
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

/** Runtime-fetched manifest. Add new top-level keys here when adding new
 *  runtime-updatable data; the loader hands the whole object to consumers. */
export interface Manifest {
  ninjaLeagues: {
    poe1: Record<string, string>
    poe2: Record<string, string>
  }
  /** Maps a PoE2 ninja API type name (e.g. 'Breach', 'Essences') to the
   *  poe.ninja URL category segment (e.g. 'breach-catalyst', 'essences').
   *  Used to build correct deep-links from tagged price entries. */
  poe2NinjaCategories: Record<string, string>
}

export type AuthResult = { loggedIn: true; accountName: string } | { loggedIn: false }
