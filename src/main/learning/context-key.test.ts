// src/main/learning/context-key.test.ts
import { describe, it, expect } from 'vitest'
import { defaultPoeItem } from '../../shared/poe-item'
import { deriveLearningContext, relevanceAxisFor, GLOBAL_KEY } from './context-key'

describe('relevanceAxisFor', () => {
  it('classifies armour by defence archetype', () => {
    expect(relevanceAxisFor(defaultPoeItem({ itemClass: 'Body Armours', evasion: 500 }))).toBe('dex')
    expect(relevanceAxisFor(defaultPoeItem({ itemClass: 'Body Armours', armour: 500 }))).toBe('str')
    expect(relevanceAxisFor(defaultPoeItem({ itemClass: 'Body Armours', energyShield: 200 }))).toBe('int')
    expect(relevanceAxisFor(defaultPoeItem({ itemClass: 'Body Armours', armour: 500, energyShield: 200 }))).toBe(
      'str/int',
    )
    expect(relevanceAxisFor(defaultPoeItem({ itemClass: 'Body Armours' }))).toBeNull()
  })

  it('classifies weapons by hand and attack-vs-caster', () => {
    expect(relevanceAxisFor(defaultPoeItem({ itemClass: 'Wands' }))).toBe('1h:caster')
    expect(relevanceAxisFor(defaultPoeItem({ itemClass: 'One Hand Swords' }))).toBe('1h:attack')
    expect(relevanceAxisFor(defaultPoeItem({ itemClass: 'Two Hand Axes' }))).toBe('2h:attack')
  })

  it('classifies jewels by subtype', () => {
    expect(relevanceAxisFor(defaultPoeItem({ itemClass: 'Jewels', baseType: 'Large Cluster Jewel' }))).toBe('cluster')
    expect(relevanceAxisFor(defaultPoeItem({ itemClass: 'Jewels', baseType: 'Timeless Jewel' }))).toBe('timeless')
    expect(relevanceAxisFor(defaultPoeItem({ itemClass: 'Jewels', baseType: 'Murderous Eye Jewel' }))).toBe('abyss')
    expect(relevanceAxisFor(defaultPoeItem({ itemClass: 'Jewels', baseType: 'Cobalt Jewel' }))).toBe('regular')
  })

  it('returns null axis for categories without one', () => {
    expect(relevanceAxisFor(defaultPoeItem({ itemClass: 'Life Flasks' }))).toBeNull()
  })
})

describe('deriveLearningContext', () => {
  it('builds a 4-rung ladder for non-uniques, general -> specific', () => {
    const ctx = deriveLearningContext(
      defaultPoeItem({ rarity: 'Rare', itemClass: 'Body Armours', evasion: 500, influence: ['Hunter'] }),
    )
    expect(ctx.rungKeys).toEqual([
      GLOBAL_KEY,
      'Rare|Body Armours',
      'Rare|Body Armours|dex',
      'Rare|Body Armours|dex|Hunter',
    ])
  })

  it('sorts influence for a stable key', () => {
    const ctx = deriveLearningContext(
      defaultPoeItem({ rarity: 'Rare', itemClass: 'Gloves', armour: 100, influence: ['Warlord', 'Hunter'] }),
    )
    expect(ctx.rungKeys[3]).toBe('Rare|Gloves|str|Hunter,Warlord')
  })

  it('collapses uniques to a name-keyed single specific rung', () => {
    const ctx = deriveLearningContext(
      defaultPoeItem({ rarity: 'Unique', name: "Kaom's Heart", itemClass: 'Body Armours', armour: 500 }),
    )
    expect(ctx.uniqueName).toBe("Kaom's Heart")
    expect(ctx.rungKeys).toEqual([GLOBAL_KEY, "u|Kaom's Heart"])
  })
})
