import { describe, expect, it } from 'vitest'
import { hasGeneratedName, splitRuneTier } from './poe-item'

describe('splitRuneTier', () => {
  it('splits a Runeforged prefix from the base name', () => {
    expect(splitRuneTier('Runeforged Faithful Leggings')).toEqual({
      tier: 'Runeforged',
      bare: 'Faithful Leggings',
    })
  })

  it('splits a Runemastered prefix from the base name', () => {
    expect(splitRuneTier('Runemastered Veridical Chain')).toEqual({
      tier: 'Runemastered',
      bare: 'Veridical Chain',
    })
  })

  it('returns null tier for a plain base (no rune prefix)', () => {
    expect(splitRuneTier('Faithful Leggings')).toEqual({
      tier: null,
      bare: 'Faithful Leggings',
    })
  })

  it('returns null tier for an empty string, bare equals input', () => {
    expect(splitRuneTier('')).toEqual({ tier: null, bare: '' })
  })

  it('does not match partial prefix (e.g. just the word "Runeforged" alone)', () => {
    // No trailing base -- the regex requires at least one char after the space
    expect(splitRuneTier('Runeforged')).toEqual({ tier: null, bare: 'Runeforged' })
  })

  it('is case-sensitive -- lowercase prefix returns null tier', () => {
    expect(splitRuneTier('runeforged Faithful Leggings')).toEqual({
      tier: null,
      bare: 'runeforged Faithful Leggings',
    })
  })
})

describe('hasGeneratedName', () => {
  it('is true for Magic', () => {
    expect(hasGeneratedName('Magic')).toBe(true)
  })

  it('is true for Rare', () => {
    expect(hasGeneratedName('Rare')).toBe(true)
  })

  it('is false for Normal', () => {
    expect(hasGeneratedName('Normal')).toBe(false)
  })

  it('is false for Unique', () => {
    expect(hasGeneratedName('Unique')).toBe(false)
  })

  it('is false for Currency', () => {
    expect(hasGeneratedName('Currency')).toBe(false)
  })

  it('is false for Gem', () => {
    expect(hasGeneratedName('Gem')).toBe(false)
  })

  it('is false for undefined', () => {
    expect(hasGeneratedName(undefined)).toBe(false)
  })
})
