import { describe, expect, it } from 'vitest'
import { buildScryingOrbFilters } from './scrying-orb'

// ScryingOrbItemInfo is module-private, so derive the fixture type from the
// signature rather than exporting it just for the test.
type ScryingInfo = NonNullable<Parameters<typeof buildScryingOrbFilters>[0]>

const orb = (over: Partial<ScryingInfo> = {}): ScryingInfo => ({
  baseType: 'Scrying Orb',
  scryingArea: 'Dunes',
  ...over,
})

describe('buildScryingOrbFilters', () => {
  it('returns nothing when there is no item info', () => {
    expect(buildScryingOrbFilters(undefined)).toEqual([])
  })

  it('returns nothing for another currency that happens to carry an area', () => {
    expect(buildScryingOrbFilters({ baseType: 'Chaos Orb', scryingArea: 'Dunes' })).toEqual([])
  })

  it('emits the area chip enabled by default', () => {
    expect(buildScryingOrbFilters(orb())).toEqual([
      { id: 'misc.scrying_area', text: 'Dunes', value: null, min: null, max: null, enabled: true, type: 'misc' },
    ])
  })

  it('emits no chip when the area was not parsed', () => {
    expect(buildScryingOrbFilters(orb({ scryingArea: undefined }))).toEqual([])
  })

  it('emits no chip for an area the trade API does not index', () => {
    // Better an all-areas search than a type the API rejects with a 400.
    expect(buildScryingOrbFilters(orb({ scryingArea: 'Wharf' }))).toEqual([])
  })
})
