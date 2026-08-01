import { CHART_SHAPE_OPTIONS, CHART_ZONES } from '@shared/data/trade/charts'
import { isEndgameFilterIndexed } from '../../endgame-filter-support'
import type { StatFilter } from '../../trade'
import { MAP_MIN } from './maps'

type ChartItemInfo = {
  itemClass?: string
  chartZone?: string
  chartShape?: string
  mapQuantity?: number
}

// Chart chips: zone (misc.chart_zone), Item Quantity (map.map_iiq) and shape
// (map.chart_shape). Returns an empty array for anything that is not a chart.
export function buildChartFilters(itemInfo: ChartItemInfo | undefined): StatFilter[] {
  if (!itemInfo || itemInfo.itemClass !== 'Chart') return []

  const out: StatFilter[] = []

  // The trade API indexes each chart zone as its own type + discriminator, so
  // the zone -- not the base -- is the primary market segment. Default on, the
  // way the base-type chip is for tablets. A zone missing from CHART_ZONES emits
  // nothing: trade.ts would have no entry to resolve, and falling back to a
  // base-type search beats sending a type the API rejects.
  if (itemInfo.chartZone && CHART_ZONES[itemInfo.chartZone]) {
    out.push({
      id: 'misc.chart_zone',
      text: itemInfo.chartZone,
      value: null,
      min: null,
      max: null,
      enabled: true,
      type: 'misc',
    })
  }

  // Gated on the value, not on rarity: unlike PoE1 rare maps, a Magic chart
  // carries an augmented Item Quantity roll.
  if (itemInfo.mapQuantity) {
    out.push({
      id: 'map.map_iiq',
      text: `Quantity: +${itemInfo.mapQuantity}%`,
      value: itemInfo.mapQuantity,
      min: MAP_MIN(itemInfo.mapQuantity),
      max: null,
      enabled: true,
      type: 'map',
    })
  }

  // chart_shape is live in the trade filter metadata but a 2026-07-27 probe
  // returned zero results for every option tried, so GGG is not indexing it yet.
  // The chip stays behind the remote-overridable allowlist (map.chart_shape is
  // deliberately absent from the bundled indexedKeys) -- a push to main turns it
  // on for everyone once a re-probe confirms it works, with no app release.
  const shapeOption = itemInfo.chartShape ? CHART_SHAPE_OPTIONS[itemInfo.chartShape] : undefined
  if (shapeOption && isEndgameFilterIndexed('map.chart_shape')) {
    out.push({
      id: 'map.chart_shape',
      text: `Shape: ${itemInfo.chartShape}`,
      value: null,
      min: null,
      max: null,
      enabled: false,
      type: 'map',
      option: shapeOption,
    })
  }

  return out
}
