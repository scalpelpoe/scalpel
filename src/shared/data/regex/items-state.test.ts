import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ITEMS_STATE,
  isRareOnlyClass,
  rareModKey,
  rareModKeyDesc,
  sanitizeItemsState,
  searchItemBases,
  searchItemClasses,
} from './items-state'

describe('sanitizeItemsState', () => {
  it('returns defaults for junk', () => {
    expect(sanitizeItemsState(null)).toEqual(DEFAULT_ITEMS_STATE)
    expect(sanitizeItemsState('nope')).toEqual(DEFAULT_ITEMS_STATE)
    expect(sanitizeItemsState(42)).toEqual(DEFAULT_ITEMS_STATE)
  })

  it('round-trips a full valid state', () => {
    const state = {
      itembase: { baseType: 'Daggers', item: 'Glass Shank' },
      rarity: 'Magic' as const,
      rareMatchMode: 'any' as const,
      magicBothAffixes: true,
      magicOpenAffix: true,
      selectedRareMods: { 'Daggers-prefix-Adds # to # Chaos Damage': { values: { 0: '5', 1: '' } } },
      selectedMagicMods: [
        {
          basetype: 'Daggers',
          category: 'prefix',
          affixName: 'Damage Penetrates (5-7)% Fire Resistance',
          affixDesc: 'Subterranean',
          affix: 'PREFIX' as const,
        },
      ],
    }
    expect(sanitizeItemsState(state)).toEqual(state)
  })

  it('drops malformed entries field-by-field over defaults', () => {
    const s = sanitizeItemsState({
      itembase: { baseType: '', item: 'x' },
      rarity: 'Legendary',
      rareMatchMode: 'sometimes',
      magicBothAffixes: 'yes',
      selectedRareMods: { good: { values: { 0: '5', 1: 7, bad: 'x' } }, junk: null },
      selectedMagicMods: [{ basetype: 'Daggers' }, 'junk'],
    })
    expect(s.itembase).toBeNull()
    expect(s.rarity).toBe('Rare')
    expect(s.rareMatchMode).toBe('all')
    expect(s.magicBothAffixes).toBe(false)
    expect(s.selectedRareMods).toEqual({ good: { values: { 0: '5' } } })
    expect(s.selectedMagicMods).toEqual([])
  })

  it('drops __proto__/constructor keys in selectedRareMods instead of clobbering the prototype', () => {
    const payload = JSON.parse(
      '{"selectedRareMods":{"__proto__":{"values":{"0":"5"}},"constructor":{"values":{}},"ok":{"values":{"0":"1"}}}}',
    )
    const s = sanitizeItemsState(payload)
    expect(Object.getPrototypeOf(s.selectedRareMods)).toBe(Object.prototype)
    expect(Object.keys(s.selectedRareMods)).toEqual(['ok'])
  })

  it('ignores empty-string and non-canonical value keys instead of mapping them to index 0', () => {
    const s = sanitizeItemsState({ selectedRareMods: { ok: { values: { '': 'x', ' 1 ': 'y', '2': 'z' } } } })
    expect(s.selectedRareMods.ok.values).toEqual({ 2: 'z' })
  })
})

describe('base catalog search', () => {
  it('searchItemClasses filters case-insensitively and returns all on empty query', () => {
    expect(searchItemClasses('')).toContain('Daggers')
    expect(searchItemClasses('dagger')).toEqual(expect.arrayContaining(['Daggers', 'Rune Daggers']))
    expect(searchItemClasses('dagger')).not.toContain('Bows')
  })

  it('classes are sorted alphabetically', () => {
    const all = searchItemClasses('')
    expect(all).toEqual([...all].sort((a, b) => a.localeCompare(b)))
  })

  it('searchItemBases matches item or class name and respects the cap', () => {
    const hits = searchItemBases('glass shank')
    expect(hits).toEqual([{ baseType: 'Daggers', item: 'Glass Shank' }])
    expect(searchItemBases('e', 10)).toHaveLength(10)
  })

  it('searchItemBases excludes [UNUSED] and [DO NOT USE] placeholder items', () => {
    expect(searchItemBases('UNUSED')).toEqual([])
    expect(searchItemBases('DO NOT USE')).toEqual([])
  })

  it('isRareOnlyClass flags exactly the heist classes (upstream parity: contains "heist")', () => {
    expect(isRareOnlyClass('Heist Gear')).toBe(true)
    expect(isRareOnlyClass('Heist Brooches')).toBe(true)
    expect(isRareOnlyClass('Contracts')).toBe(false)
    expect(isRareOnlyClass('Daggers')).toBe(false)
  })
})

describe('rare mod keys', () => {
  it('round-trips desc through the upstream key shape', () => {
    const key = rareModKey('Daggers', 'prefix', 'Adds # to # Chaos Damage')
    expect(key).toBe('Daggers-prefix-Adds # to # Chaos Damage')
    expect(rareModKeyDesc(key, 'Daggers')).toBe('Adds # to # Chaos Damage')
  })

  it('desc extraction survives hyphens in the desc itself', () => {
    const key = rareModKey('Rings', 'suffix_elder', '#% increased Attack Speed - something')
    expect(rareModKeyDesc(key, 'Rings')).toBe('#% increased Attack Speed - something')
  })
})
