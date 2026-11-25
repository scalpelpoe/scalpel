import { beforeEach, describe, expect, it, vi } from 'vitest'

// Golden test: the body searchTrade POSTs is captured through the mocked net layer.
// Same fixtures later feed buildTradeQuery, which must reproduce it byte for byte.
const capturedRequests: Array<{ url: string; method: string; body?: string }> = []

vi.mock('electron', () => ({
  ipcMain: { on: vi.fn(), handle: vi.fn(), removeListener: vi.fn() },
  app: { userAgentFallback: 'Scalpel-Test/1.0', on: vi.fn(), isReady: () => false },
  net: {
    request: vi.fn((opts: { url: string; method: string }) => {
      const entry = { url: opts.url, method: opts.method } as { url: string; method: string; body?: string }
      capturedRequests.push(entry)
      let responseCb: ((resp: unknown) => void) | null = null
      return {
        on: (event: string, cb: unknown) => {
          if (event === 'response') responseCb = cb as typeof responseCb
        },
        setHeader: vi.fn(),
        write: vi.fn((body: string) => {
          entry.body = body
        }),
        end: vi.fn(() => {
          queueMicrotask(() => {
            if (!responseCb) return
            let dataCb: ((chunk: unknown) => void) | null = null
            let endCb: (() => void) | null = null
            responseCb({
              statusCode: 200,
              headers: {},
              on: (event: string, cb: unknown) => {
                if (event === 'data') dataCb = cb as typeof dataCb
                if (event === 'end') endCb = cb as typeof endCb
              },
            })
            ;(dataCb as ((chunk: unknown) => void) | null)?.('{"result":[],"total":0,"id":"q"}')
            ;(endCb as (() => void) | null)?.()
          })
        }),
      }
    }),
  },
}))

vi.mock('./stat-matcher', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, ensureStatsLoaded: vi.fn().mockResolvedValue(undefined) }
})

import { setPoeVersion } from '../game-state'
import { parseItemText } from './clipboard'
import { defensesFromPoeItem, itemInfoFromPoeItem, tradeItemFromPoeItem } from './item-info'
import { _setStatEntriesForTests, matchItemMods } from './stat-matcher'
import { applyTimelessSearch } from './stat-matcher/producers/timeless'
import { _resetRateLimitsForTests, buildTradeQuery, searchTrade } from './trade'
import { bodyArmourText, FIXTURES, ringText, STAT_ENTRIES } from './__fixtures__/poe2-trade-items'

function filtersFor(text: string) {
  const item = parseItemText(text)!
  const filters = matchItemMods(
    item.explicits,
    item.implicits,
    defensesFromPoeItem(item),
    itemInfoFromPoeItem(item),
    item.advancedMods,
    90,
  )
  return { item, filters }
}

beforeEach(() => {
  setPoeVersion(2)
  _setStatEntriesForTests(STAT_ENTRIES)
  capturedRequests.length = 0
  _resetRateLimitsForTests()
})

describe('searchTrade POST body (golden)', () => {
  for (const [name, text] of Object.entries(FIXTURES)) {
    it(`posts the golden body: ${name}`, async () => {
      const { item, filters } = filtersFor(text)
      await searchTrade(
        'Fate of the Vaal',
        {
          name: item.name,
          baseType: item.baseType,
          itemClass: item.itemClass,
          rarity: item.rarity,
          armour: item.armour,
          evasion: item.evasion,
          energyShield: item.energyShield,
          ward: item.ward,
          block: item.block,
          vaalGem: item.vaalGem,
        },
        filters,
        { loggedIn: false },
      )
      const req = capturedRequests.find((r) => r.url.includes('/search/'))
      expect(JSON.stringify(JSON.parse(req!.body!), null, 2)).toMatchSnapshot()
    })
  }
})

describe('buildTradeQuery', () => {
  for (const [name, text] of Object.entries(FIXTURES)) {
    it(`builds the same body searchTrade posts: ${name}`, () => {
      // Same filters as the golden block above (both come from filtersFor, which uses the
      // production item-info mapping), so only the query construction is under comparison.
      const { item, filters } = filtersFor(text)
      const { body } = buildTradeQuery(tradeItemFromPoeItem(item), filters, { loggedIn: false })
      expect(JSON.stringify(JSON.parse(JSON.stringify(body)), null, 2)).toMatchSnapshot()
    })
  }
})

// 3.30 Viscera: trade indexes every tier of a part under the bare base ("Pocked
// Leg") and answers "Unknown item base type" to the prefixed name, and the roll
// lives on an implicit.* id.
describe('buildTradeQuery: PoE1 Viscera', () => {
  const lesserPockedLeg = [
    'Item Class: Viscera',
    'Lesser Pocked Leg',
    '--------',
    'Lower Limb',
    '--------',
    'Item Level: 34',
    '--------',
    '{ Implicit Modifier }',
    '25(20-30)% increased Armour from Equipped Helmet and Gloves',
    '--------',
    'Take this to the Wickerman in a town or hideout to attach it.',
  ].join('\n')

  beforeEach(() => {
    setPoeVersion(1)
    _setStatEntriesForTests([
      {
        id: 'implicit.stat_791154540',
        text: '#% increased Armour from Equipped Helmet and Gloves',
        type: 'implicit',
      },
    ])
  })

  it('searches the bare base type with the roll as an implicit stat', () => {
    const { item, filters } = filtersFor(lesserPockedLeg)
    const { body } = buildTradeQuery(tradeItemFromPoeItem(item), filters, { loggedIn: false })
    const query = body.query as {
      type?: unknown
      stats: Array<{ filters?: Array<{ id: string; value?: { min?: number } }> }>
    }

    expect(query.type).toBe('Pocked Leg')
    const statFilters = query.stats.flatMap((g) => g.filters ?? [])
    expect(statFilters.map((f) => f.id)).toEqual(['implicit.stat_791154540'])
    // On by default, at the rolled value like every other implicit chip.
    expect(statFilters[0].value?.min).toBe(25)
  })
})

describe('buildTradeQuery: PoE1 Timeless Jewel', () => {
  // The seed line is fed straight to the matcher: real copies deliver it through the
  // advanced mods, and a basic copy's seed section has no +/% roll for the clipboard
  // parser to tell it apart from flavour text.
  const item = { name: 'Glorious Vanity', baseType: 'Timeless Jewel', itemClass: 'Jewels', rarity: 'Unique' }
  const chips = () =>
    matchItemMods(
      ['Bathed in the blood of 7421 sacrificed in the name of Doryani', 'Passives in radius are Conquered by the Vaal'],
      [],
      undefined,
      {
        ...item,
        sockets: '',
        linkedSockets: 0,
        quality: 0,
        itemLevel: 86,
        gemLevel: 0,
        corrupted: false,
        mirrored: false,
      },
    )

  type StatGroup = { type: string; filters: Array<{ id: string; value?: { min?: number; max?: number } }> }
  const timelessGroups = (filters: ReturnType<typeof matchItemMods>) =>
    (buildTradeQuery(item, filters, { loggedIn: false }).body.query.stats as StatGroup[]).filter((g) =>
      g.filters.some((f) => f.id.startsWith('explicit.pseudo_timeless_jewel_')),
    )

  beforeEach(() => {
    setPoeVersion(1)
    _setStatEntriesForTests([])
  })

  it('seed (default): the seed under any leader', () => {
    for (const filters of [chips(), applyTimelessSearch(chips(), 'seed')]) {
      const groups = timelessGroups(filters)
      expect(groups).toHaveLength(1)
      expect(groups[0].type).toBe('count')
      expect(groups[0].filters.map((f) => f.id)).toContain('explicit.pseudo_timeless_jewel_xibaqua')
      expect(groups[0].filters.every((f) => f.value?.min === 7421 && f.value?.max === 7421)).toBe(true)
    }
  })

  it('leader: own leader at any seed', () => {
    expect(timelessGroups(applyTimelessSearch(chips(), 'leader'))).toEqual([
      { type: 'and', filters: [{ id: 'explicit.pseudo_timeless_jewel_doryani', value: {} }] },
    ])
  })

  it('both: seed + own leader', () => {
    expect(timelessGroups(applyTimelessSearch(chips(), 'both'))).toEqual([
      {
        type: 'and',
        filters: [{ id: 'explicit.pseudo_timeless_jewel_doryani', value: { min: 7421, max: 7421 } }],
      },
    ])
  })
})

describe('item-info mapping', () => {
  it('maps parsed item fields into the item info and defences', () => {
    const ring = parseItemText(ringText)!
    expect(itemInfoFromPoeItem(ring)).toMatchObject({
      itemLevel: 83,
      rarity: 'Rare',
      itemClass: 'Rings',
      baseType: 'Gold Ring',
    })
    const armour = parseItemText(bodyArmourText)!
    expect(defensesFromPoeItem(armour)).toEqual({
      armour: 0,
      evasion: 542,
      energyShield: 203,
      ward: 0,
      block: 0,
    })
  })
})
