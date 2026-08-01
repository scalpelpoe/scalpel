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

export type TradePriceOption =
  | 'chaos_divine'
  | 'chaos_equivalent'
  | 'chaos'
  | 'divine'
  | 'exalted_divine'
  | 'exalted_equivalent'
  | 'exalted'

export type AdaptiveMode = 'eager' | 'conservative' | 'off'
