import type { ExchangeDetails } from './exchange'

/** What the price-check tab sends main to resolve a unique's tracked line. */
export interface UniqueTrackerQuery {
  /** Full display name, Foulborn prefix included -- ninja lists those separately. */
  name: string
  baseType: string
  /** Implicit + explicit lines, used to pick between same-name variants
   *  (Foulborn mutations, flask counts) when ninja lists more than one. */
  modText: string[]
  /** Largest linked group. Picks the 5L/6L line for links; the tracker
   *  ignores it and always charts the unlinked line. */
  linkedSockets?: number
}

/** League price history of a unique's UNLINKED ninja line. Reuses the exchange
 *  shape so the same chart and pair switch render it; `volume` on each point is
 *  the day's listing count rather than traded volume. */
export interface UniqueTrackerDetails extends ExchangeDetails {
  /** ninja's variant label for the tracked line ("Living Lightning", "5 Flasks"),
   *  absent when the unique has only one unlinked line. */
  variant?: string
  /** poe.ninja page for exactly the tracked line, when it resolved. */
  ninjaUrl?: string
}
