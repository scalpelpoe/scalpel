import type { MacroScope } from '../macro-scope'
import type { ThemePalette } from '../theme/palette'
import type { AppLocale, TradePriceOption, AdaptiveMode, AffixesPrechecked } from './core'
import type { CheatSheetsSettings, OverlayAnchor } from './overlay'
import type { RegexPreset } from './regex'
import type { PoeProfile } from './profiles'
import type { HideableTabKey } from './items'
import type { GameVariant } from './game-variant'
import type { RadialMenuSettings } from './radial'
import type { LauncherSliceMode, LauncherStyle } from '../launcher'

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
  leaguesPoe1: string[]
  leaguesPoe2: string[]
  leaguesFetchedAt?: number
  hotkey: string
  priceCheckHotkey: string
  launcherHotkey: string
  /** Radial tool launcher slice contents: names, icons, or both. Default `names`. */
  launcherSliceMode: LauncherSliceMode
  /** Launcher layout variant. Default `classic`. */
  launcherStyle: LauncherStyle
  overlayOpacity: number
  overlayScale: number
  openSide: 'both' | 'right' | 'left'
  closeOnClickOutside: boolean
  useCurrentZoneAreaLevel: boolean
  reloadOnSave: boolean
  updateChannel: 'stable' | 'beta' | 'experimental'
  tradeStatus: 'securable' | 'online' | 'available'
  tradeCollapseListings?: boolean
  previewVolume?: number
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
  tradeResultsView?: 'default' | 'open-all' | 'shrinkydink'
  priceCheckDefaultPercent: number
  tradeAffixesPrechecked: AffixesPrechecked
  tradePoe2CraftingReadyDefault?: boolean
  tradeKeepUncheckedVisible?: boolean
  tradeNeverAutoSearch?: boolean
  chatCommands: Array<{ hotkey: string; command: string; autoSubmit?: boolean; scope?: MacroScope }>
  appMacros: Array<{ action: string; hotkey: string; tag?: string; presetId?: string; scope?: MacroScope }>
  stashScrollEnabled: boolean
  stashScrollModifier?: 'Ctrl' | 'Shift' | 'Alt'
  poeVersion: GameVariant
  regexPresetsPoe1: RegexPreset[]
  regexPresetsPoe2: RegexPreset[]
  hiddenTabs?: HideableTabKey[]
  hiddenPluginTabIds?: string[]
  developerMode?: boolean
  pluginRegistryUrl?: string
  /** When true, opted-in: outdated registry plugins update silently in the
   *  background (curated registry only). Default false. */
  pluginAutoUpdate: boolean
  themeId: string
  customThemePalette: ThemePalette | null
  locale: AppLocale
  adaptiveDefaultsMode: AdaptiveMode
  activeProfileId: string
  lastProfileIdPoe1: string
  lastProfileIdPoe2: string
  startInTray: boolean
  appWindowPosition?: { x: number; y: number }
  /** Per-plugin overlay window geometry, keyed by plugin id. Written when the
   *  user moves or resizes a plugin's overlay window, read back when the plugin
   *  registers it. An absent entry means "use the plugin's declared default
   *  anchor". Top-level rather than profile-backed: window geometry is a
   *  per-machine preference, not part of a filter profile. */
  pluginOverlayAnchors?: Record<string, OverlayAnchor>
  /** Radial menu ring config. Top-level (not profile-backed): the ring is a
   *  per-machine input preference, like plugin overlay geometry. */
  radialMenu?: RadialMenuSettings
  onboardingCompleted: boolean
  onboardingStep?: string
  onboardingSelectedGames?: { poe1: boolean; poe2: boolean }
  onboardingImportedOnline?: { poe1: string | null; poe2: string | null }
  currencyLabelsAsText: boolean
}

// Spelled out instead of `NodeJS.Platform`: the plugin-sdk build compiles
// this file with `types: []` (no Node ambients in scope), so the namespace
// reference would fail to resolve there. Members mirror Node's Platform type.
export type NodePlatform =
  | 'aix'
  | 'android'
  | 'darwin'
  | 'freebsd'
  | 'haiku'
  | 'linux'
  | 'openbsd'
  | 'sunos'
  | 'win32'
  | 'cygwin'
  | 'netbsd'

export interface RuntimeSettings extends AppSettings {
  activeProfile: PoeProfile | null
  platform: NodePlatform
}
