/**
 * Shared option lists for the per-search "Settings" chip dropdowns in the price checker.
 * These are kept in one place so the labels + backend values don't drift apart.
 */

/** PoE trade `trade_filters.indexed.option` values. Empty string = "any time" (no filter). */
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

/** PoE trade `trade_filters.price.option` values. Exalted replaces chaos as the
 *  baseline currency option in PoE2 (it's the low-tier economy unit there). The
 *  `*_equivalent` variants bypass the API's price filter and do the conversion
 *  client-side -- see trade.ts for the branch that skips the option field. */
export type PriceOption =
  | 'chaos_divine'
  | 'chaos_equivalent'
  | 'chaos'
  | 'divine'
  | 'exalted_divine'
  | 'exalted_equivalent'
  | 'exalted'

const PRICE_OPTIONS_POE1: Array<{ value: PriceOption; label: string }> = [
  { value: 'chaos_divine', label: 'Chaos or Divine' },
  { value: 'chaos_equivalent', label: 'Chaos equivalent' },
  { value: 'chaos', label: 'Chaos only' },
  { value: 'divine', label: 'Divine only' },
]

const PRICE_OPTIONS_POE2: Array<{ value: PriceOption; label: string }> = [
  { value: 'exalted_divine', label: 'Exalted or Divine' },
  { value: 'exalted_equivalent', label: 'Exalted equivalent' },
  { value: 'exalted', label: 'Exalted only' },
  { value: 'divine', label: 'Divine only' },
  { value: 'chaos', label: 'Chaos only' },
]

export function getPriceOptions(version: 1 | 2): Array<{ value: PriceOption; label: string }> {
  return version === 2 ? PRICE_OPTIONS_POE2 : PRICE_OPTIONS_POE1
}

/** When price-checking a primary-currency item, return the OTHER primary
 *  currency so listings show a meaningful exchange rate instead of "Divine
 *  Orb listed for Divine Orbs". Returns null for non-primary items. */
const PRIMARY_CURRENCY_SWAPS: Record<1 | 2, Record<string, PriceOption>> = {
  1: { 'Chaos Orb': 'divine', 'Divine Orb': 'chaos' },
  2: { 'Exalted Orb': 'divine', 'Divine Orb': 'exalted' },
}

export function primaryCurrencySwap(itemName: string, version: 1 | 2): PriceOption | null {
  return PRIMARY_CURRENCY_SWAPS[version][itemName] ?? null
}

/**
 * Trade-listings mode. Maps to PoE trade `status.option`:
 *  - `securable` -> Instant buyout only
 *  - `online`    -> Priced for in-person trade (all listed, including instant)
 *  - `available` -> Both
 */
export type StatusOption = 'securable' | 'online' | 'available'

export const STATUS_OPTIONS: Array<{ value: StatusOption; label: string }> = [
  { value: 'securable', label: 'Instant buyout' },
  { value: 'online', label: 'In-person' },
  { value: 'available', label: 'Both' },
]

/** How trade-result rows render. */
export type ResultsView = 'default' | 'open-all' | 'shrinkydink'

export const RESULTS_VIEW_OPTIONS: Array<{ value: ResultsView; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'open-all', label: 'Open All' },
  { value: 'shrinkydink', label: 'Shrinkydink' },
]

import type { AdaptiveMode } from '../../../../shared/types'
export type { AdaptiveMode }

export const ADAPTIVE_MODE_OPTIONS: Array<{ value: AdaptiveMode; label: string }> = [
  { value: 'eager', label: 'Eager' },
  { value: 'conservative', label: 'Conservative' },
  { value: 'off', label: 'Off (keeps learning quietly)' },
]
