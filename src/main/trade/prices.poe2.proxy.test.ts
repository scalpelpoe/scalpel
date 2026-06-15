import { describe, expect, it } from 'vitest'
import type { PriceInfo } from '@shared/types'
import {
  applyProxyResponse,
  buildPoe2UniquesByBaseFromProxy,
  fetchAndBuildPoe2PriceMap,
  fetchPoe2PricesFromProxy,
} from './prices.poe2'

// Helper: minimal valid Ee2OverviewResponse shape for the parts applyProxyResponse
// reads. The real EE2 payload has more fields but they're ignored.
function resp(over: {
  primary?: string
  rates?: Record<string, number>
  itemOverviews?: Array<{
    type: string
    lines: Array<{ name?: string; variant?: string; primaryValue?: number; sparkline?: { data: (number | null)[] } }>
  }>
}) {
  return {
    core: {
      primary: over.primary ?? 'divine',
      rates: over.rates ?? { exalted: 100 },
    },
    itemOverviews: over.itemOverviews ?? [],
  } as Parameters<typeof applyProxyResponse>[0]
}

describe('applyProxyResponse (EE2 proxy math)', () => {
  it('computes divineValue = primaryValue and chaosValue = primaryValue * rates.exalted', () => {
    const map = new Map<string, PriceInfo>()
    applyProxyResponse(
      resp({
        rates: { exalted: 100 },
        itemOverviews: [
          {
            type: 'Currency',
            lines: [
              { name: 'Chaos Orb', primaryValue: 2 },
              { name: 'Regal Orb', primaryValue: 0.5 },
            ],
          },
        ],
      }),
      map,
    )
    expect(map.get('chaos orb')).toMatchObject({ chaosValue: 200, divineValue: 2 })
    expect(map.get('regal orb')).toMatchObject({ chaosValue: 50, divineValue: 0.5 })
  })

  it('synthesizes Divine Orb at { chaosValue: rates.exalted, divineValue: 1 }', () => {
    const map = new Map<string, PriceInfo>()
    applyProxyResponse(resp({ rates: { exalted: 137 } }), map)
    expect(map.get('divine orb')).toEqual({ chaosValue: 137, divineValue: 1, ninjaCategory: 'currency' })
  })

  it('synthesizes Exalted Orb at { chaosValue: 1, divineValue: 1 / rates.exalted }', () => {
    const map = new Map<string, PriceInfo>()
    applyProxyResponse(resp({ rates: { exalted: 100 } }), map)
    expect(map.get('exalted orb')).toEqual({ chaosValue: 1, divineValue: 0.01, ninjaCategory: 'currency' })
  })

  it('skips lines with missing primaryValue', () => {
    const map = new Map<string, PriceInfo>()
    applyProxyResponse(
      resp({
        rates: { exalted: 100 },
        itemOverviews: [
          {
            type: 'Currency',
            lines: [{ name: 'Acme Shard' /* primaryValue absent */ }],
          },
        ],
      }),
      map,
    )
    // Only synthesized divine/exalted entries, not the missing-value line
    expect(map.has('acme shard')).toBe(false)
  })

  it('skips lines with zero primaryValue', () => {
    const map = new Map<string, PriceInfo>()
    applyProxyResponse(
      resp({
        rates: { exalted: 100 },
        itemOverviews: [{ type: 'Currency', lines: [{ name: 'Zero Item', primaryValue: 0 }] }],
      }),
      map,
    )
    expect(map.has('zero item')).toBe(false)
  })

  it('skips lines with negative primaryValue', () => {
    const map = new Map<string, PriceInfo>()
    applyProxyResponse(
      resp({
        rates: { exalted: 100 },
        itemOverviews: [{ type: 'Currency', lines: [{ name: 'Neg Item', primaryValue: -1 }] }],
      }),
      map,
    )
    expect(map.has('neg item')).toBe(false)
  })

  it('skips synthesis when rates.exalted is 0', () => {
    const map = new Map<string, PriceInfo>()
    applyProxyResponse(resp({ rates: { exalted: 0 } }), map)
    expect(map.has('divine orb')).toBe(false)
    expect(map.has('exalted orb')).toBe(false)
  })

  it('skips synthesis when rates is missing', () => {
    const map = new Map<string, PriceInfo>()
    applyProxyResponse(
      {
        core: {
          primary: 'divine',
          rates: undefined as unknown as Record<string, number>,
        },
      },
      map,
    )
    expect(map.has('divine orb')).toBe(false)
    expect(map.has('exalted orb')).toBe(false)
  })

  it('lower-cases names for case-insensitive lookup', () => {
    const map = new Map<string, PriceInfo>()
    applyProxyResponse(
      resp({
        rates: { exalted: 100 },
        itemOverviews: [
          {
            type: 'Currency',
            lines: [{ name: 'Mirror of Kalandra', primaryValue: 5 }],
          },
        ],
      }),
      map,
    )
    expect(map.has('Mirror of Kalandra')).toBe(false)
    expect(map.has('mirror of kalandra')).toBe(true)
  })

  it('last write wins when the same name appears in multiple overviews', () => {
    const map = new Map<string, PriceInfo>()
    applyProxyResponse(
      resp({
        rates: { exalted: 100 },
        itemOverviews: [
          { type: 'Currency', lines: [{ name: 'Repeated', primaryValue: 1 }] },
          { type: 'Essences', lines: [{ name: 'Repeated', primaryValue: 3 }] },
        ],
      }),
      map,
    )
    expect(map.get('repeated')).toMatchObject({ chaosValue: 300, divineValue: 3 })
  })

  it('tolerates missing itemOverviews', () => {
    const map = new Map<string, PriceInfo>()
    applyProxyResponse(
      {
        core: { primary: 'divine', rates: { exalted: 100 } },
        itemOverviews: undefined,
      },
      map,
    )
    // Only synthesized entries
    expect(map.get('divine orb')).toEqual({ chaosValue: 100, divineValue: 1, ninjaCategory: 'currency' })
  })

  it('tolerates missing lines within an overview', () => {
    const map = new Map<string, PriceInfo>()
    applyProxyResponse(
      resp({
        rates: { exalted: 50 },
        itemOverviews: [{ type: 'Currency', lines: undefined as unknown as [] }],
      }),
      map,
    )
    expect(map.get('divine orb')).toMatchObject({ chaosValue: 50, divineValue: 1 })
  })

  it('passes sparkline graph data through to PriceInfo when present on the line', () => {
    const map = new Map<string, PriceInfo>()
    const graphData = [5, 10, -3, 8, 20, 15, 18]
    applyProxyResponse(
      {
        core: { primary: 'divine', rates: { exalted: 100 } },
        itemOverviews: [
          {
            type: 'Currency',
            lines: [{ name: 'Graphed Currency', primaryValue: 2, sparkline: { data: graphData } }],
          },
        ],
      },
      map,
    )
    expect(map.get('graphed currency')?.graph).toEqual(graphData)
  })

  it('tags line entries with ninjaCategory from categoryByType when provided', () => {
    const map = new Map<string, PriceInfo>()
    applyProxyResponse(
      resp({
        rates: { exalted: 100 },
        itemOverviews: [{ type: 'Currency', lines: [{ name: 'Chaos Orb', primaryValue: 1 }] }],
      }),
      map,
      { Currency: 'currency' },
    )
    expect(map.get('chaos orb')?.ninjaCategory).toBe('currency')
  })

  it('tags Breach overview lines with breach-catalyst when categoryByType is supplied', () => {
    const map = new Map<string, PriceInfo>()
    applyProxyResponse(
      resp({
        rates: { exalted: 100 },
        itemOverviews: [{ type: 'Breach', lines: [{ name: 'Neural Catalyst', primaryValue: 2 }] }],
      }),
      map,
      { Breach: 'breach-catalyst' },
    )
    expect(map.get('neural catalyst')?.ninjaCategory).toBe('breach-catalyst')
  })

  it('writes a variant-keyed entry when a 4th map and line.variant are provided', () => {
    const map = new Map<string, PriceInfo>()
    const variantMap = new Map<string, PriceInfo>()
    applyProxyResponse(
      resp({
        rates: { exalted: 100 },
        itemOverviews: [
          {
            type: 'UniqueJewels',
            lines: [{ name: 'Grand Spectrum', variant: 'Emerald', primaryValue: 402.5 }],
          },
        ],
      }),
      map,
      {},
      variantMap,
    )
    expect(variantMap.get('grand spectrum|Emerald')).toMatchObject({ chaosValue: 40250, divineValue: 402.5 })
    expect(map.get('grand spectrum')).toMatchObject({ divineValue: 402.5 })
  })

  it('disambiguates same-name uniques by base via the variant map', () => {
    const map = new Map<string, PriceInfo>()
    const variantMap = new Map<string, PriceInfo>()
    applyProxyResponse(
      resp({
        rates: { exalted: 100 },
        itemOverviews: [
          {
            type: 'UniqueJewels',
            lines: [
              { name: 'Grand Spectrum', variant: 'Emerald', primaryValue: 402.5 },
              { name: 'Grand Spectrum', variant: 'Sapphire', primaryValue: 38.8 },
              { name: 'Grand Spectrum', variant: 'Ruby', primaryValue: 30 },
            ],
          },
        ],
      }),
      map,
      {},
      variantMap,
    )
    expect(variantMap.get('grand spectrum|Emerald')?.divineValue).toBe(402.5)
    expect(variantMap.get('grand spectrum|Sapphire')?.divineValue).toBe(38.8)
    expect(variantMap.get('grand spectrum|Ruby')?.divineValue).toBe(30)
  })

  it('uses an empty variant segment when line.variant is absent', () => {
    const map = new Map<string, PriceInfo>()
    const variantMap = new Map<string, PriceInfo>()
    applyProxyResponse(
      resp({
        rates: { exalted: 100 },
        itemOverviews: [{ type: 'Currency', lines: [{ name: 'Chaos Orb', primaryValue: 2 }] }],
      }),
      map,
      {},
      variantMap,
    )
    expect(variantMap.get('chaos orb|')).toMatchObject({ chaosValue: 200, divineValue: 2 })
  })

  it('does not require the 4th map (existing 3-arg callers unaffected)', () => {
    const map = new Map<string, PriceInfo>()
    applyProxyResponse(
      resp({ rates: { exalted: 100 }, itemOverviews: [{ type: 'Currency', lines: [{ name: 'X', primaryValue: 1 }] }] }),
      map,
      {},
    )
    expect(map.get('x')).toMatchObject({ chaosValue: 100 })
  })
})

describe('applyProxyResponse pair-currency entries', () => {
  it('carries a divine sparkline from a currency overview line onto the canonical divine entry', () => {
    const map = new Map<string, PriceInfo>()
    applyProxyResponse(
      resp({
        rates: { exalted: 141 },
        itemOverviews: [
          {
            type: 'Currency',
            lines: [{ name: 'Divine Orb', primaryValue: 0.97, sparkline: { data: [0, 5, 12] } }],
          },
        ],
      }),
      map,
      { Currency: 'currency' },
    )
    // Canonical exchange-rate values win over the overview line's roundtripped
    // numbers, but the line's sparkline is preserved.
    expect(map.get('divine orb')).toMatchObject({ chaosValue: 141, divineValue: 1, graph: [0, 5, 12] })
    expect(map.get('exalted orb')).toMatchObject({ chaosValue: 1, divineValue: 1 / 141 })
  })

  it('still seeds divine and exalted when no overview line mentions them', () => {
    const map = new Map<string, PriceInfo>()
    applyProxyResponse(resp({ rates: { exalted: 141 }, itemOverviews: [] }), map, {})
    expect(map.get('divine orb')).toMatchObject({ chaosValue: 141, divineValue: 1 })
    expect(map.get('divine orb')?.graph).toBeUndefined()
    expect(map.get('exalted orb')).toMatchObject({ chaosValue: 1, divineValue: 1 / 141 })
  })

  it('carries an exalted sparkline from a currency overview line onto the canonical exalted entry and into entriesOut', () => {
    const map = new Map<string, PriceInfo>()
    const variantMap = new Map<string, PriceInfo>()
    const entries: import('@shared/types').PriceEntry[] = []
    applyProxyResponse(
      resp({
        rates: { exalted: 141 },
        itemOverviews: [
          {
            type: 'Currency',
            lines: [
              { name: 'Divine Orb', primaryValue: 0.97, sparkline: { data: [0, 5, 12] } },
              { name: 'Exalted Orb', primaryValue: 0.0071, sparkline: { data: [0, -3, -7] } },
            ],
          },
        ],
      }),
      map,
      { Currency: 'currency' },
      variantMap,
      entries,
    )
    // Canonical values win over the drifted overview primaryValue, but graphs survive
    expect(map.get('divine orb')).toMatchObject({ chaosValue: 141, divineValue: 1, graph: [0, 5, 12] })
    expect(map.get('exalted orb')).toMatchObject({ chaosValue: 1, divineValue: 1 / 141, graph: [0, -3, -7] })
    // pricesByVariant reuses the same canonical objects
    expect(variantMap.get('exalted orb|')?.graph).toEqual([0, -3, -7])
    // entriesOut has exactly one Exalted Orb entry carrying the exalted graph
    const exaltedEntries = entries.filter((e) => e.name === 'Exalted Orb')
    expect(exaltedEntries).toHaveLength(1)
    expect(exaltedEntries[0].graph).toEqual([0, -3, -7])
    // entriesOut has exactly one Divine Orb entry carrying the divine graph
    const divineEntries = entries.filter((e) => e.name === 'Divine Orb')
    expect(divineEntries).toHaveLength(1)
    expect(divineEntries[0].graph).toEqual([0, 5, 12])
  })

  it('deduplicates: when a Currency line mentions Divine Orb, entriesOut has exactly one Divine Orb entry (canonical) and pricesByVariant carries the canonical chaosValue', () => {
    const map = new Map<string, PriceInfo>()
    const variantMap = new Map<string, PriceInfo>()
    const entries: import('@shared/types').PriceEntry[] = []
    applyProxyResponse(
      resp({
        rates: { exalted: 150 },
        itemOverviews: [
          {
            type: 'Currency',
            // The overview line carries a drifted primaryValue and a sparkline
            lines: [{ name: 'Divine Orb', primaryValue: 0.95, sparkline: { data: [1, 2, 3] } }],
          },
        ],
      }),
      map,
      { Currency: 'currency' },
      variantMap,
      entries,
    )
    const divineEntries = entries.filter((e) => e.name === 'Divine Orb')
    // Exactly one entry - the canonical one
    expect(divineEntries).toHaveLength(1)
    expect(divineEntries[0].chaosValue).toBe(150)
    // pricesByVariant also carries the canonical chaosValue
    expect(variantMap.get('divine orb|')?.chaosValue).toBe(150)
  })
})

describe('fetchPoe2PricesFromProxy', () => {
  it('returns priceMap + pricesByVariant + uniquesByBase for a known league', async () => {
    const stubResp = {
      core: { primary: 'divine', rates: { exalted: 200 } },
      itemOverviews: [
        { type: 'Currency', lines: [{ name: 'Chaos Orb', primaryValue: 1 }] },
        { type: 'UniqueJewels', lines: [{ name: 'Grand Spectrum', variant: 'Emerald', primaryValue: 5 }] },
      ],
    }
    const fetchJson = async (_url: string) => stubResp
    const result = await fetchPoe2PricesFromProxy(
      'Runes of Aldur',
      fetchJson,
      { Currency: 'currency' },
      {
        Emerald: ['Old Static Jewel'],
      },
    )
    expect(result.priceMap.get('chaos orb')).toMatchObject({ chaosValue: 200, divineValue: 1 })
    expect(result.priceMap.get('divine orb')).toMatchObject({ chaosValue: 200, divineValue: 1 })
    expect(result.pricesByVariant.get('grand spectrum|Emerald')).toMatchObject({ divineValue: 5 })
    expect(new Set(result.uniquesByBase.Emerald)).toEqual(new Set(['Old Static Jewel', 'Grand Spectrum']))
  })

  it('throws on an unknown league name', async () => {
    const fetchJson = async (_url: string) => ({})
    await expect(fetchPoe2PricesFromProxy('Unknown League', fetchJson, {}, {})).rejects.toThrow(
      'Unsupported PoE2 league for proxy: Unknown League',
    )
  })

  it.each([
    ['Runes of Aldur', 'league'],
    ['HC Runes of Aldur', 'leaguehc'],
    ['Standard', 'standard'],
    ['Hardcore', 'standardhc'],
  ])('hits %s -> %s slug', async (league, slug) => {
    let capturedUrl = ''
    const fetchJson = async (url: string) => {
      capturedUrl = url
      return { core: { primary: 'divine', rates: { exalted: 100 } }, itemOverviews: [] }
    }
    await fetchPoe2PricesFromProxy(league, fetchJson, {}, {})
    expect(capturedUrl).toBe(`https://api.exiledexchange2.dev/proxy/${slug}/overviewData.json`)
  })
})

describe('fetchAndBuildPoe2PriceMap (direct-ninja fallback)', () => {
  it('returns a populated priceMap, an empty pricesByVariant, and a cloned static uniquesByBase', async () => {
    const exchange = {
      core: {
        primary: 'divine',
        secondary: 'exalted',
        rates: { exalted: 100 },
        items: [{ id: 'divine', name: 'Divine Orb' }],
      },
      lines: [],
      items: [],
    }
    const fetchJson = async (_url: string) => exchange
    const staticMap = { Emerald: ['Old Static Jewel'] }
    const result = await fetchAndBuildPoe2PriceMap('Runes of Aldur', fetchJson, {}, staticMap)
    expect(result.priceMap.get('divine orb')).toMatchObject({ chaosValue: 100, divineValue: 1 })
    expect(result.pricesByVariant.size).toBe(0)
    expect(result.uniquesByBase).toEqual(staticMap)
    expect(result.uniquesByBase).not.toBe(staticMap)
  })
})

describe('buildPoe2UniquesByBaseFromProxy', () => {
  const proxyResp = (itemOverviews: Array<{ type: string; lines: Array<{ name?: string; variant?: string }> }>) =>
    ({ core: { primary: 'divine', rates: { exalted: 100 } }, itemOverviews }) as Parameters<
      typeof buildPoe2UniquesByBaseFromProxy
    >[0]

  it('maps each unique line variant (base type) to its names', () => {
    const out = buildPoe2UniquesByBaseFromProxy(
      proxyResp([
        {
          type: 'UniqueWeapons',
          lines: [
            { name: 'Sacred Flame', variant: 'Shrine Sceptre' },
            { name: "Lioneye's Glare", variant: 'Heavy Bow' },
          ],
        },
        { type: 'UniqueJewels', lines: [{ name: 'Grand Spectrum', variant: 'Emerald' }] },
      ]),
      {},
    )
    expect(out['Shrine Sceptre']).toContain('Sacred Flame')
    expect(out['Heavy Bow']).toContain("Lioneye's Glare")
    expect(out.Emerald).toContain('Grand Spectrum')
  })

  it('merges with the static map (union per base, dynamic supplements static)', () => {
    const out = buildPoe2UniquesByBaseFromProxy(
      proxyResp([{ type: 'UniqueJewels', lines: [{ name: 'Grand Spectrum', variant: 'Emerald' }] }]),
      { Emerald: ['Old Static Jewel'], 'Amber Amulet': ['Carnage Heart'] },
    )
    expect(new Set(out.Emerald)).toEqual(new Set(['Old Static Jewel', 'Grand Spectrum']))
    expect(out['Amber Amulet']).toEqual(['Carnage Heart'])
  })

  it('ignores non-unique overviews and lines missing name or variant', () => {
    const out = buildPoe2UniquesByBaseFromProxy(
      proxyResp([
        { type: 'Currency', lines: [{ name: 'Chaos Orb', variant: 'Chaos Orb' }] },
        { type: 'UniqueArmours', lines: [{ name: 'NoVariant' }, { variant: 'NoName' }] },
      ]),
      {},
    )
    expect(out['Chaos Orb']).toBeUndefined()
    expect(Object.keys(out)).toEqual([])
  })

  it('does not mutate the passed static map', () => {
    const staticMap = { Emerald: ['Old Static Jewel'] }
    buildPoe2UniquesByBaseFromProxy(
      proxyResp([{ type: 'UniqueJewels', lines: [{ name: 'Grand Spectrum', variant: 'Emerald' }] }]),
      staticMap,
    )
    expect(staticMap).toEqual({ Emerald: ['Old Static Jewel'] })
  })
})
