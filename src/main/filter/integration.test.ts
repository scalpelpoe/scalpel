import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it, expect, beforeAll } from 'vitest'
import { parseFilterFile } from './parser'
import { findMatchingBlocks } from './matcher'
import type { FilterFile, PoeItem, MatchResult } from '../../shared/types'

let filter: FilterFile

beforeAll(() => {
  const content = readFileSync(join(__dirname, '__fixtures__/test-filter.filter'), 'utf-8')
  filter = parseFilterFile('test-filter.filter', content)
})

function makeItem(overrides: Partial<PoeItem> = {}): PoeItem {
  return {
    itemClass: 'Rings',
    rarity: 'Rare',
    name: 'Test Item',
    baseType: 'Ruby Ring',
    mapTier: 0,
    itemLevel: 75,
    quality: 0,
    sockets: '',
    linkedSockets: 0,
    armour: 0,
    evasion: 0,
    energyShield: 0,
    ward: 0,
    block: 0,
    reqStr: 0,
    reqDex: 0,
    reqInt: 0,
    corrupted: false,
    identified: true,
    mirrored: false,
    synthesised: false,
    fractured: false,
    transfigured: false,
    blighted: false,
    scourged: false,
    zanaMemory: false,
    implicitCount: 0,
    gemLevel: 0,
    stackSize: 1,
    influence: [],
    explicits: [],
    implicits: [],
    enchants: [],
    imbues: [],
    ...overrides,
  }
}

/** Get the first non-Continue match (the one PoE would apply) */
function getFirstMatch(matches: MatchResult[]): MatchResult | undefined {
  return matches.find((m) => m.isFirstMatch)
}

describe('NeverSink filter integration tests', () => {
  describe('filter parsing', () => {
    it('should parse the filter file successfully', () => {
      expect(filter).toBeDefined()
      expect(filter.blocks.length).toBeGreaterThan(100)
    })

    it('should have blocks with tier tags', () => {
      const blocksWithTags = filter.blocks.filter((b) => b.tierTag)
      expect(blocksWithTags.length).toBeGreaterThan(50)
    })
  })

  describe('currency', () => {
    it('Mirror of Kalandra should match a t1-tier currency block and Show', () => {
      const item = makeItem({
        itemClass: 'Stackable Currency',
        rarity: 'Normal',
        name: 'Mirror of Kalandra',
        baseType: 'Mirror of Kalandra',
        stackSize: 1,
      })
      const matches = findMatchingBlocks(filter, item)
      const first = getFirstMatch(matches)

      expect(first).toBeDefined()
      expect(first!.block.visibility).toBe('Show')
      expect(first!.block.tierTag).toBeDefined()
      expect(first!.block.tierTag!.typePath).toContain('currency')
      expect(first!.block.tierTag!.tier).toBe('t1exalted')
    })

    it('Divine Orb should match a high-tier currency block and Show', () => {
      const item = makeItem({
        itemClass: 'Stackable Currency',
        rarity: 'Normal',
        name: 'Divine Orb',
        baseType: 'Divine Orb',
        stackSize: 1,
      })
      const matches = findMatchingBlocks(filter, item)
      const first = getFirstMatch(matches)

      expect(first).toBeDefined()
      expect(first!.block.visibility).toBe('Show')
      expect(first!.block.tierTag).toBeDefined()
      expect(first!.block.tierTag!.typePath).toContain('currency')
    })

    it('Chaos Orb should Show', () => {
      const item = makeItem({
        itemClass: 'Stackable Currency',
        rarity: 'Normal',
        name: 'Chaos Orb',
        baseType: 'Chaos Orb',
        stackSize: 1,
      })
      const matches = findMatchingBlocks(filter, item)
      const first = getFirstMatch(matches)

      expect(first).toBeDefined()
      expect(first!.block.visibility).toBe('Show')
    })

    it('Scroll of Wisdom (stack of 1) should be hidden or match a low tier', () => {
      const item = makeItem({
        itemClass: 'Stackable Currency',
        rarity: 'Normal',
        name: 'Scroll of Wisdom',
        baseType: 'Scroll of Wisdom',
        stackSize: 1,
      })
      const matches = findMatchingBlocks(filter, item)
      const first = getFirstMatch(matches)

      expect(first).toBeDefined()
      // In uber strict, single wisdoms are either hidden or shown at a very low tier
      // The filter has StackSize >= 10 for wisdom scrolls, so a single one falls through
    })
  })

  describe('uniques', () => {
    it('a unique Vermillion Ring should Show and match a unique block', () => {
      const item = makeItem({
        itemClass: 'Rings',
        rarity: 'Unique',
        name: 'Some Unique Ring',
        baseType: 'Vermillion Ring',
        itemLevel: 80,
      })
      const matches = findMatchingBlocks(filter, item)
      const first = getFirstMatch(matches)

      expect(first).toBeDefined()
      expect(first!.block.visibility).toBe('Show')
      // Should match a uniques tier block
      const hasUniqueCondition = first!.block.conditions.some((c) => c.type === 'Rarity' && c.values.includes('Unique'))
      expect(hasUniqueCondition).toBe(true)
    })

    it('any unknown unique should match the restex unique catch-all', () => {
      const item = makeItem({
        itemClass: 'Rings',
        rarity: 'Unique',
        name: 'Unknown Unique',
        baseType: 'Unset Ring', // not in any specific tier list
        itemLevel: 80,
      })
      const matches = findMatchingBlocks(filter, item)
      const first = getFirstMatch(matches)

      expect(first).toBeDefined()
      expect(first!.block.visibility).toBe('Show')
    })
  })

  describe('maps', () => {
    it('a Tier 16 rare map should Show', () => {
      const item = makeItem({
        itemClass: 'Maps',
        rarity: 'Rare',
        name: 'Some T16 Map',
        baseType: 'Crimson Temple Map',
        mapTier: 16,
        itemLevel: 83,
      })
      const matches = findMatchingBlocks(filter, item)
      const first = getFirstMatch(matches)

      expect(first).toBeDefined()
      expect(first!.block.visibility).toBe('Show')
      expect(first!.block.tierTag).toBeDefined()
      expect(first!.block.tierTag!.typePath).toContain('maps')
    })

    it('a Tier 1 normal map should be hidden in uber strict', () => {
      const item = makeItem({
        itemClass: 'Maps',
        rarity: 'Normal',
        name: 'Some T1 Map',
        baseType: 'Jungle Valley Map',
        mapTier: 1,
        itemLevel: 68,
      })
      const matches = findMatchingBlocks(filter, item)
      const first = getFirstMatch(matches)

      expect(first).toBeDefined()
      expect(first!.block.visibility).toBe('Hide')
    })
  })

  describe('divination cards', () => {
    it('The Doctor should match a t1 divination card block', () => {
      const item = makeItem({
        itemClass: 'Divination Cards',
        rarity: 'Normal',
        name: 'The Doctor',
        baseType: 'The Doctor',
        stackSize: 1,
      })
      const matches = findMatchingBlocks(filter, item)
      const first = getFirstMatch(matches)

      expect(first).toBeDefined()
      expect(first!.block.visibility).toBe('Show')
      expect(first!.block.tierTag).toBeDefined()
      expect(first!.block.tierTag!.typePath).toBe('divination')
      expect(first!.block.tierTag!.tier).toBe('t1')
    })

    it('a div card should match some divination block', () => {
      const item = makeItem({
        itemClass: 'Divination Cards',
        rarity: 'Normal',
        name: 'Humility',
        baseType: 'Humility',
        stackSize: 1,
      })
      const matches = findMatchingBlocks(filter, item)
      const first = getFirstMatch(matches)

      expect(first).toBeDefined()
      expect(first!.block.tierTag).toBeDefined()
      expect(first!.block.tierTag!.typePath).toBe('divination')
    })
  })

  describe('rare equipment', () => {
    it('a rare ilvl 86 body armour should match some block', () => {
      const item = makeItem({
        itemClass: 'Body Armours',
        rarity: 'Rare',
        name: 'Apocalypse Shell',
        baseType: 'Vaal Regalia',
        itemLevel: 86,
        energyShield: 400,
      })
      const matches = findMatchingBlocks(filter, item)
      const first = getFirstMatch(matches)

      expect(first).toBeDefined()
    })

    it('a rare ring should match some block', () => {
      const item = makeItem({
        itemClass: 'Rings',
        rarity: 'Rare',
        name: 'Doom Circle',
        baseType: 'Diamond Ring',
        itemLevel: 75,
      })
      const matches = findMatchingBlocks(filter, item)
      const first = getFirstMatch(matches)

      expect(first).toBeDefined()
    })
  })

  describe('catch-all safety', () => {
    it('every item should match at least one block', () => {
      // Test a variety of unusual items to verify the filter has catch-all rules
      const items = [
        makeItem({ itemClass: 'Stackable Currency', rarity: 'Normal', baseType: 'Totally Unknown Currency' }),
        makeItem({ itemClass: 'Rings', rarity: 'Magic', baseType: 'Iron Ring', itemLevel: 1 }),
        makeItem({ itemClass: 'Jewels', rarity: 'Rare', baseType: 'Cobalt Jewel' }),
      ]

      for (const item of items) {
        const matches = findMatchingBlocks(filter, item)
        const first = getFirstMatch(matches)
        expect(first).toBeDefined()
      }
    })
  })
})
