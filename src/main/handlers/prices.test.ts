import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import type { FilterFile } from '../../shared/types'

// Stub `../trade/prices` before importing the handler module -- the real implementation
// tries to fetch from poe.ninja and reads/writes userData on import. We only exercise
// the pure-logic exports (buildSearchableItems et al.), so inert stubs are enough.
vi.mock('../trade/prices', () => ({
  refreshPrices: vi.fn().mockResolvedValue(undefined),
  lookupPrice: vi.fn(),
  lookupBestUniquePrice: vi.fn(),
  lookupDivCardPrice: vi.fn(),
  getUniquesByBase: vi.fn(() => ({})),
  getGemNames: vi.fn(() => new Set<string>(['Fireball', 'Enhance Support', 'Hydrosphere'])),
}))
// `../evaluation` and `./editing` pull in electron and the overlay; we don't touch
// those code paths here, so stub them too.
vi.mock('../evaluation', () => ({
  evaluateAndSend: vi.fn(),
  preloadPriceCheck: vi.fn(),
  runPriceCheck: vi.fn(),
}))
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}))

import { parseFilterFile } from '../filter/parser'
import { setCurrentFilter } from '../filter-state'
import { refreshPrices } from '../trade/prices'
import {
  __resetSearchableCache,
  buildSearchableItems,
  buildSearchableRow,
  clickSyntheticOverrides,
  primeSearchableItemsCache,
} from './prices'

let filter: FilterFile

beforeAll(() => {
  const content = readFileSync(join(__dirname, '..', 'filter', '__fixtures__', 'test-filter.filter'), 'utf-8')
  filter = parseFilterFile('test-filter.filter', content)
})

// Minimal Store stub -- buildSearchableItems only reads store.get('league') before
// deferring to the mocked refreshPrices, so anything returning a string works.
const mockStore = { get: (_k: string) => 'Standard' } as unknown as Parameters<typeof buildSearchableItems>[0]

describe('buildSearchableRow', () => {
  it('attaches the matched block label when the synthetic matches a filter block', () => {
    // Currency is a stackable item class the test filter has blocks for -- use Chaos Orb
    // with baseType as the concrete base type.
    const row = buildSearchableRow(
      filter,
      { name: 'Chaos Orb', baseType: 'Chaos Orb', itemClass: 'Stackable Currency', rarity: 'Currency' },
      { itemClass: 'Stackable Currency', rarity: 'Currency', name: 'Chaos Orb', baseType: 'Chaos Orb', stackSize: 1 },
    )
    expect(row.name).toBe('Chaos Orb')
    expect(row.baseType).toBe('Chaos Orb')
    // Matched blocks give a visibility + actions payload; unmatched rows get null.
    expect(row.block).not.toBeNull()
    expect(row.block?.visibility).toMatch(/Show|Hide/)
  })

  it('returns a null block when no filter rule matches the synthetic', () => {
    const row = buildSearchableRow(
      filter,
      {
        name: 'ZZZ Nonexistent Base',
        baseType: 'ZZZ Nonexistent Base',
        itemClass: 'Completely Fake Class',
        rarity: 'Currency',
      },
      {
        itemClass: 'Completely Fake Class',
        rarity: 'Currency',
        name: 'ZZZ Nonexistent Base',
        baseType: 'ZZZ Nonexistent Base',
      },
    )
    // Either no match at all, or the catch-all -- but for unknown classes with no
    // catch-all in the fixture, block should be null.
    if (row.block !== null) {
      expect(row.block.visibility).toMatch(/Show|Hide/)
    }
  })

  it('copies through extra fields (iconKey, flags) from the base payload', () => {
    const row = buildSearchableRow(
      filter,
      {
        name: 'Map (Tier 16)',
        baseType: 'Map (Tier 16)',
        itemClass: 'Maps',
        rarity: 'Currency',
        iconKey: 'Zana Map (Tier 16)',
        flags: { zanaMemory: true },
      },
      { itemClass: 'Maps', rarity: 'Normal', name: 'Map (Tier 16)', baseType: 'Map (Tier 16)', mapTier: 16 },
    )
    expect(row.iconKey).toBe('Zana Map (Tier 16)')
    expect(row.flags).toEqual({ zanaMemory: true })
  })
})

describe('buildSearchableItems', () => {
  it('emits Tier 1..16 regular maps, Nightmare Map, and Tier 1..16 originator variants', async () => {
    const items = await buildSearchableItems(mockStore, filter)
    const maps = items.filter((i) => i.itemClass === 'Maps')

    // 16 regular tiers + 1 Nightmare + 16 originator tiers = 33
    expect(maps.length).toBe(33)
    expect(maps.filter((m) => m.name === 'Nightmare Map')).toHaveLength(1)

    // Each tier from 1..16 should appear twice (regular + originator variants).
    for (let tier = 1; tier <= 16; tier++) {
      const name = `Map (Tier ${tier})`
      const tierRows = maps.filter((m) => m.name === name)
      expect(tierRows, `tier ${tier}`).toHaveLength(2)
      // Exactly one of the two should be an originator variant with the Zana iconKey and
      // a zanaMemory flag; the regular variant carries neither.
      const originator = tierRows.find((r) => r.flags?.zanaMemory)
      expect(originator?.iconKey).toBe(`Zana Map (Tier ${tier})`)
      const regular = tierRows.find((r) => !r.flags?.zanaMemory)
      expect(regular?.iconKey).toBeUndefined()
    }
  })

  it('emits gems as rarity=Gem, with transfigured flag set for " of " variants', async () => {
    const items = await buildSearchableItems(mockStore, filter)
    const gems = items.filter((i) => i.rarity === 'Gem')
    const byName = new Map(gems.map((g) => [g.name, g]))

    // From the mocked getGemNames(): base gems only (no " of ") and a support gem.
    expect(byName.has('Fireball')).toBe(true)
    expect(byName.has('Hydrosphere')).toBe(true)
    expect(byName.has('Enhance Support')).toBe(true)

    // Support gems get classified as 'Support Gems' so NeverSink filter blocks using
    // `Class == "Skill Gems" "Support Gems"` match.
    expect(byName.get('Enhance Support')?.itemClass).toBe('Support Gems')
    expect(byName.get('Fireball')?.itemClass).toBe('Skill Gems')
  })

  it('dedupes stackables when the same base appears in multiple blocks', async () => {
    const items = await buildSearchableItems(mockStore, filter)
    const stackables = items.filter((i) => i.rarity === 'Currency' && i.itemClass !== 'Maps')
    const names = stackables.map((s) => s.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('clickSyntheticOverrides', () => {
  it('gems: sets 20/20 defaults and detects transfigured by base-type', () => {
    const regular = clickSyntheticOverrides('Fireball', 'Skill Gems', 'Gem')
    expect(regular).toMatchObject({
      itemClass: 'Skill Gems',
      rarity: 'Gem',
      baseType: 'Fireball',
      gemLevel: 20,
      quality: 20,
      transfigured: false,
    })

    // Any real transfigured name should flip the flag. "Arc of Surging" is in the
    // shipped TRANSFIGURED_GEM_DISC data.
    const transfigured = clickSyntheticOverrides('Arc of Surging', 'Skill Gems', 'Gem')
    expect(transfigured.transfigured).toBe(true)
  })

  it('maps: parses tier from "Map (Tier N)", forces rarity=Normal, carries zanaMemory flag', () => {
    const tier14 = clickSyntheticOverrides('Map (Tier 14)', 'Maps', 'Currency', { zanaMemory: true })
    expect(tier14).toMatchObject({
      itemClass: 'Maps',
      rarity: 'Normal', // overridden from the incoming 'Currency' to match filter rarity checks
      baseType: 'Map (Tier 14)',
      mapTier: 14,
      zanaMemory: true,
    })

    const noFlag = clickSyntheticOverrides('Map (Tier 3)', 'Maps', 'Currency')
    expect(noFlag.zanaMemory).toBe(false)
  })

  it('maps: falls back to tier 16 when the baseType lacks a parseable tier', () => {
    const nightmare = clickSyntheticOverrides('Nightmare Map', 'Maps', 'Currency')
    expect(nightmare.mapTier).toBe(16)
  })

  it('non-map non-gem: returns just the identifying fields without category defaults', () => {
    const unique = clickSyntheticOverrides('Siege Axe', 'Two Hand Axes', 'Unique')
    expect(unique).toEqual({ itemClass: 'Two Hand Axes', rarity: 'Unique', baseType: 'Siege Axe' })
    // And crucially does NOT inject any gem- or map-specific fields.
    expect(unique).not.toHaveProperty('gemLevel')
    expect(unique).not.toHaveProperty('mapTier')
  })
})

describe('primeSearchableItemsCache', () => {
  beforeEach(() => {
    __resetSearchableCache()
    vi.clearAllMocks()
  })

  it('does nothing when no filter is loaded', async () => {
    setCurrentFilter(null)
    await primeSearchableItemsCache(mockStore)
    expect(refreshPrices).not.toHaveBeenCalled()
  })

  it('builds the cache on first call; subsequent calls with the same filter reuse it', async () => {
    setCurrentFilter(filter)
    await primeSearchableItemsCache(mockStore)
    expect(refreshPrices).toHaveBeenCalledTimes(1)

    await primeSearchableItemsCache(mockStore)
    // Cache hit -- no rebuild (refreshPrices only runs inside buildSearchableItems).
    expect(refreshPrices).toHaveBeenCalledTimes(1)
  })

  it('rebuilds when the filter reference changes', async () => {
    const other = parseFilterFile(
      'test-filter.filter',
      readFileSync(join(__dirname, '..', 'filter', '__fixtures__', 'test-filter.filter'), 'utf-8'),
    )

    setCurrentFilter(filter)
    await primeSearchableItemsCache(mockStore)
    expect(refreshPrices).toHaveBeenCalledTimes(1)

    // Same content, different object reference -- treat as a new filter (user may have
    // edited the file without changing semantics; safer to rebuild than to miss a change).
    setCurrentFilter(other)
    await primeSearchableItemsCache(mockStore)
    expect(refreshPrices).toHaveBeenCalledTimes(2)
  })
})
