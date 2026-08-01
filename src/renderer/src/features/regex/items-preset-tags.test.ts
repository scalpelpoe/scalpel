import { describe, expect, it } from 'vitest'
import { DEFAULT_ITEMS_STATE, type ItemsState } from '@shared/data/regex/items-state'
import { generateItemsPresetTags } from './items-preset-tags'

function state(over: Partial<ItemsState>): ItemsState {
  return { ...structuredClone(DEFAULT_ITEMS_STATE), ...over }
}

describe('generateItemsPresetTags', () => {
  it('empty state produces no tags', () => {
    expect(generateItemsPresetTags(DEFAULT_ITEMS_STATE)).toEqual([])
  })

  it('rare: class + rarity + mod descs for the active class only', () => {
    const tags = generateItemsPresetTags(
      state({
        itembase: { baseType: 'Daggers', item: '' },
        selectedRareMods: {
          'Daggers-prefix-Adds # to # Chaos Damage': { values: {} },
          'Bows-prefix-Foreign Mod': { values: {} },
        },
      }),
    )
    expect(tags.map((t) => t.text)).toEqual(['Daggers', 'Rare', 'Adds # to # Chaos Damage'])
  })

  it('magic: item name + rarity + affix names, capped at three with overflow', () => {
    const mods = ['A', 'B', 'C', 'D', 'E'].map((n) => ({
      basetype: 'Daggers',
      category: 'prefix',
      affixName: n,
      affixDesc: n.toLowerCase(),
      affix: 'PREFIX' as const,
    }))
    const tags = generateItemsPresetTags(
      state({
        itembase: { baseType: 'Daggers', item: 'Glass Shank' },
        rarity: 'Magic',
        selectedMagicMods: mods,
      }),
    )
    expect(tags.map((t) => t.text)).toEqual(['Glass Shank', 'Magic', 'A', 'B', 'C', '+2 more'])
  })

  it('rare caps mod tags at three with overflow', () => {
    const selectedRareMods: ItemsState['selectedRareMods'] = {}
    for (const d of ['M1', 'M2', 'M3', 'M4']) selectedRareMods[`Daggers-prefix-${d}`] = { values: {} }
    const tags = generateItemsPresetTags(state({ itembase: { baseType: 'Daggers', item: '' }, selectedRareMods }))
    expect(tags.map((t) => t.text)).toEqual(['Daggers', 'Rare', 'M1', 'M2', 'M3', '+1 more'])
  })
})
