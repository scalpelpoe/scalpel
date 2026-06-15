import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp', getAppPath: () => '/tmp', userAgentFallback: 'Scalpel-Test/1.0' },
  ipcMain: { on: vi.fn(), handle: vi.fn(), removeListener: vi.fn() },
  net: { request: vi.fn() },
}))

vi.mock('../manifest', () => ({
  getManifest: () => ({ ninjaLeagues: { poe1: {}, poe2: {} }, poe2NinjaCategories: {} }),
  refreshManifest: vi.fn(),
}))

import {
  _setPricesForTests,
  _setPriceEntriesForTests,
  _setUniquesByBaseForTests,
  getPriceEntries,
  lookupItemPrice,
  lookupPrice,
  lookupPriceForItem,
  lookupUniquePriceForBase,
  processDenseResponse,
  subscribePriceUpdates,
} from './prices'
import type { PriceEntry } from '@shared/types'
import { setPoeVersion } from '../game-state'

const baseItem = (overrides: Record<string, unknown> = {}): Parameters<typeof lookupPriceForItem>[0] => ({
  name: '',
  baseType: '',
  rarity: 'Normal',
  itemClass: '',
  ...overrides,
})

describe('lookupPriceForItem (variant-aware)', () => {
  beforeEach(() => {
    _setPricesForTests([])
  })

  it('returns the exact-variant price for a corrupted gem with level + quality', () => {
    _setPricesForTests([
      { name: 'Hatred', variant: '20 0', chaos: 1 },
      { name: 'Hatred', variant: '21 20c', chaos: 50 },
      { name: 'Hatred', variant: '20 20', chaos: 5 },
    ])
    const price = lookupPriceForItem(
      baseItem({
        name: 'Hatred',
        baseType: 'Hatred',
        rarity: 'Gem',
        itemClass: 'Skill Gems',
        gemLevel: 21,
        quality: 20,
        corrupted: true,
      }),
    )
    expect(price?.chaosValue).toBe(50)
  })

  it('omits the c suffix for non-corrupted gems', () => {
    _setPricesForTests([
      { name: 'Hatred', variant: '20 20', chaos: 5 },
      { name: 'Hatred', variant: '20 20c', chaos: 25 },
    ])
    const price = lookupPriceForItem(
      baseItem({
        name: 'Hatred',
        baseType: 'Hatred',
        rarity: 'Gem',
        itemClass: 'Skill Gems',
        gemLevel: 20,
        quality: 20,
        corrupted: false,
      }),
    )
    expect(price?.chaosValue).toBe(5)
  })

  it('falls back to name-only lookup when no variant key matches', () => {
    _setPricesForTests([
      { name: 'Hatred', variant: '20 20', chaos: 5 },
      // No 21/0 variant exists in the dense data
    ])
    const price = lookupPriceForItem(
      baseItem({
        name: 'Hatred',
        baseType: 'Hatred',
        rarity: 'Gem',
        itemClass: 'Skill Gems',
        gemLevel: 21,
        quality: 0,
      }),
    )
    // Falls back to whatever name-keyed entry exists (the last-set "20/20" entry).
    expect(price?.chaosValue).toBe(5)
  })

  it('returns the 6L variant price for a 6-linked unique chest', () => {
    _setPricesForTests([
      { name: "Kaom's Heart", variant: 'Glorious Plate', chaos: 80 },
      { name: "Kaom's Heart", variant: 'Glorious Plate, 5L', chaos: 110 },
      { name: "Kaom's Heart", variant: 'Glorious Plate, 6L', chaos: 200 },
    ])
    const price = lookupPriceForItem(
      baseItem({
        name: "Kaom's Heart",
        baseType: 'Glorious Plate',
        rarity: 'Unique',
        itemClass: 'Body Armours',
        linkedSockets: 6,
      }),
    )
    expect(price?.chaosValue).toBe(200)
  })

  it('returns the no-link variant price for a unique with fewer than 5 links', () => {
    _setPricesForTests([
      { name: 'Headhunter', variant: 'Leather Belt', chaos: 75000 },
      // Headhunter is a belt, no link variants exist
    ])
    const price = lookupPriceForItem(
      baseItem({
        name: 'Headhunter',
        baseType: 'Leather Belt',
        rarity: 'Unique',
        itemClass: 'Belts',
        linkedSockets: 0,
      }),
    )
    expect(price?.chaosValue).toBe(75000)
  })

  it('skips the variant lookup entirely for currency (no variant)', () => {
    _setPricesForTests([{ name: 'Chaos Orb', variant: undefined, chaos: 1 }])
    const price = lookupPriceForItem(
      baseItem({ name: 'Chaos Orb', baseType: 'Chaos Orb', rarity: 'Currency', itemClass: 'Stackable Currency' }),
    )
    expect(price?.chaosValue).toBe(1)
  })

  it('legacy lookupPrice still works for callers without item context', () => {
    _setPricesForTests([
      { name: 'Hatred', variant: '21 20c', chaos: 50 },
      { name: 'Hatred', variant: '20 20', chaos: 5 },
    ])
    // Legacy callers (sister overlay, bulk lookups) get whichever variant was
    // written to priceMap last -- not variant-aware but no regression.
    const price = lookupPrice('Hatred', 'Hatred')
    expect(price).toBeDefined()
    expect([5, 50]).toContain(price?.chaosValue)
  })
})

describe('lookupUniquePriceForBase', () => {
  beforeEach(() => {
    _setPricesForTests([])
  })

  it('prefers the variant key (name|baseType) over the name-only entry', () => {
    _setPricesForTests([
      { name: 'Grand Spectrum', variant: 'Emerald', chaos: 40250 },
      { name: 'Grand Spectrum', variant: 'Ruby', chaos: 3000 },
    ])
    expect(lookupUniquePriceForBase('Grand Spectrum', 'Emerald')?.chaosValue).toBe(40250)
    expect(lookupUniquePriceForBase('Grand Spectrum', 'Ruby')?.chaosValue).toBe(3000)
  })

  it('falls back to the name-only entry when no variant key matches', () => {
    _setPricesForTests([{ name: 'Headhunter', chaos: 75000 }])
    expect(lookupUniquePriceForBase('Headhunter', 'Unknown Base')?.chaosValue).toBe(75000)
  })

  it('returns undefined when the name is not priced at all', () => {
    _setPricesForTests([{ name: 'Something Else', variant: 'Foo', chaos: 1 }])
    expect(lookupUniquePriceForBase('Nonexistent', 'Foo')).toBeUndefined()
  })
})

describe('getPriceEntries', () => {
  it('filters by category and reports them all when no filter is given', () => {
    _setPriceEntriesForTests(
      [
        { name: 'Divine Orb', category: 'currency', chaosValue: 200 },
        { name: 'The Doctor', category: 'divination-cards', chaosValue: 1000 },
      ],
      1717459200000,
    )
    expect(getPriceEntries('currency').prices.map((e) => e.name)).toEqual(['Divine Orb'])
    expect(getPriceEntries().prices).toHaveLength(2)
    expect(getPriceEntries().updatedAt).toBe(1717459200000)
  })

  it('notifies subscribers', () => {
    let calls = 0
    const off = subscribePriceUpdates(() => {
      calls++
    })
    _setPriceEntriesForTests([], 1) // helper also fires the emitter
    expect(calls).toBe(1)
    off()
    _setPriceEntriesForTests([], 2)
    expect(calls).toBe(1)
  })
})

describe('lookupItemPrice (identified vs unidentified uniques)', () => {
  beforeEach(() => {
    setPoeVersion(2)
    _setPricesForTests([
      { name: 'Whisper of the Brotherhood', variant: 'Sapphire Ring', chaos: 2 },
      { name: 'Pricey Ring Unique', variant: 'Sapphire Ring', chaos: 10 },
    ])
    _setUniquesByBaseForTests({ 'Sapphire Ring': ['Whisper of the Brotherhood', 'Pricey Ring Unique'] })
  })

  it('prices an identified unique by its own name, not the base best', () => {
    const price = lookupItemPrice({
      name: 'Whisper of the Brotherhood',
      baseType: 'Sapphire Ring',
      rarity: 'Unique',
      itemClass: 'Rings',
      identified: true,
    })
    expect(price?.chaosValue).toBe(2)
  })

  it('estimates an unidentified unique by the most valuable unique on its base', () => {
    const price = lookupItemPrice({
      name: 'Sapphire Ring',
      baseType: 'Sapphire Ring',
      rarity: 'Unique',
      itemClass: 'Rings',
      identified: false,
    })
    expect(price?.chaosValue).toBe(10)
  })
})

describe('processDenseResponse price entries', () => {
  beforeEach(() => {
    _setPricesForTests([])
  })

  it('tags currency entries with category "currency", keeps display names, backfills divine', () => {
    const resp = {
      currencyOverviews: [
        {
          type: 'Currency',
          lines: [
            { name: 'Divine Orb', chaos: 200, graph: [1, 2, 3] },
            { name: 'Chaos Orb', chaos: 1 },
          ],
        },
      ],
      itemOverviews: [{ type: 'DivinationCard', lines: [{ name: 'The Doctor', chaos: 1000 }] }],
    }
    const entries: PriceEntry[] = []
    processDenseResponse(resp as never, entries)

    const divine = entries.find((e) => e.name === 'Divine Orb')
    expect(divine).toMatchObject({ category: 'currency', chaosValue: 200, divineValue: 1 })
    expect(divine?.graph).toEqual([1, 2, 3])

    const chaos = entries.find((e) => e.name === 'Chaos Orb')
    expect(chaos).toMatchObject({ category: 'currency', chaosValue: 1, divineValue: 1 / 200 })

    const doctor = entries.find((e) => e.name === 'The Doctor')
    expect(doctor?.category).toBe('divination-cards')
  })

  it('backfills divineValue for entries seen before Divine Orb in the response', () => {
    const resp = {
      currencyOverviews: [
        {
          type: 'Currency',
          lines: [
            { name: 'Chaos Orb', chaos: 1 },
            { name: 'Divine Orb', chaos: 200 },
          ],
        },
      ],
      itemOverviews: [],
    }
    const entries: PriceEntry[] = []
    processDenseResponse(resp as never, entries)
    expect(entries.find((e) => e.name === 'Chaos Orb')?.divineValue).toBe(1 / 200)
  })

  it('synthesizes a Chaos Orb entry when ninja omits the baseline currency', () => {
    const resp = {
      currencyOverviews: [{ type: 'Currency', lines: [{ name: 'Divine Orb', chaos: 220 }] }],
      itemOverviews: [],
    }
    const entries: PriceEntry[] = []
    processDenseResponse(resp as never, entries)
    expect(lookupPrice('Chaos Orb', 'Chaos Orb')).toMatchObject({ chaosValue: 1, divineValue: 1 / 220 })
    expect(entries.find((e) => e.name === 'Chaos Orb')).toMatchObject({
      category: 'currency',
      chaosValue: 1,
      divineValue: 1 / 220,
    })
  })

  it('does not synthesize a Chaos Orb entry when ninja already lists one', () => {
    const resp = {
      currencyOverviews: [
        {
          type: 'Currency',
          lines: [
            { name: 'Divine Orb', chaos: 220 },
            { name: 'Chaos Orb', chaos: 1, graph: [0, 1] },
          ],
        },
      ],
      itemOverviews: [],
    }
    const entries: PriceEntry[] = []
    processDenseResponse(resp as never, entries)
    expect(entries.filter((e) => e.name === 'Chaos Orb')).toHaveLength(1)
    expect(lookupPrice('Chaos Orb', 'Chaos Orb')?.graph).toEqual([0, 1])
  })
})
