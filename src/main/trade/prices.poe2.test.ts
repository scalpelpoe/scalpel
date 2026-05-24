import { describe, expect, it } from 'vitest'
import type { PriceInfo } from '../../shared/types'
import { applyResponse } from './prices.poe2'

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
