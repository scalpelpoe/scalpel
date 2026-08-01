import { describe, it, expect } from 'vitest'
import { generateWaystonePresetTags } from './waystone-preset-tags'
import { WAYSTONE_MODS } from '@shared/data/regex/waystone-mods'

const FIRE = WAYSTONE_MODS.find((m) => m.affix === 'PREFIX' && m.text.toLowerCase().includes('extra fire'))!
const BLEED = WAYSTONE_MODS.find(
  (m) => m.affix === 'SUFFIX' && m.text.toLowerCase().includes('maximum player resistances'),
)!

/** Build a full PresetTagState with neutral defaults; override per case. */
function state(
  over: Partial<Parameters<typeof generateWaystonePresetTags>[0]> = {},
): Parameters<typeof generateWaystonePresetTags>[0] {
  return {
    want: new Set<number>(),
    avoid: new Set<number>(),
    tier: { min: 1, max: 16 },
    corruption: { corrupted: false, uncorrupted: false },
    rarityFilter: { normal: false, magic: false, rare: false },
    revives: { min: 0, max: 6 },
    delirious: false,
    anyPack: false,
    quantities: { packSize: null, monsterEffectiveness: null, monsterRarity: null, itemRarity: null, dropChance: null },
    wantValues: {},
    avoidValues: {},
    ...over,
  }
}

describe('generateWaystonePresetTags value suffixes', () => {
  it('appends >=value to a want mod tag when a value is set', () => {
    const tags = generateWaystonePresetTags(state({ want: new Set([FIRE.id]), wantValues: { [FIRE.id]: 20 } }))
    const tag = tags.find((t) => t.sourceId === FIRE.id)
    expect(tag?.text.endsWith('>=20')).toBe(true)
  })

  it('omits the suffix when no value is set', () => {
    const tags = generateWaystonePresetTags(state({ want: new Set([FIRE.id]) }))
    const tag = tags.find((t) => t.sourceId === FIRE.id)
    expect(tag?.text.includes('>=')).toBe(false)
  })

  it('appends >=value to an avoid mod tag when a value is set', () => {
    const tags = generateWaystonePresetTags(state({ avoid: new Set([BLEED.id]), avoidValues: { [BLEED.id]: 35 } }))
    const tag = tags.find((t) => t.sourceId === BLEED.id)
    expect(tag?.text.endsWith('>=35')).toBe(true)
  })

  it('omits the suffix when no avoid value is set', () => {
    const tags = generateWaystonePresetTags(state({ avoid: new Set([BLEED.id]) }))
    const tag = tags.find((t) => t.sourceId === BLEED.id)
    expect(tag?.text.includes('>=')).toBe(false)
  })
})

describe('generateWaystonePresetTags rarity + revives', () => {
  it('emits a tag per selected rarity filter', () => {
    const tags = generateWaystonePresetTags(state({ rarityFilter: { normal: false, magic: true, rare: true } }))
    expect(tags.some((t) => t.sourceId === 'rarityMagic' && t.text === 'Magic')).toBe(true)
    expect(tags.some((t) => t.sourceId === 'rarityRare' && t.text === 'Rare')).toBe(true)
    expect(tags.some((t) => t.sourceId === 'rarityNormal')).toBe(false)
  })

  it('emits a revives tag when the range is narrower than 0-6', () => {
    const tags = generateWaystonePresetTags(state({ revives: { min: 2, max: 6 } }))
    const tag = tags.find((t) => t.sourceId === 'revives')
    expect(tag?.text).toBe('revives 2-6')
  })

  it('omits the revives tag at the inert 0-6 default', () => {
    const tags = generateWaystonePresetTags(state({ revives: { min: 0, max: 6 } }))
    expect(tags.some((t) => t.sourceId === 'revives')).toBe(false)
  })
})
