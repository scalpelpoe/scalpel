import { describe, expect, it } from 'vitest'
import { DEFAULT_VENDOR_POE1_SETTINGS, type VendorPoe1Settings } from '@shared/data/regex/vendor-poe1-toggles'
import { regexGems } from '@shared/data/regex/vendor/gems/Generated.Gems.English'
import { generateVendorPoe1PresetTags } from './vendor-poe1-preset-tags'

function empty(): VendorPoe1Settings {
  return structuredClone(DEFAULT_VENDOR_POE1_SETTINGS)
}

describe('generateVendorPoe1PresetTags', () => {
  it('returns no tags for the empty selection', () => {
    expect(generateVendorPoe1PresetTags(empty())).toEqual([])
  })

  it('uses catalog labels for toggles', () => {
    const s = empty()
    s.links.any4 = true
    s.colors3.rrb = true
    s.weapon.axe = true
    expect(generateVendorPoe1PresetTags(s).map((t) => t.text)).toEqual(['Any 4-link', 'r-r-b', 'Axe'])
  })

  it('caps gem tags at three names plus an overflow marker', () => {
    const s = empty()
    s.gems = regexGems.tokens.slice(0, 5).map((t) => t.id)
    const texts = generateVendorPoe1PresetTags(s).map((t) => t.text)
    expect(texts).toHaveLength(4)
    expect(texts[3]).toBe('+2 gems')
    // gem names render with any '|' separator replaced by a space
    for (const text of texts.slice(0, 3)) expect(text).not.toContain('|')
  })
})
