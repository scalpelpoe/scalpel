import { describe, expect, it } from 'vitest'
import { buildRuneBaseFilter } from './rune-base'

// Minimal itemInfo shape matching the producer's type
function makeInfo(overrides: { baseType?: string; rarity?: string; itemClass?: string; quality?: number } = {}) {
  return {
    baseType: overrides.baseType ?? 'Faithful Leggings',
    rarity: overrides.rarity ?? 'Rare',
    itemClass: overrides.itemClass ?? 'Body Armours',
    quality: overrides.quality ?? 0,
  }
}

describe('buildRuneBaseFilter', () => {
  it('emits misc.rune_base with text "Runeforged" for a runeforged rare', () => {
    const filters = buildRuneBaseFilter(makeInfo({ baseType: 'Runeforged Faithful Leggings', rarity: 'Rare' }))
    expect(filters).toHaveLength(1)
    expect(filters[0].id).toBe('misc.rune_base')
    expect(filters[0].text).toBe('Runeforged')
    expect(filters[0].enabled).toBe(false)
    expect(filters[0].type).toBe('misc')
  })

  it('emits misc.rune_base enabled for a runemastered unique (targets the runemastered variant by default, issue #458)', () => {
    const filters = buildRuneBaseFilter(
      makeInfo({ baseType: 'Runemastered Veridical Chain', rarity: 'Unique', itemClass: 'Amulets' }),
    )
    expect(filters).toHaveLength(1)
    expect(filters[0].id).toBe('misc.rune_base')
    expect(filters[0].text).toBe('Runemastered')
    expect(filters[0].enabled).toBe(true)
  })

  it('emits nothing for a plain (non-rune) base', () => {
    const filters = buildRuneBaseFilter(makeInfo({ baseType: 'Faithful Leggings' }))
    expect(filters).toEqual([])
  })

  it('emits nothing for a gem item class', () => {
    const filters = buildRuneBaseFilter(
      makeInfo({ baseType: 'Runeforged Faithful Leggings', itemClass: 'Active Skill Gems' }),
    )
    expect(filters).toEqual([])
  })

  it('emits nothing for Maps item class', () => {
    const filters = buildRuneBaseFilter(makeInfo({ baseType: 'Runeforged Faithful Leggings', itemClass: 'Maps' }))
    expect(filters).toEqual([])
  })

  it('emits nothing for Stackable Currency item class', () => {
    const filters = buildRuneBaseFilter(
      makeInfo({ baseType: 'Runeforged Faithful Leggings', itemClass: 'Stackable Currency' }),
    )
    expect(filters).toEqual([])
  })

  it('returns empty array when itemInfo is undefined', () => {
    expect(buildRuneBaseFilter(undefined)).toEqual([])
  })
})
