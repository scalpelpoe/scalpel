import type { TradePriceOption } from './core'
import type { CheatSheetsSettings } from './overlay'
import type { RegexPreset } from './regex'
import type { GameVariant } from './game-variant'

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
