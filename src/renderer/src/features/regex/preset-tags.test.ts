import { describe, it, expect } from 'vitest'
import { generatePresetTags } from './preset-tags'
import { MAP_MODS, DANGER_COLORS } from '@shared/data/regex/map-mods'
import { DEFAULT_MAP_STATE } from '@shared/data/regex/map-state'
import { TAB_COLORS } from './mapmods-helpers'

/** Pick a real mod ID from each category so danger-color assertions stay in sync with
 *  whatever the upstream data file says today. */
const firstLethalId = MAP_MODS.find((m) => m.danger === 'lethal')!.id
const firstBeneficialId = MAP_MODS.find((m) => m.danger === 'beneficial')!.id

describe('generatePresetTags', () => {
  it('returns no tags for an empty state', () => {
    expect(generatePresetTags({ avoid: new Set(), want: new Set(), qualifiers: {} })).toEqual([])
  })

  it('skips qualifiers with zero or null values', () => {
    expect(
      generatePresetTags({
        avoid: new Set(),
        want: new Set(),
        qualifiers: { quantity: 0, packsize: null as unknown as number },
      }),
    ).toEqual([])
  })

  it('emits a qualifier tag with the "N label" format when value > 0', () => {
    const tags = generatePresetTags({ avoid: new Set(), want: new Set(), qualifiers: { quantity: 70 } })
    expect(tags).toHaveLength(1)
    expect(tags[0]).toMatchObject({
      text: '70 atlas',
      source: 'qualifier',
      sourceId: 'quantity',
    })
  })

  it("emits avoid tags colored by the mod's danger level", () => {
    const tags = generatePresetTags({ avoid: new Set([firstLethalId]), want: new Set(), qualifiers: {} })
    expect(tags).toHaveLength(1)
    expect(tags[0].source).toBe('avoid')
    expect(tags[0].sourceId).toBe(firstLethalId)
    expect(tags[0].color).toBe(DANGER_COLORS.lethal)
  })

  it("emits want tags colored by the mod's danger level", () => {
    const tags = generatePresetTags({ avoid: new Set(), want: new Set([firstBeneficialId]), qualifiers: {} })
    expect(tags).toHaveLength(1)
    expect(tags[0].source).toBe('want')
    expect(tags[0].sourceId).toBe(firstBeneficialId)
    expect(tags[0].color).toBe(DANGER_COLORS.beneficial)
  })

  it('returns "unknown" text for mod IDs not present in MAP_MODS', () => {
    // Choose an ID that can't realistically collide with a real mod.
    const ghostId = 999_999_999
    const tags = generatePresetTags({ avoid: new Set([ghostId]), want: new Set(), qualifiers: {} })
    expect(tags[0].text).toBe('unknown')
  })

  it('concatenates qualifier, avoid, and want tags in that order', () => {
    const tags = generatePresetTags({
      avoid: new Set([firstLethalId]),
      want: new Set([firstBeneficialId]),
      qualifiers: { quantity: 100 },
    })
    expect(tags.map((t) => t.source)).toEqual(['qualifier', 'avoid', 'want'])
  })

  it('emits no map-state tags when mapState is omitted or all-default', () => {
    expect(generatePresetTags({ avoid: new Set(), want: new Set(), qualifiers: {} })).toEqual([])
    expect(
      generatePresetTags({ avoid: new Set(), want: new Set(), qualifiers: {}, mapState: DEFAULT_MAP_STATE }),
    ).toEqual([])
  })

  it('emits a want-colored rarity tag for an included partial selection', () => {
    const tags = generatePresetTags({
      avoid: new Set(),
      want: new Set(),
      qualifiers: {},
      mapState: { ...DEFAULT_MAP_STATE, rarityRare: true, rarityInclude: true },
    })
    expect(tags).toEqual([
      { text: 'rare maps', color: TAB_COLORS.want, source: 'qualifier', sourceId: 'map-state-rarity' },
    ])
  })

  it('emits an avoid-colored, negated, multi-label rarity tag for an excluded partial selection', () => {
    const tags = generatePresetTags({
      avoid: new Set(),
      want: new Set(),
      qualifiers: {},
      mapState: { ...DEFAULT_MAP_STATE, rarityNormal: true, rarityMagic: true, rarityInclude: false },
    })
    expect(tags).toEqual([
      { text: '!normal+magic maps', color: TAB_COLORS.avoid, source: 'qualifier', sourceId: 'map-state-rarity' },
    ])
  })

  it('emits a rarity tag for all-three-excluded but not all-three-included', () => {
    const excluded = generatePresetTags({
      avoid: new Set(),
      want: new Set(),
      qualifiers: {},
      mapState: { ...DEFAULT_MAP_STATE, rarityNormal: true, rarityMagic: true, rarityRare: true, rarityInclude: false },
    })
    expect(excluded).toEqual([
      {
        text: '!normal+magic+rare maps',
        color: TAB_COLORS.avoid,
        source: 'qualifier',
        sourceId: 'map-state-rarity',
      },
    ])

    const included = generatePresetTags({
      avoid: new Set(),
      want: new Set(),
      qualifiers: {},
      mapState: { ...DEFAULT_MAP_STATE, rarityNormal: true, rarityMagic: true, rarityRare: true, rarityInclude: true },
    })
    expect(included).toEqual([])
  })

  it('emits corrupted and unidentified tags with include/exclude text and coloring', () => {
    const includeBoth = generatePresetTags({
      avoid: new Set(),
      want: new Set(),
      qualifiers: {},
      mapState: { ...DEFAULT_MAP_STATE, corrupted: 'include', unidentified: 'include' },
    })
    expect(includeBoth).toEqual([
      { text: 'corrupted', color: TAB_COLORS.want, source: 'qualifier', sourceId: 'map-state-corrupted' },
      { text: 'unid', color: TAB_COLORS.want, source: 'qualifier', sourceId: 'map-state-unidentified' },
    ])

    const excludeBoth = generatePresetTags({
      avoid: new Set(),
      want: new Set(),
      qualifiers: {},
      mapState: { ...DEFAULT_MAP_STATE, corrupted: 'exclude', unidentified: 'exclude' },
    })
    expect(excludeBoth).toEqual([
      { text: '!corrupted', color: TAB_COLORS.avoid, source: 'qualifier', sourceId: 'map-state-corrupted' },
      { text: '!unid', color: TAB_COLORS.avoid, source: 'qualifier', sourceId: 'map-state-unidentified' },
    ])
  })

  it('places map-state tags after qualifier tags and before avoid/want tags', () => {
    const tags = generatePresetTags({
      avoid: new Set([firstLethalId]),
      want: new Set([firstBeneficialId]),
      qualifiers: { quantity: 100 },
      mapState: { ...DEFAULT_MAP_STATE, corrupted: 'include' },
    })
    expect(tags.map((t) => t.sourceId)).toEqual(['quantity', 'map-state-corrupted', firstLethalId, firstBeneficialId])
  })
})
