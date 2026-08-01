import { afterEach, describe, expect, it } from 'vitest'
import { _setIndexedEndgameKeysForTests } from '../../endgame-filter-support'
import { buildChartFilters } from './charts'

// ChartItemInfo is module-private, so derive the fixture type from the
// signature rather than exporting it just for the test.
type ChartInfo = NonNullable<Parameters<typeof buildChartFilters>[0]>

const chart = (over: Partial<ChartInfo> = {}): ChartInfo => ({
  itemClass: 'Chart',
  chartZone: 'Sea Pillars',
  chartShape: 'Straight',
  mapQuantity: 20,
  ...over,
})

describe('buildChartFilters', () => {
  afterEach(() => _setIndexedEndgameKeysForTests(null))

  it('returns nothing for a non-chart item', () => {
    expect(buildChartFilters({ itemClass: 'Maps', mapQuantity: 20 })).toEqual([])
  })

  it('returns nothing when there is no item info', () => {
    expect(buildChartFilters(undefined)).toEqual([])
  })

  it('emits the zone chip enabled by default', () => {
    const zone = buildChartFilters(chart()).find((f) => f.id === 'misc.chart_zone')!

    expect(zone).toMatchObject({ id: 'misc.chart_zone', text: 'Sea Pillars', enabled: true, type: 'misc' })
  })

  it('emits no zone chip for a zone the trade API does not index', () => {
    const filters = buildChartFilters(chart({ chartZone: 'Atlantis' }))

    expect(filters.find((f) => f.id === 'misc.chart_zone')).toBeUndefined()
  })

  it('emits no zone chip when the zone was not parsed', () => {
    const filters = buildChartFilters(chart({ chartZone: undefined }))

    expect(filters.find((f) => f.id === 'misc.chart_zone')).toBeUndefined()
  })

  it('emits the quantity chip enabled with a 90% floor', () => {
    const iiq = buildChartFilters(chart()).find((f) => f.id === 'map.map_iiq')!

    expect(iiq).toMatchObject({ text: 'Quantity: +20%', value: 20, min: 18, max: null, enabled: true, type: 'map' })
  })

  it('emits no quantity chip when the chart has no quantity', () => {
    const filters = buildChartFilters(chart({ mapQuantity: undefined }))

    expect(filters.find((f) => f.id === 'map.map_iiq')).toBeUndefined()
  })

  it('suppresses the shape chip under the bundled allowlist', () => {
    const filters = buildChartFilters(chart())

    expect(filters.find((f) => f.id === 'map.chart_shape')).toBeUndefined()
  })

  it('emits the shape chip disabled once the key is allowlisted', () => {
    _setIndexedEndgameKeysForTests(['map.chart_shape'])

    const shape = buildChartFilters(chart()).find((f) => f.id === 'map.chart_shape')!

    expect(shape).toMatchObject({ text: 'Shape: Straight', option: '3', enabled: false, type: 'map' })
  })

  it('emits no shape chip for an unknown shape even when allowlisted', () => {
    _setIndexedEndgameKeysForTests(['map.chart_shape'])

    const filters = buildChartFilters(chart({ chartShape: 'Spiral' }))

    expect(filters.find((f) => f.id === 'map.chart_shape')).toBeUndefined()
  })
})
