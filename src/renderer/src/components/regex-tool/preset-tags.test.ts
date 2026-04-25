import { describe, it, expect } from 'vitest'
import { generatePresetTags } from './preset-tags'
import { MAP_MODS, DANGER_COLORS } from '../../../../shared/data/regex/map-mods'

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
      text: '70 quant',
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
})
