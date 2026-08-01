import { describe, expect, it } from 'vitest'
import { generateRarityRegex } from './rarity-regex'

describe('generateRarityRegex', () => {
  it('returns null for none or all selected', () => {
    expect(generateRarityRegex({ normal: false, magic: false, rare: false })).toBeNull()
    expect(generateRarityRegex({ normal: true, magic: true, rare: true })).toBeNull()
  })
  it('single selection emits a bare letter', () => {
    expect(generateRarityRegex({ normal: true, magic: false, rare: false })).toBe('"y: n"')
    expect(generateRarityRegex({ normal: false, magic: false, rare: true })).toBe('"y: r"')
  })
  it('multi selection groups with pipes', () => {
    expect(generateRarityRegex({ normal: true, magic: true, rare: false })).toBe('"y: (n|m)"')
    expect(generateRarityRegex({ normal: false, magic: true, rare: true })).toBe('"y: (m|r)"')
  })
})
