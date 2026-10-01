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
