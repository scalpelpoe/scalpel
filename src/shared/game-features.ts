/** Per-version feature flags for UI divergence between Path of Exile and Path of
 *  Exile 2. Add a new entry here when a feature doesn't apply to both games --
 *  consumers should read `features.foo` rather than branching on `poeVersion === 2`
 *  so the "what each game supports" question stays answerable from this file alone.
 *
 *  Rule of thumb: put a flag here when the renderer needs to hide/gate UI. Data
 *  that the main process can simply omit (e.g. dust values on PoE2 items) doesn't
 *  need a flag -- the renderer's existing "if the data is there, render it" checks
 *  already handle that case naturally. */
export interface GameFeatures {
  /** Thaumaturgic dust explorer + the "Explore" chip shown next to dust values. */
  dustExplorer: boolean
  /** Divination card explorer + the "Explore" chip shown on div-card items. */
  divCards: boolean
  /** Socket recolor tool + the "Recolor" chip on items with sockets. */
  socketRecolor: boolean
  /** Regex generator tab in the overlay's tool tray. */
  regexTool: boolean
  /** Baseline currency for the bulk-exchange "pay with" choice when the item
   *  isn't priced in divines. PoE1's PriceInfo.chaosValue is denominated in
   *  chaos; PoE2 reuses the same field for exalted, so the currency we offer
   *  to pay with has to follow suit. */
  bulkBaselineCurrency: 'chaos' | 'exalted'
  /** Which "Recommended trader" banner to render on a price-check result --
   *  Faustus on PoE1, Ange on PoE2 (same shape, different bulk-exchange
   *  eligibility lists per game). */
  bulkExchangeBanner: 'faustus' | 'ange'
  /** League options for the settings dropdown, in the order they appear. */
  leagues: readonly string[]
  /** Path hint shown under an empty filter picker. */
  filterFolderHint: string
}

import type { GameVariant } from './types'

const FEATURES_BY_VERSION: Record<GameVariant, GameFeatures> = {
  1: {
    dustExplorer: true,
    divCards: true,
    socketRecolor: true,
    regexTool: true,
    bulkBaselineCurrency: 'chaos',
    bulkExchangeBanner: 'faustus',
    leagues: ['Mirage', 'Hardcore Mirage', 'Standard', 'Hardcore'],
    filterFolderHint: 'Documents\\My Games\\Path of Exile',
  },
  2: {
    dustExplorer: false,
    divCards: false,
    socketRecolor: false,
    regexTool: true,
    bulkBaselineCurrency: 'exalted',
    bulkExchangeBanner: 'ange',
    leagues: ['Fate of the Vaal', 'HC Fate of the Vaal', 'Standard', 'Hardcore'],
    filterFolderHint: 'Documents\\My Games\\Path of Exile 2',
  },
}

/** Pure lookup -- when `version` is null (initial load, detection race) we fall
 *  back to PoE1 since that's the default-attached game. */
export function getGameFeatures(version: GameVariant | null): GameFeatures {
  return FEATURES_BY_VERSION[version ?? 1]
}
