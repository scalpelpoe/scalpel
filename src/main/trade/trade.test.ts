import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture per-request state for the searchTrade assertions below. trade.ts imports
// electron's `net` at module scope, so the mock has to be installed before `./trade`
// is loaded. Tests that don't care about captured requests (e.g. buildGemTypeField)
// still work -- they just never call into a path that invokes net.request.
const capturedRequests: Array<{ url: string; method: string; body?: string }> = []

vi.mock('electron', () => ({
  // overlay.ts (pulled in transitively via trade.ts -> icon-cache.ts) registers
  // an ipcMain listener at module scope, so the mock has to expose ipcMain even
  // though these tests never exercise it.
  ipcMain: { on: vi.fn(), handle: vi.fn(), removeListener: vi.fn() },
  // trade.ts reads `app.userAgentFallback` on every request so we set a UA
  // the way APT/EE2 do. Tests don't exercise the value, just need it to exist.
  app: { userAgentFallback: 'Scalpel-Test/1.0' },
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
            dataCb?.('{"result":[],"total":0,"id":"q"}')
            endCb?.()
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
  searchTrade,
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
    expect(req!.url).toContain('/api/trade/search/')
    const body = JSON.parse(req!.body!)
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
    expect(req!.url).toContain('/api/trade2/search/')
    // Realm segment belongs in the browser URL only, not the API URL (per EE2).
    expect(req!.url).not.toContain('/poe2/')
    const body = JSON.parse(req!.body!)
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
    const body = JSON.parse(req!.body!)
    expect(body.query.filters.type_filters.filters.category).toEqual({ option: 'jewel.cluster' })
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
    const body = JSON.parse(req!.body!)
    expect(body.query.type).toBe('Craiceann, First of the Deep')
    expect(body.query.name).toBeUndefined()
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
    const body = JSON.parse(req!.body!)
    const sentIds = body.query.stats[0].filters.map((f: { id: string }) => f.id)
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
    const body = JSON.parse(req!.body!)
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
    const body = JSON.parse(req!.body!)
    expect(body.query.filters.equipment_filters.filters.rune_sockets).toEqual({ min: 2 })
    expect(body.query.filters.equipment_filters.filters.ev.min).toBe(487)
    expect(body.query.filters.socket_filters).toBeUndefined()
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
