import type { MacroScope } from '../macro-scope'
import type { ThemePalette } from '../theme/palette'
import type { AppLocale, TradePriceOption, AdaptiveMode } from './core'
import type { CheatSheetsSettings } from './overlay'
import type { RegexPreset } from './regex'
import type { PoeProfile } from './profiles'
import type { HideableTabKey } from './items'
import type { GameVariant } from './game-variant'

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
  tradeDefaultToBase: boolean
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
  themeId: string
  customThemePalette: ThemePalette | null
  locale: AppLocale
  adaptiveDefaultsMode: AdaptiveMode
  activeProfileId: string
  lastProfileIdPoe1: string
  lastProfileIdPoe2: string
  startInTray: boolean
  appWindowPosition?: { x: number; y: number }
  onboardingCompleted: boolean
  onboardingStep?: string
  onboardingSelectedGames?: { poe1: boolean; poe2: boolean }
  onboardingImportedOnline?: { poe1: string | null; poe2: string | null }
  currencyLabelsAsText: boolean
}

export interface RuntimeSettings extends AppSettings {
  activeProfile: PoeProfile | null
  platform: NodeJS.Platform
}
