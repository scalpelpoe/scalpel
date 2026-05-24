import { describe, expect, it } from 'vitest'
import type { PriceInfo } from '../../shared/types'
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
      'Fate of the Vaal',
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
    ['Fate of the Vaal', 'league'],
    ['HC Fate of the Vaal', 'leaguehc'],
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
    const result = await fetchAndBuildPoe2PriceMap('Fate of the Vaal', fetchJson, {}, staticMap)
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
