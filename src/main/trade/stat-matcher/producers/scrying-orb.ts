import { SCRYING_ORB_AREAS } from '@shared/data/trade/scrying-orbs'
import type { StatFilter } from '../../trade'

type ScryingOrbItemInfo = {
  baseType?: string
  scryingArea?: string
}

// Scrying Orb map-area chip (misc.scrying_area). The trade API indexes each
// area as its own type + discriminator, so the area -- not the base -- is the
// market segment, and the chip defaults on the way the chart-zone one does.
// Switching it off widens the search to the bare "Scrying Orb" type (all areas).
// An area missing from SCRYING_ORB_AREAS emits nothing: trade.ts would have no
// entry to resolve, and the all-areas search beats sending a type the API
// rejects.
export function buildScryingOrbFilters(itemInfo: ScryingOrbItemInfo | undefined): StatFilter[] {
  if (!itemInfo || itemInfo.baseType !== 'Scrying Orb') return []
  if (!itemInfo.scryingArea || !SCRYING_ORB_AREAS[itemInfo.scryingArea]) return []

  return [
    {
      id: 'misc.scrying_area',
      text: itemInfo.scryingArea,
      value: null,
      min: null,
      max: null,
      enabled: true,
      type: 'misc',
    },
  ]
}
