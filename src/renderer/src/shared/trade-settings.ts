import type { AdaptiveMode, AffixesPrechecked, TimelessSearch } from '@shared/types'
import { TRADE_PRICE_OPTIONS, type TradePriceOption, type TradePriceOptionEntry } from '@shared/trade-price-options'
export type { AdaptiveMode, AffixesPrechecked }
export { defaultPriceOption, normalizePriceOption } from '@shared/trade-price-options'

export type ListedTime =
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

export const LISTED_TIME_OPTIONS: Array<{ value: ListedTime; label: string }> = [
  { value: '', label: 'Any time' },
  { value: '1hour', label: 'Past hour' },
  { value: '3hours', label: 'Past 3 hours' },
  { value: '12hours', label: 'Past 12 hours' },
  { value: '1day', label: 'Past day' },
  { value: '3days', label: 'Past 3 days' },
  { value: '1week', label: 'Past week' },
  { value: '2weeks', label: 'Past 2 weeks' },
  { value: '1month', label: 'Past month' },
  { value: '2months', label: 'Past 2 months' },
]

/** Alias of the shared contract type -- the catalog in @shared is the single
 *  source of truth for both the option list and the persisted value. */
export type PriceOption = TradePriceOption

/** The full buyout-currency list GGG offers for this game: the commonly-used
 *  options first, then the rest under an "Other currencies" `<optgroup>`. */
export function getPriceOptions(version: 1 | 2): ReadonlyArray<TradePriceOptionEntry> {
  return TRADE_PRICE_OPTIONS[version]
}

const PRIMARY_CURRENCY_SWAPS: Record<1 | 2, Record<string, PriceOption>> = {
  1: { 'Chaos Orb': 'divine', 'Divine Orb': 'chaos' },
  2: { 'Exalted Orb': 'divine', 'Divine Orb': 'exalted' },
}

export function primaryCurrencySwap(itemName: string, version: 1 | 2): PriceOption | null {
  return PRIMARY_CURRENCY_SWAPS[version][itemName] ?? null
}

export type StatusOption = 'securable' | 'online' | 'available'

export const STATUS_OPTIONS: Array<{ value: StatusOption; label: string }> = [
  { value: 'securable', label: 'Instant buyout' },
  { value: 'online', label: 'In-person' },
  { value: 'available', label: 'Both' },
]

export type ResultsView = 'default' | 'open-all' | 'shrinkydink'

export const RESULTS_VIEW_OPTIONS: Array<{ value: ResultsView; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'open-all', label: 'Open All' },
  { value: 'shrinkydink', label: 'Shrinkydink' },
]

export const ADAPTIVE_MODE_OPTIONS: Array<{ value: AdaptiveMode; label: string }> = [
  { value: 'eager', label: 'Eager' },
  { value: 'conservative', label: 'Conservative' },
  { value: 'off', label: 'Off (keeps learning quietly)' },
]

/** Trade default for how many affix rows arrive ticked on a fresh price check. The
 *  one-line descriptions ride in the labels -- the select box has no help text slot. */
export const AFFIXES_PRECHECKED_OPTIONS: Array<{ value: AffixesPrechecked; label: string }> = [
  { value: 'default', label: 'Default - Smart, best effort' },
  { value: 'base', label: 'Base - All unchecked' },
  { value: 'all', label: 'All - All checked' },
]

/** PoE1 Timeless Jewel chip a fresh price check opens on. */
export const TIMELESS_SEARCH_OPTIONS: Array<{ value: TimelessSearch; label: string }> = [
  { value: 'seed', label: 'Seed - Any leader' },
  { value: 'leader', label: 'Leader - Any seed' },
  { value: 'both', label: 'Both - Seed + leader' },
]
