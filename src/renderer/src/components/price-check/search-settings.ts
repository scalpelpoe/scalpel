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

/** PoE trade `trade_filters.price.option` values. */
export type PriceOption = 'chaos_divine' | 'chaos_equivalent' | 'chaos' | 'divine'

export const PRICE_OPTIONS: Array<{ value: PriceOption; label: string }> = [
  { value: 'chaos_divine', label: 'Chaos or Divine' },
  { value: 'chaos_equivalent', label: 'Chaos equivalent' },
  { value: 'chaos', label: 'Chaos only' },
  { value: 'divine', label: 'Divine only' },
]

/**
 * Trade-listings mode. Maps to PoE trade `status.option`:
 *  - `securable` -> Instant buyout only
 *  - `online`    -> Priced for in-person trade (all listed, including instant)
 *  - `any`       -> Both
 */
export type StatusOption = 'securable' | 'online' | 'any'

export const STATUS_OPTIONS: Array<{ value: StatusOption; label: string }> = [
  { value: 'securable', label: 'Instant buyout' },
  { value: 'online', label: 'In-person' },
  { value: 'any', label: 'Both' },
]

/** How trade-result rows render. */
export type ResultsView = 'default' | 'open-all' | 'shrinkydink'

export const RESULTS_VIEW_OPTIONS: Array<{ value: ResultsView; label: string }> = [
  { value: 'default', label: 'Default' },
  { value: 'open-all', label: 'Open All' },
  { value: 'shrinkydink', label: 'Shrinkydink' },
]
