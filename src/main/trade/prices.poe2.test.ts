import { describe, expect, it } from 'vitest'
import type { PriceEntry, PriceInfo } from '@shared/types'
import { applyProxyResponse, applyResponse, fetchAndBuildPoe2PriceMap, fetchPoe2PricesFromProxy } from './prices.poe2'

it('uses one Currency snapshot for Chaos Orb despite conflicting category core rates', async () => {
  const result = await fetchAndBuildPoe2PriceMap(
    'Forbidden Rites',
    async (url) => {
      const currency = new URL(url).searchParams.get('type') === 'Currency'
      return resp({
        rates: { divine: 1, exalted: 100, chaos: currency ? 10 : 20 },
        coreItems: [{ id: 'chaos', name: 'Chaos Orb' }],
        items: currency ? [{ id: 'chaos', name: 'Chaos Orb' }] : [],
        lines: currency ? [{ id: 'chaos', primaryValue: 0.12 }] : [],
      })
    },
    {},
    {},
  )
  expect(result.entries.filter((entry) => entry.name === 'Chaos Orb')).toEqual([
    expect.objectContaining({ name: 'Chaos Orb', chaosValue: 12, category: 'currency' }),
  ])
  expect(result.priceMap.get('chaos orb')?.chaosValue).toBe(12)
})

it('fetches alloy prices from Verisium and exposes them to plugin lookups with an older manifest', async () => {
  const requested: string[] = []
  const result = await fetchAndBuildPoe2PriceMap(
    'Forbidden Rites',
    async (url) => {
      const type = new URL(url).searchParams.get('type')!
      requested.push(type)
      return type === 'Verisium'
        ? resp({
            rates: { exalted: 200 },
            items: [
              { id: 'cyclonic-alloy', name: 'Cyclonic Alloy' },
              { id: 'expansive-alloy', name: 'Expansive Alloy' },
            ],
            lines: [
              { id: 'cyclonic-alloy', primaryValue: 0.01 },
              { id: 'expansive-alloy', primaryValue: 0.005 },
            ],
          })
        : resp({})
    },
    { Currency: 'currency' },
    {},
  )
  expect(requested).toContain('Verisium')
  expect(result.entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'Cyclonic Alloy', chaosValue: 2, category: 'verisium', ninjaType: 'Verisium' }),
      expect.objectContaining({ name: 'Expansive Alloy', chaosValue: 1, category: 'verisium', ninjaType: 'Verisium' }),
    ]),
  )
  expect(result.priceMap.get('cyclonic alloy')?.chaosValue).toBe(2)
})

// Helper: minimal valid Poe2ExchangeResponse shape for the parts applyResponse
// reads. The real ninja payload has more fields but they're ignored.
function resp(over: {
  primary?: string
  rates?: Record<string, number>
  coreItems?: Array<{ id: string; name: string }>
  items?: Array<{ id: string; name: string }>
  lines?: Array<{ id: string; primaryValue?: number; sparkline?: { data: (number | null)[] } }>
}) {
  return {
    core: {
      primary: over.primary ?? 'divine',
      secondary: 'exalted',
      rates: over.rates ?? { divine: 1, exalted: 100 },
      items: over.coreItems ?? [],
    },
    lines: over.lines ?? [],
    items: over.items ?? [],
  } as Parameters<typeof applyResponse>[0]
}

describe('applyResponse (PoE2 exchange math)', () => {
  // Ninja reports primary=divine and rates.X = "X per 1 divine". So in a world
  // where 1 divine == 100 exalted, line items priced at primaryValue=2 should
  // surface as divineValue=2 and chaosValue=200 (the "baseline currency count"
  // legacy field, which holds exalted-equivalents in PoE2).
  it('computes chaosValue = primaryValue * exalted-per-divine for line items', () => {
    const map = new Map<string, PriceInfo>()
    applyResponse(
      resp({
        rates: { divine: 1, exalted: 100 },
        items: [
          { id: 'A', name: 'Acme Currency' },
          { id: 'B', name: 'Bronze Sliver' },
        ],
        lines: [
          { id: 'A', primaryValue: 2 },
          { id: 'B', primaryValue: 0.5 },
        ],
      }),
      map,
      undefined,
    )
    expect(map.get('acme currency')).toMatchObject({ chaosValue: 200, divineValue: 2 })
    expect(map.get('bronze sliver')).toMatchObject({ chaosValue: 50, divineValue: 0.5 })
  })

  it('seeds the primary core currency at divineValue=1, chaosValue=exaltedRate', () => {
    const map = new Map<string, PriceInfo>()
    applyResponse(
      resp({
        primary: 'divine',
        rates: { divine: 1, exalted: 137 },
        coreItems: [{ id: 'divine', name: 'Divine Orb' }],
      }),
      map,
      undefined,
    )
    // Core currencies always get ninjaCategory: 'currency' regardless of the passed ninjaCategory
    expect(map.get('divine orb')).toEqual({ chaosValue: 137, divineValue: 1, ninjaCategory: 'currency' })
  })

  it('inverts the rate for non-primary core currencies', () => {
    // If rates.exalted = 100 it means "100 exalted per 1 divine", so 1 exalted
    // is worth 1/100 divine. chaosValue = divineValue * exaltedPerPrimary, so
    // exalted's chaosValue lands at exactly 1 (it IS the chaos-equivalent).
    const map = new Map<string, PriceInfo>()
    applyResponse(
      resp({
        primary: 'divine',
        rates: { divine: 1, exalted: 100 },
        coreItems: [
          { id: 'divine', name: 'Divine Orb' },
          { id: 'exalted', name: 'Exalted Orb' },
        ],
      }),
      map,
      undefined,
    )
    expect(map.get('exalted orb')).toMatchObject({ chaosValue: 1, divineValue: 0.01 })
  })

  it('falls back to core.items + items for the id->name lookup', () => {
    // Real ninja responses spread item metadata across both arrays; lines can
    // reference an id that's only in `items`, not `core.items`.
    const map = new Map<string, PriceInfo>()
    applyResponse(
      resp({
        rates: { divine: 1, exalted: 50 },
        items: [{ id: 'X', name: 'Ext Item' }],
        lines: [{ id: 'X', primaryValue: 4 }],
      }),
      map,
      undefined,
    )
    expect(map.get('ext item')).toMatchObject({ chaosValue: 200, divineValue: 4 })
  })

  it('skips lines whose id has no name mapping', () => {
    const map = new Map<string, PriceInfo>()
    applyResponse(
      resp({
        rates: { divine: 1, exalted: 100 },
        lines: [{ id: 'orphan', primaryValue: 1 }],
      }),
      map,
      undefined,
    )
    expect(map.size).toBe(0)
  })

  it('skips lines with missing or non-positive primaryValue', () => {
    const map = new Map<string, PriceInfo>()
    applyResponse(
      resp({
        rates: { divine: 1, exalted: 100 },
        items: [
          { id: 'A', name: 'Free' },
          { id: 'B', name: 'Negative' },
          { id: 'C', name: 'Missing' },
        ],
        lines: [{ id: 'A', primaryValue: 0 }, { id: 'B', primaryValue: -1 }, { id: 'C' /* primaryValue absent */ }],
      }),
      map,
      undefined,
    )
    expect(map.size).toBe(0)
  })

  it('skips core entries with non-finite or non-positive chaosValue', () => {
    // A missing rate would make `1 / 0` = Infinity -- the guard prevents
    // poisoning the price map with garbage.
    const map = new Map<string, PriceInfo>()
    applyResponse(
      resp({
        primary: 'divine',
        rates: { divine: 1 /* exalted absent -> 0 */ },
        coreItems: [
          { id: 'divine', name: 'Divine Orb' },
          { id: 'exalted', name: 'Exalted Orb' },
        ],
      }),
      map,
      undefined,
    )
    // No exalted rate means everything's chaosValue is 0 (or Infinity); both fail the guard.
    expect(map.size).toBe(0)
  })

  it('does not crash on missing rates / lines / items arrays', () => {
    const map = new Map<string, PriceInfo>()
    applyResponse(
      {
        core: {
          primary: 'divine',
          secondary: 'exalted',
          rates: undefined as unknown as Record<string, number>,
          items: [],
        },
        lines: undefined as unknown as Array<{ id: string; primaryValue?: number }>,
        items: undefined as unknown as Array<{ id: string; name: string }>,
      },
      map,
      undefined,
    )
    expect(map.size).toBe(0)
  })

  it('writes lower-cased names so case-insensitive lookups hit', () => {
    const map = new Map<string, PriceInfo>()
    applyResponse(
      resp({
        rates: { divine: 1, exalted: 100 },
        items: [{ id: 'A', name: 'Mirror Of Kalandra' }],
        lines: [{ id: 'A', primaryValue: 5 }],
      }),
      map,
      undefined,
    )
    // Caller normalizes to lowercase before lookup; we mirror that here.
    expect(map.has('Mirror Of Kalandra')).toBe(false)
    expect(map.has('mirror of kalandra')).toBe(true)
  })

  it('overwrites existing entries when the same name appears twice', () => {
    // PoE2 ninja occasionally returns the same item across multiple categories.
    // Last write wins -- we don't try to be smart about which is "right".
    const map = new Map<string, PriceInfo>()
    map.set('repeated', { chaosValue: 999, divineValue: 9.99 })
    applyResponse(
      resp({
        rates: { divine: 1, exalted: 100 },
        items: [{ id: 'A', name: 'Repeated' }],
        lines: [{ id: 'A', primaryValue: 1 }],
      }),
      map,
      undefined,
    )
    expect(map.get('repeated')).toMatchObject({ chaosValue: 100, divineValue: 1 })
  })

  it('passes sparkline graph data through to PriceInfo when present on the line', () => {
    const map = new Map<string, PriceInfo>()
    const graphData = [5, 10, -3, 8, 20, 15, 18]
    applyResponse(
      {
        core: {
          primary: 'divine',
          secondary: 'exalted',
          rates: { divine: 1, exalted: 100 },
          items: [],
        },
        lines: [{ id: 'A', primaryValue: 2, sparkline: { data: graphData } }],
        items: [{ id: 'A', name: 'Graphed Item' }],
      },
      map,
      undefined,
    )
    expect(map.get('graphed item')?.graph).toEqual(graphData)
  })

  it('tags line entries with the provided ninjaCategory', () => {
    const map = new Map<string, PriceInfo>()
    applyResponse(
      resp({
        rates: { divine: 1, exalted: 100 },
        items: [{ id: 'A', name: 'Neural Catalyst' }],
        lines: [{ id: 'A', primaryValue: 1 }],
      }),
      map,
      'breach-catalyst',
    )
    expect(map.get('neural catalyst')?.ninjaCategory).toBe('breach-catalyst')
  })

  it('always tags core currency entries with ninjaCategory: currency regardless of the passed value', () => {
    const map = new Map<string, PriceInfo>()
    applyResponse(
      resp({
        primary: 'divine',
        rates: { divine: 1, exalted: 100 },
        coreItems: [{ id: 'divine', name: 'Divine Orb' }],
      }),
      map,
      'breach-catalyst',
    )
    expect(map.get('divine orb')?.ninjaCategory).toBe('currency')
  })
})

describe('PoE2 price entries', () => {
  it('applyResponse collects entries with display names and category', () => {
    const resp = {
      core: {
        primary: 'divine',
        secondary: 'exalted',
        rates: { exalted: 50 },
        items: [
          { id: 'divine', name: 'Divine Orb' },
          { id: 'exalted', name: 'Exalted Orb' },
        ],
      },
      lines: [{ id: 'chaos', primaryValue: 0.01, sparkline: { data: [1, 2] } }],
      items: [{ id: 'chaos', name: 'Chaos Orb' }],
    }
    const priceMap = new Map()
    const entries: PriceEntry[] = []
    applyResponse(resp as never, priceMap, 'currency', entries)

    expect(entries.find((e) => e.name === 'Divine Orb')).toMatchObject({ category: 'currency', divineValue: 1 })
    const chaos = entries.find((e) => e.name === 'Chaos Orb')
    expect(chaos).toMatchObject({ category: 'currency', divineValue: 0.01 })
    expect(chaos?.graph).toEqual([1, 2])
  })

  it('applyProxyResponse kebab-cases an unmapped overview type for the entry category', () => {
    const resp = {
      core: { primary: 'divine', rates: { exalted: 40 } },
      itemOverviews: [{ type: 'UniqueWeapons', lines: [{ name: 'Some Unique', primaryValue: 5 }] }],
    }
    const priceMap = new Map()
    const entries: import('@shared/types').PriceEntry[] = []
    applyProxyResponse(resp as never, priceMap, {}, undefined, entries)
    expect(entries.find((e) => e.name === 'Some Unique')?.category).toBe('unique-weapons')
  })
})

it('fetchPoe2PricesFromProxy returns entries', async () => {
  const resp = {
    core: { primary: 'divine', rates: { exalted: 40 } },
    itemOverviews: [{ type: 'Currency', lines: [{ name: 'Alchemy Orb', primaryValue: 0.1 }] }],
  }
  const fetchJson = async () => resp
  const categoryByType = { Currency: 'currency' }
  const result = await fetchPoe2PricesFromProxy('Standard', fetchJson as never, categoryByType, {})
  expect(result.entries.find((e) => e.name === 'Alchemy Orb')).toMatchObject({ category: 'currency' })
  expect(result.entries.find((e) => e.name === 'Divine Orb')).toMatchObject({ category: 'currency' })
})

describe('ninjaType capture (poe2)', () => {
  it('records the type passed alongside the category on exchange lines', () => {
    const priceMap = new Map<string, PriceInfo>()
    const entries: PriceEntry[] = []
    applyResponse(
      {
        core: { items: [{ id: 'divine', name: 'Divine Orb' }], rates: { exalted: 364.9 }, primary: 'divine' },
        items: [{ id: 'omen-of-whittling', name: 'Omen of Whittling' }],
        lines: [{ id: 'omen-of-whittling', primaryValue: 2.5 }],
      } as never,
      priceMap,
      'omens',
      entries,
      'Ritual',
    )
    expect(entries.find((e) => e.name === 'Omen of Whittling')?.ninjaType).toBe('Ritual')
  })

  it('records the proxy overview type on each entry', () => {
    const priceMap = new Map<string, PriceInfo>()
    const entries: PriceEntry[] = []
    applyProxyResponse(
      {
        core: { rates: { exalted: 364.9 } },
        itemOverviews: [{ type: 'Essences', lines: [{ name: 'Greater Essence of Haste', primaryValue: 0.047 }] }],
      } as never,
      priceMap,
      { Essences: 'essences' },
      undefined,
      entries,
    )
    expect(entries.find((e) => e.name === 'Greater Essence of Haste')?.ninjaType).toBe('Essences')
  })

  it('tags the canonical Divine Orb / Exalted Orb entries with ninjaType: Currency (#568)', () => {
    // applyProxyResponse's canonical push replaces whatever the loop wrote for
    // these two names, including ninjaType -- this is the default PoE2 path,
    // so a regression here silently drops the exchange dashboard for PoE2's
    // two most price-checked items.
    const priceMap = new Map<string, PriceInfo>()
    const entries: PriceEntry[] = []
    applyProxyResponse(
      {
        core: { primary: 'divine', rates: { exalted: 180 } },
        itemOverviews: [
          {
            type: 'Currency',
            lines: [
              { name: 'Divine Orb', primaryValue: 1 },
              { name: 'Exalted Orb', primaryValue: 1 / 180 },
            ],
          },
        ],
      } as never,
      priceMap,
      { Currency: 'currency' },
      undefined,
      entries,
    )
    expect(entries.find((e) => e.name === 'Divine Orb')?.ninjaType).toBe('Currency')
    expect(entries.find((e) => e.name === 'Exalted Orb')?.ninjaType).toBe('Currency')
  })
})
