import { beforeEach, describe, expect, it, vi } from 'vitest'

// Capture per-request state for the searchTrade assertions below. trade.ts imports
// electron's `net` at module scope, so the mock has to be installed before `./trade`
// is loaded. Tests that don't care about captured requests (e.g. buildGemTypeField)
// still work -- they just never call into a path that invokes net.request.
const capturedRequests: Array<{ url: string; method: string; body?: string }> = []

interface CapturedTradeFilterGroup {
  filters: Record<string, { min?: number; option?: string }>
}

interface CapturedTradeStatGroup {
  type: string
  filters?: Array<{ id: string; value?: Record<string, unknown> }>
  value?: { min?: number; max?: number }
}

interface CapturedTradeBody {
  query: {
    filters: {
      armour_filters: CapturedTradeFilterGroup
      equipment_filters: CapturedTradeFilterGroup
      socket_filters: CapturedTradeFilterGroup
      type_filters: CapturedTradeFilterGroup
      weapon_filters: CapturedTradeFilterGroup
      map_filters?: CapturedTradeFilterGroup
      misc_filters?: CapturedTradeFilterGroup
    }
    name?: string
    stats: Array<CapturedTradeStatGroup>
    type?: string
  }
}

function parseCapturedBody(req: { body?: string } | undefined): CapturedTradeBody {
  if (!req?.body) throw new Error('Expected captured request body')
  return JSON.parse(req.body) as CapturedTradeBody
}

vi.mock('electron', () => ({
  // overlay.ts (pulled in transitively via trade.ts -> icon-cache.ts) registers
  // an ipcMain listener at module scope, so the mock has to expose ipcMain even
  // though these tests never exercise it.
  ipcMain: { on: vi.fn(), handle: vi.fn(), removeListener: vi.fn() },
  // trade.ts reads `app.userAgentFallback` on every request so we set a UA
  // the way APT/EE2 do. Tests don't exercise the value, just need it to exist.
  // `on` covers the before-quit listener windowing/index.ts registers at module
  // scope (pulled in transitively via overlay.ts).
  app: { userAgentFallback: 'Scalpel-Test/1.0', on: vi.fn() },
  net: {
    request: vi.fn((opts: { url: string; method: string }) => {
      const entry = { url: opts.url, method: opts.method } as {
        url: string
        method: string
        body?: string
      }
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

// Skip the real stats fetch (would hang on the mocked net). Everything else from
// stat-matcher (ITEM_CLASS_TO_CATEGORY, etc.) comes through unchanged.
vi.mock('./stat-matcher', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, ensureStatsLoaded: vi.fn().mockResolvedValue(undefined) }
})

import {
  buildGemTypeField,
  buildRegexStatGroups,
  isBulkExchangeItem,
  searchTrade,
  searchTabletsByRegex,
  searchWaystonesByRegex,
  searchNeedsLogin,
  stripTradeTokens,
  _resetRateLimitsForTests,
  type StatFilter,
} from './trade'
import { setPoeVersion } from '../game-state'
import { matchItemMods, _setStatEntriesForTests } from './stat-matcher'

// Shared rare-body-armour fixture for the searchTrade describes below. The
// evasion/energyShield feed the defence-filter tests and are harmless to the
// pseudo tests (which pass no defence filters).
const bodyArmourItem = {
  name: '',
  baseType: "Falconer's Jacket",
  itemClass: 'Body Armours',
  rarity: 'Rare',
  evasion: 542,
  energyShield: 203,
}

describe('buildGemTypeField', () => {
  it('returns baseType as a plain string for a regular gem', () => {
    expect(buildGemTypeField('Fireball', false)).toBe('Fireball')
    expect(buildGemTypeField('Fireball', undefined)).toBe('Fireball')
  })

  it('returns discriminator form for a transfigured gem', () => {
    // Spark of Unpredictability is alt_y in TRANSFIGURED_GEM_DISC.
    expect(buildGemTypeField('Spark of Unpredictability', false)).toEqual({
      option: 'Spark',
      discriminator: 'alt_y',
    })
  })

  it('prepends "Vaal " to the option for a Vaal-corrupted transfigured gem', () => {
    // The case that originally prompted the fix: the trade site wants the
    // `option` to be the Vaal base skill, not the transfigured name.
    expect(buildGemTypeField('Spark of Unpredictability', true)).toEqual({
      option: 'Vaal Spark',
      discriminator: 'alt_y',
    })
  })

  it('prepends "Vaal " to baseType for a Vaal-corrupted non-transfigured gem', () => {
    expect(buildGemTypeField('Fireball', true)).toBe('Vaal Fireball')
  })

  it('does not double-prepend "Vaal " when baseType already starts with it', () => {
    expect(buildGemTypeField('Vaal Fireball', true)).toBe('Vaal Fireball')
  })
})

describe('stripTradeTokens', () => {
  it('replaces [key|display] with display', () => {
    expect(stripTradeTokens('30% reduced [Attributes|Attribute] Requirements')).toBe(
      '30% reduced Attribute Requirements',
    )
  })

  it('replaces [key] with key when no pipe', () => {
    expect(stripTradeTokens('+48 to [Spirit]')).toBe('+48 to Spirit')
  })

  it('handles multiple tokens in one line', () => {
    expect(stripTradeTokens('85% increased [Evasion] and [EnergyShield|Energy Shield]')).toBe(
      '85% increased Evasion and Energy Shield',
    )
  })

  it('leaves PoE1 strings unchanged (no brackets to match)', () => {
    expect(stripTradeTokens('+186 to maximum Life')).toBe('+186 to maximum Life')
  })
})

// Catches the exact regression that broke PoE2 search on first ship: PoE1 used
// `armour_filters` / `weapon_filters` but the PoE2 API returns 400 "Unknown filter
// group" and demands everything under `equipment_filters`. Anyone who edits
// TRADE_DIALECTS or the defence/weapon filter branches has this test as a guard.
describe('searchTrade filter-group dispatch', () => {
  const defenceFilters: StatFilter[] = [
    {
      id: 'defence.evasion',
      text: '',
      type: 'defence',
      enabled: true,
      value: 542,
      min: 487,
      max: null,
    },
    {
      id: 'defence.energy_shield',
      text: '',
      type: 'defence',
      enabled: true,
      value: 203,
      min: 182,
      max: null,
    },
  ]

  beforeEach(() => {
    capturedRequests.length = 0
    // The proactive rate limiter's seed buckets live across the test module,
    // so a test that fires a request leaves a used slot behind for the next
    // one. Reset them each case or the second test hits the 5-second window
    // wait and fails the default 5s vitest timeout.
    _resetRateLimitsForTests()
  })

  it('PoE1 rare body armour uses armour_filters, never equipment_filters', async () => {
    setPoeVersion(1)
    await searchTrade('Mirage', bodyArmourItem, defenceFilters, {
      tradeStatus: 'any',
      tradePriceOption: 'chaos_divine',
    })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    expect(req).toBeDefined()
    expect(req?.url).toContain('/api/trade/search/')
    const body = parseCapturedBody(req)
    expect(body.query.filters.armour_filters).toBeDefined()
    expect(body.query.filters.armour_filters.filters.ev.min).toBe(487)
    expect(body.query.filters.equipment_filters).toBeUndefined()
  })

  it('PoE2 rare body armour uses equipment_filters, never armour_filters or weapon_filters', async () => {
    setPoeVersion(2)
    await searchTrade('Fate of the Vaal', bodyArmourItem, defenceFilters, {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
    })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    expect(req).toBeDefined()
    expect(req?.url).toContain('/api/trade2/search/')
    // Realm segment belongs in the browser URL only, not the API URL (per EE2).
    expect(req?.url).not.toContain('/poe2/')
    const body = parseCapturedBody(req)
    expect(body.query.filters.equipment_filters).toBeDefined()
    expect(body.query.filters.equipment_filters.filters.ev.min).toBe(487)
    expect(body.query.filters.equipment_filters.filters.es.min).toBe(182)
    expect(body.query.filters.armour_filters).toBeUndefined()
    expect(body.query.filters.weapon_filters).toBeUndefined()
  })

  it('Large Cluster Jewel routes to jewel.cluster category (not generic jewel)', async () => {
    setPoeVersion(1)
    const clusterItem = {
      name: '',
      baseType: 'Large Cluster Jewel',
      itemClass: 'Jewels',
      rarity: 'Rare',
    }
    await searchTrade('Mirage', clusterItem, [], { tradeStatus: 'any', tradePriceOption: 'chaos_divine' })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    expect(req).toBeDefined()
    const body = parseCapturedBody(req)
    expect(body.query.filters.type_filters.filters.category).toEqual({ option: 'jewel.cluster' })
  })

  it('PoE2 rare Quarterstaff routes to weapon.warstaff category, not a base-type-only search', async () => {
    setPoeVersion(2)
    // The in-game clipboard reports "Item Class: Quarterstaves"; the trade
    // category id is still weapon.warstaff. Before the fix the class name was
    // keyed as "Warstaves", so the lookup missed and the query fell back to
    // query.type = baseType, restricting results to the same base.
    const quarterstaff = {
      name: '',
      baseType: 'Slicing Quarterstaff',
      itemClass: 'Quarterstaves',
      rarity: 'Rare',
    }
    await searchTrade('Fate of the Vaal', quarterstaff, [], {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
    })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    expect(req).toBeDefined()
    const body = parseCapturedBody(req)
    expect(body.query.filters.type_filters.filters.category).toEqual({ option: 'weapon.warstaff' })
    expect(body.query.type).toBeUndefined()
  })

  it('PoE2 Relic routes to sanctum.relic category and sends sanctum stat filters', async () => {
    setPoeVersion(2)
    const relic = {
      name: '',
      baseType: 'Urn Relic',
      itemClass: 'Relics',
      rarity: 'Magic',
    }
    const relicStats: StatFilter[] = [
      {
        id: 'sanctum.stat_1583320325',
        text: '10% increased Honour restored',
        type: 'sanctum',
        enabled: true,
        value: 10,
        min: 9,
        max: null,
      },
    ]
    await searchTrade('Fate of the Vaal', relic, relicStats, {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
    })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    expect(req).toBeDefined()
    const body = parseCapturedBody(req)
    expect(body.query.filters.type_filters.filters.category).toEqual({ option: 'sanctum.relic' })
    expect(body.query.type).toBeUndefined()
    const andGroup = body.query.stats.find((g) => g.type === 'and')
    expect(andGroup).toBeDefined()
    expect(andGroup?.filters?.map((f) => f.id)).toContain('sanctum.stat_1583320325')
  })

  it('PoE2 Tablet routes to map.tablet category, not a base-type-only search', async () => {
    setPoeVersion(2)
    const tablet = {
      name: '',
      baseType: 'Overseer Tablet',
      itemClass: 'Tablet',
      rarity: 'Magic',
    }
    await searchTrade('Fate of the Vaal', tablet, [], {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
    })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    expect(req).toBeDefined()
    const body = parseCapturedBody(req)
    expect(body.query.filters.type_filters.filters.category).toEqual({ option: 'map.tablet' })
    expect(body.query.type).toBeUndefined()
  })

  it('PoE2 Waystone routes to map.waystone category with an enabled tier map_filter', async () => {
    setPoeVersion(2)
    const waystone = {
      name: '',
      baseType: 'Waystone (Tier 15)',
      itemClass: 'Waystones',
      rarity: 'Rare',
    }
    const waystoneFilters: StatFilter[] = [
      { id: 'map.map_tier', text: 'Tier: 15', type: 'map', enabled: true, value: 15, min: 15, max: 15 },
      { id: 'map.map_iir', text: 'Rarity: 60', type: 'map', enabled: false, value: 60, min: 54, max: null },
    ]
    await searchTrade('Fate of the Vaal', waystone, waystoneFilters, {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
    })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    expect(req).toBeDefined()
    const body = parseCapturedBody(req)
    expect(body.query.filters.type_filters.filters.category).toEqual({ option: 'map.waystone' })
    expect(body.query.type).toBeUndefined()
    // Enabled tier lands in map_filters; disabled rarity does not.
    const mapFilters = (body.query.filters as Record<string, { filters: Record<string, unknown> }>).map_filters
    expect(mapFilters.filters.map_tier).toEqual({ min: 15, max: 15 })
    expect(mapFilters.filters.map_iir).toBeUndefined()
  })

  it('unique captured beast searches by type only (no name field)', async () => {
    setPoeVersion(1)
    // Beasts arrive from clipboard with rarity Unique, itemClass Stackable Currency,
    // and name == baseType (no separate base-type line in the clipboard text). The
    // trade API's beast listings have an empty name field, so adding query.name
    // AND-filters every result out -- match APT and search by type only.
    const beast = {
      name: 'Craiceann, First of the Deep',
      baseType: 'Craiceann, First of the Deep',
      itemClass: 'Stackable Currency',
      rarity: 'Unique',
    }
    await searchTrade('Mirage', beast, [], { tradeStatus: 'any', tradePriceOption: 'chaos_divine' })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    expect(req).toBeDefined()
    const body = parseCapturedBody(req)
    expect(body.query.type).toBe('Craiceann, First of the Deep')
    expect(body.query.name).toBeUndefined()
  })

  it('unidentified unique searches by type + rarity:unique, not by name', async () => {
    setPoeVersion(2)
    // An unidentified unique has no name line in the clipboard, so the parser sets
    // name == baseType. Sending that as query.name searches for a unique literally
    // named "Heavy Belt" (no such unique) -> 0 results. Search by base + rarity unique.
    const unidUnique = {
      name: 'Heavy Belt',
      baseType: 'Heavy Belt',
      itemClass: 'Belts',
      rarity: 'Unique',
    }
    const filters: StatFilter[] = [
      { id: 'misc.identified', text: 'Unidentified', type: 'misc', enabled: true, value: null, min: null, max: null },
    ]
    await searchTrade('Fate of the Vaal', unidUnique, filters, { tradeStatus: 'any' })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    expect(body.query.name).toBeUndefined()
    expect(body.query.type).toBe('Heavy Belt')
    expect(body.query.filters.type_filters.filters.rarity).toEqual({ option: 'unique' })
  })

  it('unidentified unique with a known name (clicked from the uniques list) searches by name', async () => {
    setPoeVersion(2)
    // Clicking a specific unique in the UniquesForBase list builds an unidentified
    // synthetic whose name is the real unique name (name != baseType). The unid chip
    // is on, but we DO know which unique it is, so the search must filter by name --
    // not fall back to the base + rarity:unique catch-all.
    const clickedUnique = {
      name: 'Gifts from Above',
      baseType: 'Prismatic Ring',
      itemClass: 'Rings',
      rarity: 'Unique',
    }
    const filters: StatFilter[] = [
      { id: 'misc.identified', text: 'Unidentified', type: 'misc', enabled: true, value: null, min: null, max: null },
    ]
    await searchTrade('Runes of Aldur', clickedUnique, filters, { tradeStatus: 'any' })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    expect(body.query.name).toBe('Gifts from Above')
    expect(body.query.type).toBe('Prismatic Ring')
    expect(body.query.filters?.type_filters?.filters?.rarity).toBeUndefined()
  })

  it('unidentified item still sends enchant filters (cluster jewel passive count survives id)', async () => {
    setPoeVersion(1)
    const unidCluster = {
      name: '',
      baseType: 'Large Cluster Jewel',
      itemClass: 'Jewels',
      rarity: 'Rare',
    }
    const filters: StatFilter[] = [
      { id: 'misc.identified', text: 'Unidentified', type: 'misc', enabled: true, value: null, min: null, max: null },
      {
        id: 'enchant.stat_3086156145',
        text: 'Adds 8 Passive Skills',
        type: 'enchant',
        enabled: true,
        value: 8,
        min: null,
        max: 8,
      },
      {
        id: 'explicit.stat_2828710986',
        text: 'Added Small Passive Skills also grant: ...',
        type: 'explicit',
        enabled: true,
        value: null,
        min: null,
        max: null,
      },
    ]
    await searchTrade('Mirage', unidCluster, filters, { tradeStatus: 'any', tradePriceOption: 'chaos_divine' })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    const sentIds = body.query.stats[0].filters?.map((f) => f.id)
    // Enchant survives the unid drop, regular explicit does not.
    expect(sentIds).toContain('enchant.stat_3086156145')
    expect(sentIds).not.toContain('explicit.stat_2828710986')
  })

  it('non-cluster Jewels still route to plain jewel category', async () => {
    setPoeVersion(1)
    const abyssJewel = {
      name: '',
      baseType: 'Cobalt Jewel',
      itemClass: 'Jewels',
      rarity: 'Rare',
    }
    await searchTrade('Mirage', abyssJewel, [], { tradeStatus: 'any', tradePriceOption: 'chaos_divine' })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    expect(body.query.filters.type_filters.filters.category).toEqual({ option: 'jewel' })
  })

  it('PoE2 rune_sockets filter lands under equipment_filters alongside defence stats', async () => {
    setPoeVersion(2)
    const withRunes: StatFilter[] = [
      ...defenceFilters,
      { id: 'socket.rune_sockets', text: '2 Rune Sockets', type: 'socket', enabled: true, value: 2, min: 2, max: null },
    ]
    await searchTrade('Fate of the Vaal', bodyArmourItem, withRunes, {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
    })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    expect(body.query.filters.equipment_filters.filters.rune_sockets).toEqual({ min: 2 })
    expect(body.query.filters.equipment_filters.filters.ev.min).toBe(487)
    expect(body.query.filters.socket_filters).toBeUndefined()
  })

  it('enabled misc.unidentified_tier filter lands in misc_filters.filters.unidentified_tier', async () => {
    setPoeVersion(2)
    const crossbow = {
      name: '',
      baseType: 'Trarthan Cannon',
      itemClass: 'Crossbows',
      rarity: 'Magic',
    }
    const unidTierFilter: StatFilter[] = [
      {
        id: 'misc.unidentified_tier',
        text: 'Unid Tier',
        type: 'gem',
        enabled: true,
        value: 4,
        min: 2,
        max: 4,
      },
    ]
    await searchTrade('Fate of the Vaal', crossbow, unidTierFilter, {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
    })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    const miscFilters = (body.query.filters as Record<string, { filters: Record<string, unknown> }>).misc_filters
    expect(miscFilters).toBeDefined()
    expect(miscFilters.filters.unidentified_tier).toEqual({ min: 2, max: 4 })
  })

  it('pseudo-typed misc.area_level (Djinn Barya row) lands in misc_filters and NOT in stats and-group', async () => {
    // Djinn Barya emits area_level with type: 'pseudo' so the renderer shows it
    // as an editable row rather than a chip. The query builder must still route it
    // to misc_filters (by id, not by type) and must NOT let it flow into the stats
    // and-group where 'misc.area_level' is an invalid stat id.
    setPoeVersion(2)
    const barya = {
      name: '',
      baseType: 'Djinn Barya',
      itemClass: 'Trial Coins',
      rarity: 'Normal',
    }
    const areaLevelRow: StatFilter[] = [
      {
        id: 'misc.area_level',
        text: 'Area Level: 75',
        type: 'pseudo',
        enabled: true,
        value: 75,
        min: 75,
        max: 75,
      },
    ]
    await searchTrade('Fate of the Vaal', barya, areaLevelRow, {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
    })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    // (1) area_level lands in misc_filters with both min and max
    const miscFilters = (body.query.filters as Record<string, { filters: Record<string, unknown> }>).misc_filters
    expect(miscFilters).toBeDefined()
    expect(miscFilters.filters.area_level).toEqual({ min: 75, max: 75 })
    // (2) misc.area_level must NOT appear in the stats and-group
    const andGroup = body.query.stats.find((g: { type: string }) => g.type === 'and')
    const andIds = ((andGroup as { filters: Array<{ id: string }> } | undefined)?.filters ?? []).map((f) => f.id)
    expect(andIds).not.toContain('misc.area_level')
  })

  it('enabled misc.gem_sockets row lands in misc_filters.filters.gem_sockets and NOT in stats and-group', async () => {
    // PoE2 support-socket count segments gem prices (5-socket premium). The
    // query builder must route misc.gem_sockets to misc_filters by id and must
    // not let it leak into the stats and-group where it is not a valid stat id.
    setPoeVersion(2)
    const gem = {
      name: '',
      baseType: 'Fireball',
      itemClass: 'Active Skill Gems',
      rarity: 'Normal',
    }
    const socketRow: StatFilter[] = [
      {
        id: 'misc.gem_sockets',
        text: 'Sockets: 3',
        type: 'gem',
        enabled: true,
        value: 3,
        min: 3,
        max: null,
      },
    ]
    await searchTrade('', gem, socketRow, { tradeStatus: 'any', tradePriceOption: 'exalted_divine' })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    const miscFilters = (body.query.filters as Record<string, { filters: Record<string, unknown> }>).misc_filters
    expect(miscFilters).toBeDefined()
    expect(miscFilters.filters.gem_sockets).toEqual({ min: 3 })
    // Must not appear in the stats and-group
    const andGroup = body.query.stats.find((g: { type: string }) => g.type === 'and')
    const andIds = ((andGroup as { filters: Array<{ id: string }> } | undefined)?.filters ?? []).map((f) => f.id)
    expect(andIds).not.toContain('misc.gem_sockets')
  })

  it('PoE1 enabled weapon.damage filter lands under weapon_filters.damage', async () => {
    setPoeVersion(1)
    const sword = {
      name: '',
      baseType: 'Jewelled Foil',
      itemClass: 'Thrusting One Hand Swords',
      rarity: 'Rare',
    }
    const damageFilter: StatFilter[] = [
      {
        id: 'weapon.damage',
        text: 'Damage: 200',
        type: 'weapon',
        enabled: true,
        value: 200,
        min: 180,
        max: null,
        aggregated: true,
      },
    ]
    await searchTrade('Mirage', sword, damageFilter, { tradeStatus: 'any', tradePriceOption: 'chaos_divine' })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    expect(body.query.filters.weapon_filters).toBeDefined()
    expect(body.query.filters.weapon_filters.filters.damage).toEqual({ min: 180 })
  })

  it('PoE2 enabled weapon.damage filter lands under equipment_filters.damage', async () => {
    setPoeVersion(2)
    const quarterstaff = {
      name: '',
      baseType: 'Slicing Quarterstaff',
      itemClass: 'Quarterstaves',
      rarity: 'Rare',
    }
    const damageFilter: StatFilter[] = [
      {
        id: 'weapon.damage',
        text: 'Damage: 200',
        type: 'weapon',
        enabled: true,
        value: 200,
        min: 180,
        max: null,
        aggregated: true,
      },
    ]
    await searchTrade('Fate of the Vaal', quarterstaff, damageFilter, {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
    })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    expect(body.query.filters.equipment_filters).toBeDefined()
    expect(body.query.filters.equipment_filters.filters.damage).toEqual({ min: 180 })
    expect(body.query.filters.weapon_filters).toBeUndefined()
  })

  it('PoE2 enabled misc.ilvl row lands in type_filters.filters.ilvl and NOT in misc_filters.filters.ilvl', async () => {
    setPoeVersion(2)
    const bow = {
      name: '',
      baseType: 'Advanced Dualstring Bow',
      itemClass: 'Bows',
      rarity: 'Rare',
    }
    const ilvlRow: StatFilter[] = [
      {
        id: 'misc.ilvl',
        text: 'Item Level: 80',
        type: 'misc',
        enabled: true,
        value: 80,
        min: 80,
        max: null,
      },
    ]
    await searchTrade('Fate of the Vaal', bow, ilvlRow, {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
    })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    const allFilters = body.query.filters as Record<string, { filters: Record<string, unknown> }>
    // ilvl must be under type_filters on PoE2
    expect(allFilters.type_filters).toBeDefined()
    expect(allFilters.type_filters.filters.ilvl).toEqual({ min: 80 })
    // must NOT appear under misc_filters
    expect(allFilters.misc_filters?.filters?.ilvl).toBeUndefined()
  })

  it('PoE1 enabled misc.ilvl row lands in misc_filters.filters.ilvl and NOT in type_filters.filters.ilvl', async () => {
    setPoeVersion(1)
    const ring = {
      name: '',
      baseType: 'Diamond Ring',
      itemClass: 'Rings',
      rarity: 'Rare',
    }
    const ilvlRow: StatFilter[] = [
      {
        id: 'misc.ilvl',
        text: 'Item Level: 80',
        type: 'misc',
        enabled: true,
        value: 80,
        min: 80,
        max: null,
      },
    ]
    await searchTrade('Mirage', ring, ilvlRow, {
      tradeStatus: 'any',
      tradePriceOption: 'chaos_divine',
    })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    const allFilters = body.query.filters as Record<string, { filters: Record<string, unknown> }>
    // ilvl must be under misc_filters on PoE1
    expect(allFilters.misc_filters).toBeDefined()
    expect(allFilters.misc_filters.filters.ilvl).toEqual({ min: 80 })
    // must NOT appear under type_filters
    expect(allFilters.type_filters?.filters?.ilvl).toBeUndefined()
  })

  it('PoE2 enabled misc.ilvl row with max-only semantics lands as type_filters.filters.ilvl = {max: 80}', async () => {
    setPoeVersion(2)
    const bow = {
      name: '',
      baseType: 'Advanced Dualstring Bow',
      itemClass: 'Bows',
      rarity: 'Rare',
    }
    const ilvlRow: StatFilter[] = [
      {
        id: 'misc.ilvl',
        text: 'Item Level: 80',
        type: 'misc',
        enabled: true,
        value: 80,
        min: null,
        max: 80,
      },
    ]
    await searchTrade('Fate of the Vaal', bow, ilvlRow, {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
    })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    const allFilters = body.query.filters as Record<string, { filters: Record<string, unknown> }>
    expect(allFilters.type_filters).toBeDefined()
    expect(allFilters.type_filters.filters.ilvl).toEqual({ max: 80 })
  })

  it('PoE2 enabled misc.quality (equipment) row lands in type_filters.filters.quality and NOT in misc_filters.filters.quality', async () => {
    setPoeVersion(2)
    const armour = {
      name: '',
      baseType: 'Advanced Plate Armour',
      itemClass: 'Body Armours',
      rarity: 'Rare',
    }
    const qualityRow: StatFilter[] = [
      {
        id: 'misc.quality',
        text: 'Quality: 20',
        type: 'misc',
        enabled: true,
        value: 20,
        min: 20,
        max: null,
      },
    ]
    await searchTrade('Fate of the Vaal', armour, qualityRow, {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
    })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    const allFilters = body.query.filters as Record<string, { filters: Record<string, unknown> }>
    // quality must be under type_filters on PoE2
    expect(allFilters.type_filters).toBeDefined()
    expect(allFilters.type_filters.filters.quality).toEqual({ min: 20 })
    // must NOT appear under misc_filters
    expect(allFilters.misc_filters?.filters?.quality).toBeUndefined()
  })

  it('PoE1 enabled misc.quality row lands in misc_filters.filters.quality and NOT in type_filters.filters.quality', async () => {
    setPoeVersion(1)
    const ring = {
      name: '',
      baseType: 'Diamond Ring',
      itemClass: 'Rings',
      rarity: 'Rare',
    }
    const qualityRow: StatFilter[] = [
      {
        id: 'misc.quality',
        text: 'Quality: 20',
        type: 'misc',
        enabled: true,
        value: 20,
        min: 20,
        max: null,
      },
    ]
    await searchTrade('Mirage', ring, qualityRow, {
      tradeStatus: 'any',
      tradePriceOption: 'chaos_divine',
    })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    const allFilters = body.query.filters as Record<string, { filters: Record<string, unknown> }>
    // quality must be under misc_filters on PoE1
    expect(allFilters.misc_filters).toBeDefined()
    expect(allFilters.misc_filters.filters.quality).toEqual({ min: 20 })
    // must NOT appear under type_filters
    expect(allFilters.type_filters?.filters?.quality).toBeUndefined()
  })

  it('PoE2 enabled misc.quality (gem quality) row lands in type_filters.filters.quality', async () => {
    setPoeVersion(2)
    const gem = {
      name: '',
      baseType: 'Fireball',
      itemClass: 'Active Skill Gems',
      rarity: 'Normal',
    }
    const qualityRow: StatFilter[] = [
      {
        id: 'misc.quality',
        text: 'Quality: 20',
        type: 'gem',
        enabled: true,
        value: 20,
        min: 20,
        max: null,
      },
    ]
    await searchTrade('', gem, qualityRow, {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
    })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    const allFilters = body.query.filters as Record<string, { filters: Record<string, unknown> }>
    // gem quality must also be routed to type_filters on PoE2
    expect(allFilters.type_filters).toBeDefined()
    expect(allFilters.type_filters.filters.quality).toEqual({ min: 20 })
    expect(allFilters.misc_filters?.filters?.quality).toBeUndefined()
  })
})

describe('searchTrade pseudo emission', () => {
  const lifePseudo: StatFilter = {
    id: 'pseudo.pseudo_total_life',
    text: 'Total Life: 120',
    type: 'pseudo',
    enabled: true,
    value: 120,
    min: 108,
    max: null,
    weightFilters: [{ id: 'explicit.stat_life' }, { id: 'explicit.stat_str' }],
  }

  // Added elemental damage is NOT a native PoE2 pseudo id (it 400s), so it is
  // the one that must go out as a Weighted Sum group on PoE2.
  const addsElePseudo: StatFilter = {
    id: 'pseudo.pseudo_adds_elemental_damage',
    text: 'Adds # to # Elemental Damage: 40',
    type: 'pseudo',
    enabled: true,
    value: 40,
    min: 36,
    max: null,
    weightFilters: [{ id: 'explicit.stat_fire_add' }, { id: 'explicit.stat_cold_add' }],
  }

  const addsEleSpellsPseudo: StatFilter = {
    id: 'pseudo.pseudo_adds_elemental_damage_to_spells',
    text: 'Adds # to # Elemental Damage to Spells: 60',
    type: 'pseudo',
    enabled: true,
    value: 60,
    min: 54,
    max: null,
    weightFilters: [{ id: 'explicit.stat_fire_spell' }, { id: 'explicit.stat_cold_spell' }],
  }

  beforeEach(() => {
    capturedRequests.length = 0
    _resetRateLimitsForTests()
  })

  it('PoE2 emits an unsupported pseudo (added ele damage) as a Weighted Sum group, never a native pseudo id', async () => {
    setPoeVersion(2)
    await searchTrade('Fate of the Vaal', bodyArmourItem, [addsElePseudo], {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
    })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    expect(req).toBeDefined()
    const body = JSON.parse(req!.body!)
    const groups = body.query.stats as Array<{
      type: string
      filters: Array<{ id: string; value?: Record<string, unknown>; disabled?: boolean }>
      value?: Record<string, unknown>
      disabled?: boolean
    }>
    const weightGroup = groups.find((g) => g.type === 'weight')
    expect(weightGroup).toBeDefined()
    expect(weightGroup!.disabled).toBe(false)
    // trade2 weight-group filters are {id, disabled:false} -- summed at the
    // implicit default weight of 1, no per-filter value:{weight}.
    expect(weightGroup!.filters).toEqual([
      { id: 'explicit.stat_fire_add', disabled: false },
      { id: 'explicit.stat_cold_add', disabled: false },
    ])
    expect(weightGroup!.value).toEqual({ min: 36 })
    // The native pseudo id must not leak into any and-group.
    const andGroup = groups.find((g) => g.type === 'and')
    const ids = (andGroup?.filters ?? []).map((f) => f.id)
    expect(ids).not.toContain('pseudo.pseudo_adds_elemental_damage')
  })

  it('PoE2 emits one Weighted Sum group per enabled unsupported pseudo', async () => {
    setPoeVersion(2)
    await searchTrade('Fate of the Vaal', bodyArmourItem, [addsElePseudo, addsEleSpellsPseudo], {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
    })
    const body = JSON.parse(capturedRequests.find((r) => r.url.includes('/search/'))!.body!)
    const weightGroups = (
      body.query.stats as Array<{
        type: string
        filters: Array<{ id: string; value?: Record<string, unknown>; disabled?: boolean }>
        value?: Record<string, unknown>
        disabled?: boolean
      }>
    ).filter((g) => g.type === 'weight')
    expect(weightGroups).toHaveLength(2)
    // Groups preserve input order.
    expect(weightGroups[0].filters).toEqual([
      { id: 'explicit.stat_fire_add', disabled: false },
      { id: 'explicit.stat_cold_add', disabled: false },
    ])
    expect(weightGroups[0].value).toEqual({ min: 36 })
    expect(weightGroups[1].filters).toEqual([
      { id: 'explicit.stat_fire_spell', disabled: false },
      { id: 'explicit.stat_cold_spell', disabled: false },
    ])
    expect(weightGroups[1].value).toEqual({ min: 54 })
  })

  it('PoE2 keeps a natively-supported pseudo (Total Life) on the native pseudo path', async () => {
    setPoeVersion(2)
    await searchTrade('Fate of the Vaal', bodyArmourItem, [lifePseudo], {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
    })
    const body = JSON.parse(capturedRequests.find((r) => r.url.includes('/search/'))!.body!)
    const groups = body.query.stats as Array<{ type: string; filters: Array<{ id: string }> }>
    // No weight group: Total Life is a valid PoE2 pseudo id.
    expect(groups.find((g) => g.type === 'weight')).toBeUndefined()
    const andGroup = groups.find((g) => g.type === 'and')
    expect(andGroup).toBeDefined()
    expect(andGroup!.filters.map((f) => f.id)).toContain('pseudo.pseudo_total_life')
  })

  it('PoE1 keeps all calculated pseudos as native pseudo ids in the and group', async () => {
    setPoeVersion(1)
    await searchTrade('Mirage', bodyArmourItem, [lifePseudo, addsElePseudo], {
      tradeStatus: 'any',
      tradePriceOption: 'chaos_divine',
    })
    const body = JSON.parse(capturedRequests.find((r) => r.url.includes('/search/'))!.body!)
    const groups = body.query.stats as Array<{ type: string; filters: Array<{ id: string }> }>
    expect(groups.find((g) => g.type === 'weight')).toBeUndefined()
    const andGroup = groups.find((g) => g.type === 'and')
    expect(andGroup).toBeDefined()
    const ids = andGroup!.filters.map((f) => f.id)
    expect(ids).toContain('pseudo.pseudo_total_life')
    expect(ids).toContain('pseudo.pseudo_adds_elemental_damage')
  })

  it('PoE2: a real matchItemMods supported pseudo stays on the native path', async () => {
    // Fire Resistance feeds Total Elemental Resistance, which IS a valid PoE2
    // pseudo id, so it must stay native -- the regression guard for the
    // over-eager weighted-sum routing that broke supported pseudos.
    _setStatEntriesForTests([{ id: 'explicit.stat_fire', text: '+#% to Fire Resistance', type: 'explicit' }])
    const chips = matchItemMods(['+40% to Fire Resistance'], [], undefined, {
      sockets: '',
      linkedSockets: 0,
      quality: 0,
      itemLevel: 0,
      baseType: '',
      rarity: 'Rare',
      itemClass: 'Body Armours',
      gemLevel: 0,
      corrupted: false,
      mirrored: false,
    })
    const elePseudo = chips.find((f) => f.id === 'pseudo.pseudo_total_elemental_resistance')
    // Guard: if matchItemMods didn't produce the chip we expected, fail loudly.
    expect(elePseudo).toBeDefined()

    setPoeVersion(2)
    await searchTrade('Fate of the Vaal', bodyArmourItem, chips, {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
    })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    expect(req).toBeDefined()
    const body = JSON.parse(req!.body!)
    const groups = body.query.stats as Array<{
      type: string
      filters: Array<{ id: string; value: Record<string, unknown> }>
      value?: Record<string, unknown>
    }>
    // No weight group from a natively-supported pseudo...
    expect(groups.find((g) => g.type === 'weight')).toBeUndefined()
    // ...and the native id IS present on the wire.
    const allFilterIds = groups.flatMap((g) => g.filters.map((f) => f.id))
    expect(allFilterIds).toContain('pseudo.pseudo_total_elemental_resistance')
  })

  it('PoE2 drops the weighted pseudo and flags the result when not logged in', async () => {
    setPoeVersion(2)
    const result = await searchTrade('Fate of the Vaal', bodyArmourItem, [addsElePseudo], {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
      loggedIn: false, // not logged in
    })
    const body = JSON.parse(capturedRequests.find((r) => r.url.includes('/search/'))!.body!)
    const groups = body.query.stats as Array<{ type: string }>
    // No weight group is sent (the API would reject it for an anonymous user)...
    expect(groups.find((g) => g.type === 'weight')).toBeUndefined()
    // ...and the result reports the dropped pseudo id so the UI can prompt a login.
    expect(result.loginRequiredPseudoIds).toEqual(['pseudo.pseudo_adds_elemental_damage'])
  })

  it('PoE2 emits the weighted pseudo and sets no flag when logged in', async () => {
    setPoeVersion(2)
    const result = await searchTrade('Fate of the Vaal', bodyArmourItem, [addsElePseudo], {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
      loggedIn: true, // logged in
    })
    const body = JSON.parse(capturedRequests.find((r) => r.url.includes('/search/'))!.body!)
    const groups = body.query.stats as Array<{ type: string }>
    expect(groups.find((g) => g.type === 'weight')).toBeDefined()
    expect(result.loginRequiredPseudoIds).toBeUndefined()
  })

  it('searchNeedsLogin: true only for an enabled weighted pseudo on PoE2', () => {
    setPoeVersion(2)
    expect(searchNeedsLogin([addsElePseudo])).toBe(true)
    // Natively-supported pseudo needs no login.
    expect(searchNeedsLogin([lifePseudo])).toBe(false)
    // Disabled weighted pseudo needs no login.
    expect(searchNeedsLogin([{ ...addsElePseudo, enabled: false }])).toBe(false)
  })

  it('searchNeedsLogin: false on PoE1 even for an otherwise-weighted pseudo id', () => {
    setPoeVersion(1)
    expect(searchNeedsLogin([addsElePseudo])).toBe(false)
  })
})

describe('isBulkExchangeItem (PoE2 slug-gated routing)', () => {
  it('routes an exchange-eligible item to bulk when it has an exchange ID', () => {
    setPoeVersion(2)
    // Verisium is stackable currency with a seeded exchange slug.
    expect(isBulkExchangeItem('Stackable Currency', 'Verisium', 'Verisium')).toBe(true)
  })

  it('does NOT route an exchange-eligible item to bulk when it has no exchange ID', () => {
    setPoeVersion(2)
    // Panther Idol is class-eligible (Idols) but isn't on the exchange / has no
    // slug -- it should fall through to regular search (AngeBanner still shows).
    expect(isBulkExchangeItem('Idols', 'Panther Idol', 'Panther Idol')).toBe(false)
  })

  it('routes a Normal waystone to bulk (plain tier stacks are exchangeable)', () => {
    setPoeVersion(2)
    expect(isBulkExchangeItem('Waystones', 'Waystone (Tier 13)', 'Waystone (Tier 13)', 'Normal')).toBe(true)
  })

  it('does NOT route a modified waystone to bulk -- its mods carry the value', () => {
    setPoeVersion(2)
    // Rare/Magic waystones aren't stackable, so they can't be on the exchange even
    // though the plain tier slug exists in the bulk map. Regular search instead.
    expect(isBulkExchangeItem('Waystones', 'Cursed Resolve', 'Waystone (Tier 13)', 'Rare')).toBe(false)
    expect(isBulkExchangeItem('Waystones', 'Cursed Resolve', 'Waystone (Tier 13)', 'Magic')).toBe(false)
  })

  it('routes a Normal PoE1 map with a slug to bulk (symmetric with waystones)', () => {
    setPoeVersion(1)
    expect(isBulkExchangeItem('Maps', 'Vaal Temple Map', 'Vaal Temple Map', 'Normal')).toBe(true)
  })

  it('does NOT route a modified PoE1 map to bulk -- mods/name carry the value', () => {
    setPoeVersion(1)
    expect(isBulkExchangeItem('Maps', 'Vaal Temple Map', 'Vaal Temple Map', 'Rare')).toBe(false)
    expect(isBulkExchangeItem('Maps', 'Vaal Temple Map', 'Vaal Temple Map', 'Magic')).toBe(false)
    expect(isBulkExchangeItem('Maps', 'Maze of the Minotaur', 'Vaal Temple Map', 'Unique')).toBe(false)
  })

  it('leaves a plain slugless PoE1 map on regular search (no exchange listing)', () => {
    setPoeVersion(1)
    // Farmable white maps have no slug, so the fallback returns null -> regular.
    expect(isBulkExchangeItem('Maps', 'Cemetery Map', 'Cemetery Map', 'Normal')).toBe(false)
  })
})

describe('buildRegexStatGroups', () => {
  beforeEach(() => {
    _setStatEntriesForTests([
      { id: 'explicit.stat_avoid_one', text: 'Players cannot Regenerate Life', type: 'explicit' },
      { id: 'explicit.stat_want_one', text: 'Area contains # additional packs', type: 'explicit' },
    ])
  })

  it('avoid text produces a single not group with the resolved filter', () => {
    const groups = buildRegexStatGroups(['Players cannot Regenerate Life'], [], 'any')
    expect(groups).toHaveLength(1)
    expect(groups[0].type).toBe('not')
    expect(groups[0].filters).toEqual([{ id: 'explicit.stat_avoid_one', value: {} }])
    expect(groups[0].value).toBeUndefined()
  })

  it('want text with wantMode any produces a count group with value { min: 1 }', () => {
    const groups = buildRegexStatGroups([], ['Area contains # additional packs'], 'any')
    expect(groups).toHaveLength(1)
    expect(groups[0].type).toBe('count')
    expect(groups[0].filters).toEqual([{ id: 'explicit.stat_want_one', value: {} }])
    expect(groups[0].value).toEqual({ min: 1 })
  })

  it('want text with wantMode all produces an and group with no value field', () => {
    const groups = buildRegexStatGroups([], ['Area contains # additional packs'], 'all')
    expect(groups).toHaveLength(1)
    expect(groups[0].type).toBe('and')
    expect(groups[0].filters).toEqual([{ id: 'explicit.stat_want_one', value: {} }])
    expect(groups[0].value).toBeUndefined()
  })

  it('unresolved text is dropped and produces no groups', () => {
    const groups = buildRegexStatGroups(['This mod text does not exist anywhere'], [], 'any')
    expect(groups).toEqual([])
  })

  it('modTextOverrides maps a poe.re text to the correct trade API stat', () => {
    _setStatEntriesForTests([
      { id: 'explicit.stat_grasping_vine', text: 'Monsters inflict # Grasping Vine on Hit', type: 'explicit' },
    ])
    const groups = buildRegexStatGroups(['Monsters inflict # Grasping Vines on Hit'], [], 'any', {
      'Monsters inflict # Grasping Vines on Hit': 'Monsters inflict # Grasping Vine on Hit',
    })
    expect(groups).toHaveLength(1)
    expect(groups[0].type).toBe('not')
    expect(groups[0].filters[0].id).toBe('explicit.stat_grasping_vine')
  })

  it('custom resolveText replaces the default matchModToStat-based resolver', () => {
    // Seeding a stat that would match by default, but the custom resolver returns a
    // completely different id -- verifies the override replaces, not augments.
    _setStatEntriesForTests([{ id: 'explicit.stat_default', text: 'Players cannot Regenerate Life', type: 'explicit' }])
    const customResolver = (_text: string) => 'explicit.stat_custom_id'
    const groups = buildRegexStatGroups([], ['Players cannot Regenerate Life'], 'any', {}, customResolver)
    expect(groups).toHaveLength(1)
    expect(groups[0].type).toBe('count')
    expect(groups[0].filters[0].id).toBe('explicit.stat_custom_id')
  })
})

describe('searchWaystonesByRegex', () => {
  beforeEach(() => {
    capturedRequests.length = 0
    _resetRateLimitsForTests()
    setPoeVersion(2)
  })

  it('routes to map.waystone with tier map_filter and corrupted misc_filter', async () => {
    await searchWaystonesByRegex(
      'Standard',
      14,
      [],
      [],
      'any',
      {},
      {},
      {
        corrupted: true,
        uncorrupted: false,
        delirious: false,
        anyPack: false,
      },
      { packSize: null, monsterEffectiveness: null, monsterRarity: null, itemRarity: null, dropChance: null },
      'any',
      'exalted_divine',
      true,
    )
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    expect(req).toBeDefined()
    const body = parseCapturedBody(req)
    expect(body.query.filters.type_filters.filters.category).toEqual({ option: 'map.waystone' })
    expect(body.query.filters.map_filters?.filters.map_tier).toEqual({ min: 14, max: 14 })
    expect(body.query.filters.misc_filters?.filters.corrupted).toEqual({ option: 'true' })
  })

  it('matches the exact waystone stat, not a tablet-scoped fuzzy match', async () => {
    // Regression: "#% increased Magic Monsters" must resolve to the plain waystone stat,
    // not the breach/tablet "Breaches in your Maps spawn #% increased Magic Monsters".
    // The raw-first resolver matches the placeholder form exactly; strip-first would
    // fuzzy-match the longer scoped stat.
    _setStatEntriesForTests([
      { id: 'explicit.stat_mm', text: '#% increased Magic Monsters', type: 'explicit' },
      { id: 'explicit.stat_breach', text: 'Breaches in your Maps spawn #% increased Magic Monsters', type: 'explicit' },
    ])
    await searchWaystonesByRegex(
      'Standard',
      14,
      [],
      ['#% increased Magic Monsters|Area has patches of Ignited Ground'],
      'any',
      {},
      {},
      {
        corrupted: false,
        uncorrupted: false,
        delirious: false,
        anyPack: false,
      },
      { packSize: null, monsterEffectiveness: null, monsterRarity: null, itemRarity: null, dropChance: null },
      'any',
      'exalted_divine',
      true,
    )
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    const countGroup = body.query.stats.find((g) => g.type === 'count')
    expect(countGroup?.filters).toEqual([{ id: 'explicit.stat_mm', value: {} }])
  })

  it('omits misc_filters entirely when neither corrupted nor uncorrupted is set', async () => {
    await searchWaystonesByRegex(
      'Standard',
      10,
      [],
      [],
      'any',
      {},
      {},
      {
        corrupted: false,
        uncorrupted: false,
        delirious: false,
        anyPack: false,
      },
      { packSize: null, monsterEffectiveness: null, monsterRarity: null, itemRarity: null, dropChance: null },
      'any',
      'exalted_divine',
      true,
    )
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    expect(req).toBeDefined()
    const body = parseCapturedBody(req)
    expect(body.query.filters.misc_filters).toBeUndefined()
  })

  it('sets corrupted option to false when uncorrupted only', async () => {
    await searchWaystonesByRegex(
      'Standard',
      5,
      [],
      [],
      'any',
      {},
      {},
      {
        corrupted: false,
        uncorrupted: true,
        delirious: false,
        anyPack: false,
      },
      { packSize: null, monsterEffectiveness: null, monsterRarity: null, itemRarity: null, dropChance: null },
      'any',
      'exalted_divine',
      true,
    )
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    expect(req).toBeDefined()
    const body = parseCapturedBody(req)
    expect(body.query.filters.misc_filters?.filters.corrupted).toEqual({ option: 'false' })
  })

  it('does NOT send Quantity & yield thresholds to trade (disabled for now)', async () => {
    await searchWaystonesByRegex(
      'Standard',
      14,
      [],
      [],
      'any',
      {},
      {},
      { corrupted: false, uncorrupted: false, delirious: false, anyPack: false },
      { packSize: 50, monsterEffectiveness: 30, monsterRarity: 25, itemRarity: 40, dropChance: 200 },
      'any',
      'exalted_divine',
      true,
    )
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const mapFilters = parseCapturedBody(req).query.filters.map_filters?.filters
    // Only tier is sent; quantity map_filters are commented out in searchWaystonesByRegex.
    expect(mapFilters).toEqual({ map_tier: { min: 14, max: 14 } })
  })

  it('empty texts produce the empty and stats group fallback', async () => {
    await searchWaystonesByRegex(
      'Standard',
      14,
      [],
      [],
      'any',
      {},
      {},
      {
        corrupted: false,
        uncorrupted: false,
        delirious: false,
        anyPack: false,
      },
      { packSize: null, monsterEffectiveness: null, monsterRarity: null, itemRarity: null, dropChance: null },
      'any',
      'exalted_divine',
      true,
    )
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    expect(body.query.stats).toEqual([{ type: 'and', filters: [] }])
  })

  it('any-mode folds delirious into the want count group (matches regex OR semantics)', async () => {
    _setStatEntriesForTests([
      { id: 'explicit.stat_dmg', text: '#% increased Monster Damage', type: 'explicit' },
      { id: 'explicit.stat_delir', text: 'Players in Area are Delirious', type: 'explicit' },
    ])
    await searchWaystonesByRegex(
      'Standard',
      14,
      [],
      ['#% increased Monster Damage'],
      'any',
      {},
      {},
      { corrupted: false, uncorrupted: false, delirious: true, anyPack: false },
      { packSize: null, monsterEffectiveness: null, monsterRarity: null, itemRarity: null, dropChance: null },
      'any',
      'exalted_divine',
      true,
    )
    const body = parseCapturedBody(capturedRequests.find((r) => r.url.includes('/search/')))
    const countGroup = body.query.stats.find((g) => g.type === 'count')
    // Delirious rides in the count group (optional, part of the any-set), not a separate required group.
    expect(countGroup?.filters?.map((f) => f.id).sort()).toEqual(['explicit.stat_delir', 'explicit.stat_dmg'])
    expect(body.query.stats.some((g) => g.type === 'and' && (g.filters?.length ?? 0) > 0)).toBe(false)
  })

  it('all-mode keeps delirious as a separate required and group', async () => {
    _setStatEntriesForTests([
      { id: 'explicit.stat_dmg', text: '#% increased Monster Damage', type: 'explicit' },
      { id: 'explicit.stat_delir', text: 'Players in Area are Delirious', type: 'explicit' },
    ])
    await searchWaystonesByRegex(
      'Standard',
      14,
      [],
      ['#% increased Monster Damage'],
      'all',
      {},
      {},
      { corrupted: false, uncorrupted: false, delirious: true, anyPack: false },
      { packSize: null, monsterEffectiveness: null, monsterRarity: null, itemRarity: null, dropChance: null },
      'any',
      'exalted_divine',
      true,
    )
    const body = parseCapturedBody(capturedRequests.find((r) => r.url.includes('/search/')))
    // In all-mode delirious is a required term: its own `and` group holding just the delir stat.
    expect(
      body.query.stats.some(
        (g) => g.type === 'and' && (g.filters?.length ?? 0) === 1 && g.filters?.[0]?.id === 'explicit.stat_delir',
      ),
    ).toBe(true)
  })
})

describe('searchTabletsByRegex', () => {
  beforeEach(() => {
    capturedRequests.length = 0
    _resetRateLimitsForTests()
    setPoeVersion(2)
  })

  it('routes to map.tablet with magic rarity, want count group, no not group', async () => {
    // "#% increased pack size in map" is a real key in tablet-mods.json;
    // normalizeTabletModKey("20% increased Pack Size in Map") -> "#% increased pack size in map"
    // which maps to "explicit.stat_2017682521".
    await searchTabletsByRegex(
      'Standard',
      ['20% increased Pack Size in Map'],
      'any',
      {},
      { normal: false, magic: true },
      {},
      { enabled: false, value: 1 },
      'any',
      'exalted_divine',
      true,
    )
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    expect(req).toBeDefined()
    const body = parseCapturedBody(req)
    expect(body.query.filters.type_filters.filters.category).toEqual({ option: 'map.tablet' })
    expect(body.query.filters.type_filters.filters.rarity).toEqual({ option: 'magic' })
    const countGroup = body.query.stats.find((g: { type: string }) => g.type === 'count')
    expect(countGroup).toBeDefined()
    expect(countGroup?.value).toEqual({ min: 1 })
    expect(body.query.stats.every((g: { type: string }) => g.type !== 'not')).toBe(true)
  })

  it('resolves a mod that only matches after stripping " in Map" scoping', async () => {
    // A mod absent from tablet-mods.json whose live stat text lacks the " in Map"
    // scoping the tablet clipboard carries. The raw text must miss; the strip fallback
    // (stripTabletMapScoping, placeholders kept) must resolve it to the seeded stat.
    _setStatEntriesForTests([
      { id: 'explicit.stat_womb', text: '#% increased Quantity of Wombgifts found', type: 'explicit' },
    ])
    await searchTabletsByRegex(
      'Standard',
      ['#% increased Quantity of Wombgifts found in Map'],
      'any',
      {},
      { normal: false, magic: false },
      {},
      { enabled: false, value: 1 },
      'any',
      'exalted_divine',
      true,
    )
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    const countGroup = body.query.stats.find((g: { type: string }) => g.type === 'count') as
      | { filters: Array<{ id: string }> }
      | undefined
    expect(countGroup?.filters).toEqual([{ id: 'explicit.stat_womb', value: {} }])
  })

  it('single type flag sets query.type to the base name', async () => {
    await searchTabletsByRegex(
      'Standard',
      [],
      'any',
      {},
      { normal: false, magic: true },
      { breach: true },
      { enabled: false, value: 1 },
      'any',
      'exalted_divine',
      true,
    )
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    expect(body.query.type).toBe('Breach Tablet')
  })

  it('multiple type flags leave query.type unset', async () => {
    await searchTabletsByRegex(
      'Standard',
      [],
      'any',
      {},
      { normal: false, magic: true },
      { breach: true, delirium: true },
      { enabled: false, value: 1 },
      'any',
      'exalted_divine',
      true,
    )
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    expect(body.query.type).toBeUndefined()
  })

  it('no rarity flag omits rarity from type_filters', async () => {
    await searchTabletsByRegex(
      'Standard',
      [],
      'any',
      {},
      { normal: false, magic: false },
      {},
      { enabled: false, value: 1 },
      'any',
      'exalted_divine',
      true,
    )
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    expect(body.query.filters.type_filters.filters.rarity).toBeUndefined()
  })
})

describe('searchTrade rune-base handling', () => {
  beforeEach(() => {
    capturedRequests.length = 0
    _resetRateLimitsForTests()
    setPoeVersion(2)
  })

  it('runemastered unique with rune chip enabled sends type as discriminator object', async () => {
    const runedUnique = {
      name: 'Eventide Petals',
      baseType: 'Runemastered Veridical Chain',
      itemClass: 'Amulets',
      rarity: 'Unique',
    }
    const filters: StatFilter[] = [
      { id: 'misc.rune_base', text: 'Runemastered', type: 'misc', enabled: true, value: null, min: null, max: null },
    ]
    await searchTrade('Runes of Aldur', runedUnique, filters, {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
    })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    expect(body.query.name).toBe('Eventide Petals')
    expect(body.query.type).toEqual({ option: 'Runemastered Veridical Chain', discriminator: 'legacy' })
  })

  it('runemastered unique with rune chip disabled sends the bare base as a plain string', async () => {
    const runedUnique = {
      name: 'Eventide Petals',
      baseType: 'Runemastered Veridical Chain',
      itemClass: 'Amulets',
      rarity: 'Unique',
    }
    const filters: StatFilter[] = [
      { id: 'misc.rune_base', text: 'Runemastered', type: 'misc', enabled: false, value: null, min: null, max: null },
    ]
    await searchTrade('Runes of Aldur', runedUnique, filters, {
      tradeStatus: 'any',
      tradePriceOption: 'exalted_divine',
    })
    const req = capturedRequests.find((r) => r.url.includes('/search/'))
    const body = parseCapturedBody(req)
    expect(body.query.name).toBe('Eventide Petals')
    expect(body.query.type).toBe('Veridical Chain')
  })

  // For rares the basetype chip carries the BARE base; the rune chip composes the
  // prefix back on at query time (orthogonal chips). The rune chip only takes
  // effect while the basetype chip is on.
  const runedRare = {
    name: 'Runeforged Faithful Leggings',
    baseType: 'Runeforged Faithful Leggings',
    itemClass: 'Body Armours',
    rarity: 'Rare',
  }
  const bareBaseChip: StatFilter = {
    id: 'misc.basetype',
    text: 'Faithful Leggings',
    type: 'misc',
    enabled: true,
    value: null,
    min: null,
    max: null,
  }

  it('runeforged rare composes the rune prefix when both chips are on', async () => {
    const filters: StatFilter[] = [
      { ...bareBaseChip },
      { id: 'misc.rune_base', text: 'Runeforged', type: 'misc', enabled: true, value: null, min: null, max: null },
    ]
    await searchTrade('Runes of Aldur', runedRare, filters, { tradeStatus: 'any', tradePriceOption: 'exalted_divine' })
    const body = parseCapturedBody(capturedRequests.find((r) => r.url.includes('/search/')))
    expect(body.query.type).toBe('Runeforged Faithful Leggings')
  })

  it('runeforged rare sends the bare base when the rune chip is off', async () => {
    const filters: StatFilter[] = [
      { ...bareBaseChip },
      { id: 'misc.rune_base', text: 'Runeforged', type: 'misc', enabled: false, value: null, min: null, max: null },
    ]
    await searchTrade('Runes of Aldur', runedRare, filters, { tradeStatus: 'any', tradePriceOption: 'exalted_divine' })
    const body = parseCapturedBody(capturedRequests.find((r) => r.url.includes('/search/')))
    expect(body.query.type).toBe('Faithful Leggings')
  })

  it('rune chip is inert when the basetype chip is off (category search)', async () => {
    const filters: StatFilter[] = [
      { ...bareBaseChip, enabled: false },
      { id: 'misc.rune_base', text: 'Runeforged', type: 'misc', enabled: true, value: null, min: null, max: null },
    ]
    await searchTrade('Runes of Aldur', runedRare, filters, { tradeStatus: 'any', tradePriceOption: 'exalted_divine' })
    const body = parseCapturedBody(capturedRequests.find((r) => r.url.includes('/search/')))
    expect(body.query.type).toBeUndefined()
    expect(body.query.filters.type_filters.filters.category).toBeDefined()
  })
})
