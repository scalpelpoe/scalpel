import { describe, it, expect } from 'vitest'
import { generateVendorPresetTags } from './vendor-preset-tags'
import { DEFAULT_VENDOR_SETTINGS } from '@shared/data/regex/vendor-toggles'

describe('generateVendorPresetTags', () => {
  it('returns no tags for the empty default', () => {
    expect(generateVendorPresetTags(DEFAULT_VENDOR_SETTINGS)).toEqual([])
  })

  it('emits one tag per active toggle, using the catalog label', () => {
    const s = structuredClone(DEFAULT_VENDOR_SETTINGS)
    s.itemMods.elemental = true
    s.itemClass.bows = true
    const tags = generateVendorPresetTags(s)
    const texts = tags.map((t) => t.text)
    expect(texts).toContain('Elemental damage')
    expect(texts).toContain('Bows')
    expect(tags.every((t) => t.source === 'qualifier')).toBe(true)
  })

  it('emits level-range tags when ranges are set', () => {
    const s = structuredClone(DEFAULT_VENDOR_SETTINGS)
    s.itemLevel = { min: 65, max: 84 }
    s.characterLevel = { min: 1, max: 12 }
    const texts = generateVendorPresetTags(s).map((t) => t.text)
    expect(texts).toContain('iLvl 65-84')
    expect(texts).toContain('cLvl 1-12')
  })
})
