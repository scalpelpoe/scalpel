export type AppLocale = 'en' | 'es' | 'de'

export type ItemRarity = 'Normal' | 'Magic' | 'Rare' | 'Unique' | 'Gem' | 'Currency'

export type Visibility = 'Show' | 'Hide' | 'Minimal'

export type ComparisonOperator = '>' | '>=' | '=' | '==' | '<=' | '<'

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

export type ConditionResult = 'pass' | 'fail' | 'unknown'

/** Derived from the buyout-currency catalog so the option list and the
 *  persisted type can't drift apart. */
export type { TradePriceOption } from '../trade-price-options'

export type AdaptiveMode = 'eager' | 'conservative' | 'off'

/** Price-check "Affixes prechecked" trade default: 'default' = the producer's smart
 *  best-effort state, 'base' = every affix unticked, 'all' = every affix ticked. */
export type AffixesPrechecked = 'default' | 'base' | 'all'

/** PoE1 Timeless Jewel chip a price check opens on: 'seed' = the seed under any of
 *  the jewel's leaders, 'leader' = the jewel's own leader at any seed, 'both' = seed + leader. */
export type TimelessSearch = 'seed' | 'leader' | 'both'
