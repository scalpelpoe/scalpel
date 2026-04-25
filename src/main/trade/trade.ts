import { net } from 'electron'
import { POE_TRADE_API } from '../../shared/endpoints'
import { TRANSFIGURED_GEM_DISC } from '../../shared/data/trade/transfigured-gems'

// Re-export stat-matcher functions so existing importers don't need to change
export { ensureStatsLoaded, matchModToStat, matchItemMods, ITEM_CLASS_TO_CATEGORY } from './stat-matcher'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TradeSearchResult {
  id: string
  result: string[]
  total: number
}

interface TradeListing {
  id: string
  price: { amount: number; currency: string } | null
  account: string
  characterName?: string
  online: boolean
  whisper?: string
  instantBuyout: boolean
  icon?: string
  indexed?: string
  itemData?: {
    name?: string
    baseType?: string
    explicitMods?: string[]
    implicitMods?: string[]
    fracturedMods?: string[]
    foulbornMods?: string[]
    craftedMods?: string[]
    ilvl?: number
    sockets?: Array<{ group: number; sColour: string }>
    gemLevel?: number
    quality?: number
    corrupted?: boolean
    mirrored?: boolean
    identified?: boolean
    templeOpenRooms?: string[]
    templeObstructedRooms?: string[]
    storedExperience?: number
    modTiers?: Record<string, { tier: string; name: string; ranges: string }>
    rarity?: string
    mapProperties?: Array<{ name: string; value: string }>
  }
}

export interface TradeResult {
  total: number
  listings: TradeListing[]
  queryId: string
  remainingIds: string[]
}

export interface BulkExchangeListing {
  id: string
  account: string
  characterName?: string
  online: boolean
  stock: number
  pay: { amount: number; currency: string }
  get: { amount: number; currency: string }
  ratio: number // pay per 1 unit of what you want
  whisper?: string
}

export interface BulkExchangeResult {
  total: number
  listings: BulkExchangeListing[]
  queryId: string
}

export interface StatFilter {
  id: string
  text: string
  value: number | null
  min: number | null
  max: number | null
  enabled: boolean
  type: string // 'explicit', 'implicit', etc.
  option?: number | string // for option-based stats like "Map contains #'s Citadel" or reward names
  timelessLeaders?: string[] // all leader stat IDs for timeless count group
  foulborn?: boolean
  modTier?: number // mod tier if known (from advanced mod data)
  modRange?: { min: number; max: number } // possible roll range for this mod
}

// ─── Rate Limiter ─────────────────────────────────────────────────────────────

// Rate limit state broadcast
export interface RateLimitTier {
  used: number
  max: number
  window: number
  penalty: number
  /** Epoch ms when this tier was last refreshed from a response header. Used by the
   *  renderer to decay the `used` value over time between responses. */
  lastUpdate?: number
}
export interface RateLimitState {
  tiers: RateLimitTier[]
}

let rateLimitCallback: ((state: RateLimitState) => void) | null = null
export function onRateLimitUpdate(cb: (state: RateLimitState) => void): void {
  rateLimitCallback = cb
}

// Cumulative rate-limit state across every policy we've seen. PoE returns different tiers
// per endpoint (search vs fetch etc); if we just broadcast the latest response's tiers
// the meter flickers between policies. Keyed by window size since each tier has a unique
// window within a policy, and windows don't collide across policies we care about.
const knownTiers = new Map<number, RateLimitTier & { lastUpdate: number }>()

function parseAndBroadcastRateLimit(state: string, rules: string): void {
  // Format: "used:window:penalty,used:window:penalty,..."
  // Rules:  "max:window:timeout,max:window:timeout,..."
  const stateParts = state.split(',')
  const ruleParts = rules.split(',')
  const now = Date.now()
  for (let i = 0; i < Math.min(stateParts.length, ruleParts.length); i++) {
    const s = stateParts[i].split(':')
    const r = ruleParts[i].split(':')
    if (s.length < 3 || r.length < 2) continue
    const window = parseInt(r[1])
    knownTiers.set(window, {
      used: parseInt(s[0]),
      max: parseInt(r[0]),
      window,
      penalty: parseInt(s[2]),
      lastUpdate: now,
    })
  }
  if (knownTiers.size > 0 && rateLimitCallback) {
    rateLimitCallback({ tiers: [...knownTiers.values()].sort((a, b) => a.window - b.window) })
  }
}

let lastRequestTime = 0
const MIN_INTERVAL = 500 // ms between requests - PoE trade allows ~3/sec

async function throttle(): Promise<void> {
  const now = Date.now()
  const elapsed = now - lastRequestTime
  if (elapsed < MIN_INTERVAL) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL - elapsed))
  }
  lastRequestTime = Date.now()
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function fetchJson(url: string, options?: { method?: string; body?: string }, retries = 2): Promise<unknown> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await new Promise((resolve, reject) => {
        const request = net.request({
          url,
          method: options?.method ?? 'GET',
        })
        request.setHeader('Content-Type', 'application/json')
        request.setHeader('User-Agent', 'FilterScalpel/1.0')

        let data = ''
        request.on('response', (response) => {
          // Parse rate limit headers and broadcast to renderer
          const limitState = response.headers['x-rate-limit-ip-state']
          const limitRules = response.headers['x-rate-limit-ip']
          if (limitState && limitRules) {
            parseAndBroadcastRateLimit(String(limitState), String(limitRules))
          }

          if (response.statusCode === 429) {
            const retryAfter = response.headers['retry-after']
            const wait = retryAfter ? parseInt(String(retryAfter)) * 1000 : 5000
            reject({ rateLimited: true, wait })
            return
          }
          response.on('data', (chunk) => {
            data += chunk.toString()
          })
          response.on('end', () => {
            try {
              resolve(JSON.parse(data))
            } catch (e) {
              reject(e)
            }
          })
        })
        request.on('error', reject)
        if (options?.body) request.write(options.body)
        request.end()
      })
      return result
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'rateLimited' in e && attempt < retries) {
        const wait = (e as unknown as { wait: number }).wait
        await new Promise((r) => setTimeout(r, wait))
        lastRequestTime = Date.now()
        continue
      }
      if (e && typeof e === 'object' && 'rateLimited' in e) {
        throw new Error('Rate limited - please wait a moment and try again')
      }
      throw e
    }
  }
  throw new Error('Max retries exceeded')
}

// ─── Trade API ────────────────────────────────────────────────────────────────

import { ITEM_CLASS_TO_CATEGORY as _ITEM_CLASS_TO_CATEGORY } from './stat-matcher'
import { ensureStatsLoaded as _ensureStatsLoaded, matchModToStat } from './stat-matcher'

export async function searchTrade(
  league: string,
  item: {
    name: string
    baseType: string
    itemClass: string
    rarity: string
    armour?: number
    evasion?: number
    energyShield?: number
    ward?: number
    block?: number
    vaalGem?: boolean
  },
  statFilters: StatFilter[],
  tradeStatus: string = 'any',
  tradePriceOption: string = 'chaos_divine',
  listedTime?: string,
): Promise<TradeResult> {
  await _ensureStatsLoaded()
  await throttle()

  // Build query - div cards always use 'available' (most listings aren't instant buyout)
  const isDivCard = item.itemClass === 'Divination Cards'
  const query: Record<string, unknown> = {
    status: { option: isDivCard ? 'available' : tradeStatus },
  }

  // For uniques, search by name + base type
  // Strip "Foulborn " prefix from the trade search name
  if (item.rarity === 'Unique' && item.itemClass === 'Maps') {
    // Unique maps: search by name only (type "Map" doesn't work with name)
    query.name = item.name
  } else if (item.rarity === 'Unique') {
    query.name = item.name.replace(/^Foulborn\s+/i, '')
    query.type = item.baseType
  } else if (item.itemClass === 'Maps') {
    // Maps: use "Map" type with discriminator, add tier + blight filters
    const isValdoMap = item.baseType === 'Valdo Map'
    const tierMatch = item.baseType.match(/\(Tier (\d+)\)/)
    const mapTier = tierMatch ? parseInt(tierMatch[1]) : null
    const isBlighted = /^Blighted /i.test(item.baseType)
    const isBlightRavaged = /^Blight-ravaged /i.test(item.baseType)
    query.type = isValdoMap ? 'Valdo Map' : { option: 'Map', discriminator: 'map' }
    const mapFilterObj: Record<string, unknown> = {}
    if (mapTier) mapFilterObj.map_tier = { min: mapTier, max: mapTier }
    if (isBlighted) mapFilterObj.map_blighted = { option: 'true' }
    if (isBlightRavaged) mapFilterObj.map_uberblighted = { option: 'true' }
    query.filters = {
      ...(isValdoMap ? {} : { type_filters: { filters: { rarity: { option: 'nonunique' } } } }),
      map_filters: { filters: mapFilterObj },
    }
  } else if (item.itemClass === 'Divination Cards') {
    query.type = item.baseType
  } else if (
    item.itemClass === 'Gems' ||
    item.itemClass === 'Support Gems' ||
    item.itemClass === 'Skill Gems' ||
    item.itemClass === 'Active Skill Gems' ||
    item.itemClass === 'Support Skill Gems'
  ) {
    query.type = buildGemTypeField(item.baseType, item.vaalGem)
  } else {
    // Non-uniques: search by item class, not base type. The implicit covers the base.
    const classCategory = _ITEM_CLASS_TO_CATEGORY[item.itemClass]
    const typeFilters: Record<string, unknown> = {
      rarity: { option: 'nonunique' },
    }
    if (classCategory) {
      typeFilters.category = { option: classCategory }
    }
    query.filters = {
      type_filters: { filters: typeFilters },
    }
    if (!classCategory) {
      query.type = item.baseType
    }
  }

  // Add armour filters from defence-type stat filters
  const defenceFilters = statFilters.filter((f) => f.type === 'defence' && f.enabled)
  if (defenceFilters.length > 0) {
    const armourFilters: Record<string, { min?: number; max?: number }> = {}
    const idMap: Record<string, string> = {
      'defence.armour': 'ar',
      'defence.evasion': 'ev',
      'defence.energy_shield': 'es',
      'defence.ward': 'ward',
      'defence.block': 'block',
    }
    for (const f of defenceFilters) {
      const key = idMap[f.id]
      if (key)
        armourFilters[key] = { ...(f.min != null ? { min: f.min } : {}), ...(f.max != null ? { max: f.max } : {}) }
    }
    const existing = (query.filters as Record<string, unknown>) ?? {}
    query.filters = { ...existing, armour_filters: { disabled: false, filters: armourFilters } }
  }

  // Add weapon DPS filters
  const weaponDpsFilters = statFilters.filter((f) => f.type === 'weapon' && f.enabled)
  if (weaponDpsFilters.length > 0) {
    const weaponQuery: Record<string, { min?: number; max?: number }> = {}
    const idMap: Record<string, string> = {
      'weapon.pdps': 'pdps',
      'weapon.edps': 'edps',
      'weapon.cdps': 'cdps',
      'weapon.dps': 'dps',
      'weapon.aps': 'aps',
      'weapon.crit': 'crit',
    }
    for (const f of weaponDpsFilters) {
      const key = idMap[f.id]
      if (key) weaponQuery[key] = { ...(f.min != null ? { min: f.min } : {}), ...(f.max != null ? { max: f.max } : {}) }
    }
    const existing = (query.filters as Record<string, unknown>) ?? {}
    query.filters = { ...existing, weapon_filters: { disabled: false, filters: weaponQuery } }
  }

  // Add socket filters
  const socketFilters = statFilters.filter((f) => (f.type === 'socket' || f.id === 'socket.white_sockets') && f.enabled)
  if (socketFilters.length > 0) {
    const socketQuery: Record<string, Record<string, number>> = {}
    for (const f of socketFilters) {
      if (f.id === 'socket.white_sockets') {
        // White sockets: value = white count, min = total sockets
        socketQuery.sockets = { w: f.value as number, min: f.min as number }
      } else if (f.id === 'socket.sockets') {
        // Generic socket filter
        const socketsFilter: Record<string, number> = {}
        if (f.min != null) socketsFilter.min = f.min
        if (f.max != null) socketsFilter.max = f.max
        socketQuery.sockets = socketsFilter
      } else if (f.id === 'socket.links') {
        socketQuery.links = { ...(f.min != null ? { min: f.min } : {}), ...(f.max != null ? { max: f.max } : {}) }
      }
    }
    const existing = (query.filters as Record<string, unknown>) ?? {}
    query.filters = { ...existing, socket_filters: { filters: socketQuery } }
  }

  // Add heist filters (wings revealed)
  const heistFilters = statFilters.filter((f) => f.type === 'heist' && f.enabled)
  if (heistFilters.length > 0) {
    const heistQuery: Record<string, { min?: number; max?: number }> = {}
    for (const f of heistFilters) {
      // Map filter IDs like "heist.heist_engineering" -> trade query key "heist_engineering"
      const key = f.id.replace('heist.', '')
      heistQuery[key] = { ...(f.min != null ? { min: f.min } : {}), ...(f.max != null ? { max: f.max } : {}) }
    }
    const existing = (query.filters as Record<string, unknown>) ?? {}
    query.filters = { ...existing, heist_filters: { disabled: false, filters: heistQuery } }
  }

  // Add base type filter if enabled. For maps, the generic "Map" base isn't valid as a
  // plain string on the trade API -- it needs the discriminator form. Specific map names
  // (e.g. "Strand Map", "Nightmare Map") work as plain strings.
  const baseTypeFilter = statFilters.find((f) => f.id === 'misc.basetype' && f.enabled)
  if (baseTypeFilter) {
    if (item.itemClass === 'Maps' && baseTypeFilter.text === 'Map') {
      query.type = { option: 'Map', discriminator: 'map' }
    } else {
      query.type = baseTypeFilter.text
    }
  }

  // Add misc filters (quality, ilvl, corrupted, mirrored)
  const miscFiltersAll = statFilters.filter(
    (f) =>
      ((f.type === 'misc' || f.type === 'gem' || f.type === 'currency') && f.id !== 'misc.basetype') ||
      f.id === 'misc.memory_level' ||
      f.id === 'misc.area_level',
  )
  const miscQuery: Record<string, unknown> = {}
  for (const f of miscFiltersAll) {
    if (f.id === 'misc.quality' && f.enabled)
      miscQuery.quality = { ...(f.min != null ? { min: f.min } : {}), ...(f.max != null ? { max: f.max } : {}) }
    if (f.id === 'misc.ilvl' && f.enabled)
      miscQuery.ilvl = { ...(f.min != null ? { min: f.min } : {}), ...(f.max != null ? { max: f.max } : {}) }
    if (f.id === 'misc.gem_level' && f.enabled)
      miscQuery.gem_level = { ...(f.min != null ? { min: f.min } : {}), ...(f.max != null ? { max: f.max } : {}) }
    if (f.id === 'misc.gem_transfigured') miscQuery.gem_transfigured = { option: f.enabled ? 'true' : 'false' }
    // Corrupted: enabled = search corrupted, disabled = search uncorrupted (for equipment)
    if (f.id === 'misc.corrupted') miscQuery.corrupted = { option: f.enabled ? 'true' : 'false' }
    if (f.id === 'misc.mirrored' && f.enabled) miscQuery.mirrored = { option: 'true' }
    if (f.id === 'misc.identified') miscQuery.identified = { option: f.enabled ? 'false' : 'true' }
    if (f.id === 'misc.memory_level' && f.enabled)
      miscQuery.memory_level = { ...(f.min != null ? { min: f.min } : {}), ...(f.max != null ? { max: f.max } : {}) }
    if (f.id === 'misc.area_level' && f.enabled)
      miscQuery.area_level = { ...(f.min != null ? { min: f.min } : {}), ...(f.max != null ? { max: f.max } : {}) }
    if (f.id === 'misc.stored_experience' && f.enabled)
      miscQuery.stored_experience = {
        ...(f.min != null ? { min: f.min } : {}),
        ...(f.max != null ? { max: f.max } : {}),
      }
    // Influence filters (misc_filters for traditional influences)
    if (f.id.startsWith('misc.influence_') && f.enabled) {
      const influenceKeyMap: Record<string, string> = {
        'misc.influence_elder': 'elder_item',
        'misc.influence_shaper': 'shaper_item',
        'misc.influence_crusader': 'crusader_item',
        'misc.influence_redeemer': 'redeemer_item',
        'misc.influence_hunter': 'hunter_item',
        'misc.influence_warlord': 'warlord_item',
      }
      const key = influenceKeyMap[f.id]
      if (key) miscQuery[key] = { option: 'true' }
      // Searing Exarch and Eater of Worlds use misc_filters too
      if (f.id === 'misc.influence_searing_exarch') miscQuery.searing_item = { option: 'true' }
      if (f.id === 'misc.influence_eater_of_worlds') miscQuery.tangled_item = { option: 'true' }
    }
  }
  // Equipment: default to non-fractured unless chip is enabled
  const fracturedFilter = miscFiltersAll.find((f) => f.id === 'misc.fractured')
  if (fracturedFilter && !fracturedFilter.enabled) {
    miscQuery.fractured_item = { option: 'false' }
  }

  // Equipment: default to unmirrored unless the item itself is mirrored
  const noMirrorFilter = new Set([
    'Divination Cards',
    'Currency',
    'Stackable Currency',
    'Map Fragments',
    'Scarabs',
    'Gems',
    'Support Gems',
    'Skill Gems',
    'Active Skill Gems',
    'Support Skill Gems',
    'Misc Map Items',
  ])
  if (item.rarity !== 'Unique' && !noMirrorFilter.has(item.itemClass) && !miscQuery.mirrored) {
    miscQuery.mirrored = { option: 'false' }
  }
  if (Object.keys(miscQuery).length > 0) {
    const existing = (query.filters as Record<string, unknown>) ?? {}
    query.filters = { ...existing, misc_filters: { filters: miscQuery } }
  }

  // Add map property filters (only real map_filter keys, skip display-only ones)
  const validMapKeys = new Set(['map_iiq', 'map_iir', 'map_packsize', 'map_completion_reward'])
  const mapPropFilters = statFilters.filter(
    (f) => f.type === 'map' && f.enabled && validMapKeys.has(f.id.replace('map.', '')),
  )
  if (mapPropFilters.length > 0) {
    const mapQuery: Record<string, unknown> = {}
    for (const f of mapPropFilters) {
      const key = f.id.replace('map.', '')
      if (key === 'map_completion_reward' && f.option) {
        mapQuery[key] = { option: f.option }
      } else {
        mapQuery[key] = { ...(f.min != null ? { min: f.min } : {}), ...(f.max != null ? { max: f.max } : {}) }
      }
    }
    const existing = (query.filters as Record<string, unknown>) ?? {}
    const existingMapFilters =
      ((existing.map_filters as Record<string, unknown>)?.filters as Record<string, unknown>) ?? {}
    query.filters = { ...existing, map_filters: { filters: { ...existingMapFilters, ...mapQuery } } }
  }

  // Override rarity in type_filters if the rarity chip is enabled
  const rarityFilter = statFilters.find((f) => f.id === 'misc.rarity' && f.enabled)
  if (rarityFilter) {
    const existing = (query.filters as Record<string, unknown>) ?? {}
    const existingTypeFilters =
      ((existing.type_filters as Record<string, unknown>)?.filters as Record<string, unknown>) ?? {}
    query.filters = {
      ...existing,
      type_filters: { filters: { ...existingTypeFilters, rarity: { option: rarityFilter.text.toLowerCase() } } },
    }
  }

  // Add stat filters (exclude non-stat types, but include pseudo filters from misc chips)
  const miscPseudoIds = new Set([
    'pseudo.pseudo_number_of_empty_prefix_mods',
    'pseudo.pseudo_number_of_empty_suffix_mods',
    'pseudo.pseudo_number_of_affix_mods',
  ])
  // Map pseudo stats (More Scarabs, etc.) go through stat filters too
  const mapPseudoIds = new Set([
    'pseudo.pseudo_map_more_scarab_drops',
    'pseudo.pseudo_map_more_currency_drops',
    'pseudo.pseudo_map_more_map_drops',
    'pseudo.pseudo_map_more_card_drops',
  ])
  const enabledFilters = statFilters.filter(
    (f) =>
      f.enabled &&
      f.type !== 'timeless' &&
      f.id !== 'misc.memory_level' &&
      f.id !== 'socket.white_sockets' &&
      (!['defence', 'weapon', 'socket', 'misc', 'gem', 'map', 'heist', 'currency'].includes(f.type) ||
        miscPseudoIds.has(f.id) ||
        mapPseudoIds.has(f.id)),
  )
  const timelessFilters = statFilters.filter((f) => f.enabled && f.type === 'timeless')

  const statGroups: Array<{
    type: string
    filters: Array<{ id: string; value: Record<string, unknown> }>
    value?: Record<string, unknown>
  }> = []

  if (enabledFilters.length > 0) {
    statGroups.push({
      type: 'and',
      filters: enabledFilters.map((f) => ({
        id: f.id,
        value: f.option
          ? { option: f.option }
          : {
              ...(f.min != null ? { min: f.min } : {}),
              ...(f.max != null ? { max: f.max } : {}),
            },
      })),
    })
  }

  // Timeless jewel: "any leader" uses count group, specific leader uses and group
  const timelessAny = timelessFilters.find((f) => f.id === 'timeless-any')
  const timelessSpecific = timelessFilters.find((f) => f.id !== 'timeless-any')
  if (timelessAny && timelessAny.timelessLeaders) {
    statGroups.push({
      type: 'count',
      filters: timelessAny.timelessLeaders.map((id) => ({
        id,
        value: { min: timelessAny.min, max: timelessAny.max },
      })),
      value: { min: 1 },
    })
  } else if (timelessSpecific) {
    statGroups.push({
      type: 'and',
      filters: [{ id: timelessSpecific.id, value: { min: timelessSpecific.min, max: timelessSpecific.max } }],
    })
  }

  query.stats = statGroups.length > 0 ? statGroups : [{ type: 'and', filters: [] }]

  // Add trade filters: collapse by account, price currency option, optional listed-time.
  // "chaos_equivalent" isn't a valid API value for trade_filters.price.option -- sending it
  // causes the server to drop the whole filter block and return broken results. APT's
  // working query for the same mode omits the price filter entirely, so we do the same.
  const existing = (query.filters as Record<string, unknown>) ?? {}
  const tradeFiltersInner: Record<string, unknown> = {
    collapse: { option: 'true' },
  }
  if (tradePriceOption && tradePriceOption !== 'chaos_equivalent') {
    tradeFiltersInner.price = { min: null, max: null, option: tradePriceOption }
  }
  if (listedTime) tradeFiltersInner.indexed = { option: listedTime }
  query.filters = {
    ...existing,
    trade_filters: { disabled: false, filters: tradeFiltersInner },
  }

  const body = JSON.stringify({
    query,
    sort: { price: 'asc' },
  })

  const searchResult = (await fetchJson(`${POE_TRADE_API}/search/${encodeURIComponent(league)}`, {
    method: 'POST',
    body,
  })) as TradeSearchResult

  if (!searchResult.result || searchResult.result.length === 0) {
    return { total: searchResult.total ?? 0, listings: [], queryId: searchResult.id ?? '', remainingIds: [] }
  }

  // Fetch first 10 results
  await throttle()
  const ids = searchResult.result.slice(0, 10).join(',')
  const fetchResult = (await fetchJson(`${POE_TRADE_API}/fetch/${ids}?query=${searchResult.id}`)) as {
    result: Array<{
      id: string
      listing: {
        price?: { amount: number; currency: string }
        account: { name: string; lastCharacterName?: string; online?: { status?: string } }
        indexed?: string
        whisper?: string
        method?: string
        fee?: number
        offers?: unknown[]
      }
      item?: {
        icon?: string
        name?: string
        baseType?: string
        explicitMods?: string[]
        implicitMods?: string[]
        mutatedMods?: string[]
        fracturedMods?: string[]
        craftedMods?: string[]
        enchantMods?: string[]
        ilvl?: number
        sockets?: Array<{ group: number; sColour: string }>
        properties?: Array<{ name: string; values: Array<[string, number]> }>
        additionalProperties?: Array<{ name: string; values: Array<[string, number]>; type?: number }>
        corrupted?: boolean
        duplicated?: boolean
        identified?: boolean
        frameType?: number
        extended?: {
          ar?: number
          ev?: number
          es?: number
          pdps?: number
          edps?: number
          dps?: number
          mods?: Record<
            string,
            Array<{
              name: string
              tier: string
              level: number
              magnitudes: Array<{ hash: string; min: string; max: string }>
            }>
          >
          hashes?: Record<string, Array<[string, number[]]>>
        }
      }
    }>
  }

  const listings: TradeListing[] = (fetchResult.result ?? []).map((r) => ({
    id: r.id,
    price: r.listing.price ?? null,
    account: r.listing.account.name,
    characterName: r.listing.account.lastCharacterName,
    online: r.listing.account.online?.status === 'online',
    whisper: r.listing.whisper,
    // `fee` is the PoE market fee charged on instant-buy-eligible listings. Present =
    // supports Travel to Hideout; absent = whisper-only. More reliable than `method` (always
    // 'psapi') or `whisper` (can be present as fallback on instant listings).
    instantBuyout: !!r.listing.fee,
    icon: r.item?.icon,
    indexed: r.listing.indexed,
    itemData: r.item
      ? {
          name: r.item.name,
          baseType: r.item.baseType,
          rarity: ['Normal', 'Magic', 'Rare', 'Unique'][r.item.frameType ?? 0] ?? 'Normal',
          explicitMods: [
            ...(r.item.fracturedMods ?? []),
            ...(r.item.explicitMods ?? []),
            ...(r.item.craftedMods ?? []),
            ...(r.item.mutatedMods ?? []),
          ],
          implicitMods: r.item.implicitMods,
          enchantMods: r.item.enchantMods,
          fracturedMods: r.item.fracturedMods,
          craftedMods: r.item.craftedMods,
          foulbornMods: r.item.mutatedMods,
          ilvl: r.item.ilvl,
          sockets: r.item.sockets,
          gemLevel: r.item.properties?.find((p) => p.name === 'Level')?.values?.[0]?.[0]
            ? parseInt(r.item.properties.find((p) => p.name === 'Level')!.values[0][0])
            : undefined,
          quality: r.item.properties?.find((p) => p.name === 'Quality')?.values?.[0]?.[0]
            ? parseInt(r.item.properties.find((p) => p.name === 'Quality')!.values[0][0].replace(/[+%]/g, ''))
            : undefined,
          storedExperience: r.item.properties?.find((p) => p.name.startsWith('Stored Experience'))?.values?.[0]?.[0]
            ? parseInt(r.item.properties.find((p) => p.name.startsWith('Stored Experience'))!.values[0][0])
            : undefined,
          areaLevel: r.item.properties?.find((p) => p.name === 'Area Level')?.values?.[0]?.[0]
            ? parseInt(r.item.properties.find((p) => p.name === 'Area Level')!.values[0][0])
            : undefined,
          heistJob: (() => {
            const prop = r.item!.properties?.find((p) => p.type === 46)
            if (!prop?.values?.[0]?.[0] && !prop?.values?.[1]?.[0]) return undefined
            return { skill: prop!.values[1]?.[0] as string, level: parseInt(prop!.values[0]?.[0] as string) }
          })(),
          corrupted: r.item.corrupted,
          mirrored: r.item.duplicated,
          identified: r.item.identified,
          ...(() => {
            const ap = r.item!.additionalProperties
            if (!ap) return {}
            const open: string[] = []
            const obstructed: string[] = []
            let target = open
            for (const p of ap) {
              if (p.name === 'Open Rooms:') {
                target = open
                continue
              }
              if (p.name === 'Obstructed Rooms:') {
                target = obstructed
                continue
              }
              if (p.type === 49 && p.values?.[0]?.[0]) {
                target.push(p.values[0][0].replace(/\s*\(Tier \d+\)/, ''))
              }
            }
            if (open.length === 0 && obstructed.length === 0) return {}
            return { templeOpenRooms: open, templeObstructedRooms: obstructed }
          })(),
          modTiers: (() => {
            const mods = r.item!.extended?.mods
            const hashes = r.item!.extended?.hashes
            if (!mods || !hashes) return undefined

            // Detect implicit magnitude multipliers (e.g. "25% increased Suffix Modifier magnitudes")
            let prefixMult = 1
            let suffixMult = 1
            for (const imp of r.item!.implicitMods ?? []) {
              const mm = imp.match(/(\d+)% increased (Prefix|Suffix) Modifier magnitudes/)
              if (mm) {
                if (mm[2] === 'Prefix') prefixMult += parseInt(mm[1]) / 100
                if (mm[2] === 'Suffix') suffixMult += parseInt(mm[1]) / 100
              }
            }

            const result: Record<string, { tier: string; name: string; ranges: string }> = {}
            const categories: Array<{ key: string; texts?: string[] }> = [
              { key: 'explicit', texts: r.item!.explicitMods },
              { key: 'implicit', texts: r.item!.implicitMods },
              { key: 'fractured', texts: r.item!.fracturedMods },
              { key: 'crafted', texts: r.item!.craftedMods },
              { key: 'enchant', texts: r.item!.enchantMods },
            ]
            for (const { key, texts } of categories) {
              const modEntries = mods[key]
              const hashEntries = hashes[key]
              if (!modEntries || !hashEntries || !texts) continue
              for (let i = 0; i < hashEntries.length && i < texts.length; i++) {
                if (!hashEntries[i]?.[1]?.[0] && hashEntries[i]?.[1]?.[0] !== 0) continue
                const modIdx = hashEntries[i][1][0]
                const m = modEntries[modIdx]
                if (!m) continue
                // Apply implicit multiplier to prefix/suffix ranges
                const isAffixCategory = key === 'explicit' || key === 'fractured' || key === 'crafted'
                const mult = isAffixCategory
                  ? m.tier.startsWith('P')
                    ? prefixMult
                    : m.tier.startsWith('S')
                      ? suffixMult
                      : 1
                  : 1
                const ranges = m.magnitudes
                  .map((mag) => {
                    const min = Math.trunc(parseFloat(mag.min) * mult)
                    const max = Math.trunc(parseFloat(mag.max) * mult)
                    return min === max ? String(min) : `${min}-${max}`
                  })
                  .join(', ')
                result[texts[i]] = { tier: m.tier, name: m.name, ranges }
              }
            }
            return Object.keys(result).length > 0 ? result : undefined
          })(),
          armour: r.item.extended?.ar,
          evasion: r.item.extended?.ev,
          energyShield: r.item.extended?.es,
          pdps: r.item.extended?.pdps,
          edps: r.item.extended?.edps,
          dps: r.item.extended?.dps,
        }
      : undefined,
  }))

  return { total: searchResult.total, listings, queryId: searchResult.id, remainingIds: searchResult.result.slice(10) }
}

// ─── Bulk Exchange ──────────────────────────────────────────────────────────

import bulkExchangeIds from '../../shared/data/trade/bulk-exchange-ids.json'

const bulkIdMap = bulkExchangeIds as Record<string, string>

/** Build the `type` field of a gem trade query. Returns the discriminator shape for
 *  transfigured gems (with "Vaal " prepended to the base when the gem has a Vaal alt),
 *  a plain string for non-transfigured gems. */
export function buildGemTypeField(
  baseType: string,
  vaalGem: boolean | undefined,
): string | { option: string; discriminator: string } {
  const disc = TRANSFIGURED_GEM_DISC[baseType]
  if (disc) {
    const baseGem = baseType.slice(0, baseType.indexOf(' of '))
    return { option: vaalGem ? `Vaal ${baseGem}` : baseGem, discriminator: disc }
  }
  if (vaalGem && !baseType.startsWith('Vaal ')) return `Vaal ${baseType}`
  return baseType
}

/** Look up the bulk exchange ID for an item by its name or base type */
export function getBulkExchangeId(name: string, baseType: string): string | null {
  // Try exact name first (e.g. "Divine Orb"), then base type
  // Filter out "sep" entries (separators in the static data, not real IDs)
  let id = bulkIdMap[name] ?? bulkIdMap[baseType] ?? null
  if (!id || id === 'sep') return null
  // Fix legacy zana- prefixed map IDs to current format
  if (id.startsWith('zana-map-tier-')) {
    id = id.replace('zana-', '')
  }
  return id
}

/** Check if an item should use bulk exchange instead of regular trade */
export function isBulkExchangeItem(itemClass: string, name: string, baseType: string, _rarity?: string): boolean {
  // Items where individual attributes matter - always regular trade
  const regularTradeClasses = new Set([
    'Divination Cards',
    'Maps',
    'Misc Map Items', // Boss invitations (ilvl, enchants)
    'Expedition Logbook', // Area level, faction, mods
    'Incubators', // ilvl requirements
  ])
  if (regularTradeClasses.has(itemClass)) return false
  // Specific items with variable properties that need regular trade
  if (baseType === "Facetor's Lens") return false
  // Beasts are "Stackable Currency" but have rarity Rare/Unique and need regular trade
  if (itemClass === 'Stackable Currency' && (_rarity === 'Rare' || _rarity === 'Unique')) return false

  const bulkClasses = new Set([
    'Currency',
    'Stackable Currency',
    'Map Fragments',
    'Scarabs',
    'Delve Stackable Socketable Currency',
    'Harvest Seed',
    'Delve Socketable Currency',
    'Currency Stash Tab Items',
  ])
  if (bulkClasses.has(itemClass)) return true
  // Also check if we have a bulk ID for it (catches essences, fossils, boss frags, etc.)
  return getBulkExchangeId(name, baseType) != null
}

export async function searchBulkExchange(
  league: string,
  itemId: string,
  currencyId: string = 'chaos',
  minimum: number = 1,
): Promise<BulkExchangeResult> {
  await throttle()

  // "I have currency, I want to buy the item"
  const body = JSON.stringify({
    engine: 'new',
    query: {
      status: { option: 'online' },
      have: [currencyId],
      want: [itemId],
      minimum,
    },
    sort: { have: 'asc' },
  })

  const result = (await fetchJson(`${POE_TRADE_API}/exchange/${encodeURIComponent(league)}`, {
    method: 'POST',
    body,
  })) as {
    id: string
    total: number
    result: Record<
      string,
      {
        id: string
        listing: {
          indexed: string
          account: { name: string; lastCharacterName?: string; online?: { league?: string }; language?: string }
          offers: Array<{
            exchange: { currency: string; amount: number; whisper: string }
            item: { currency: string; amount: number; stock: number; id: string; whisper: string }
          }>
        }
      }
    >
  }

  const listings: BulkExchangeListing[] = []
  if (result.result) {
    for (const key of Object.keys(result.result)) {
      const r = result.result[key]
      // Only process listings with exactly 1 offer (same as APT)
      if (!r.listing?.offers || r.listing.offers.length !== 1) continue
      const offer = r.listing.offers[0]
      // Filter to matching currency
      if (offer.exchange.currency !== currencyId) continue
      listings.push({
        id: r.id,
        account: r.listing.account.name,
        characterName: r.listing.account.lastCharacterName,
        online: !!r.listing.account.online,
        stock: offer.item.stock,
        pay: { amount: offer.exchange.amount, currency: offer.exchange.currency },
        get: { amount: offer.item.amount, currency: offer.item.currency },
        ratio: offer.exchange.amount / offer.item.amount,
        whisper: offer.item.whisper
          ?.replace('{0}', String(offer.item.amount))
          ?.replace('{1}', String(offer.exchange.amount)),
      })
    }
    // Sort by ratio ascending (cheapest first) and limit to 20
    listings.sort((a, b) => a.ratio - b.ratio)
    listings.splice(20)
  }

  return { total: result.total ?? 0, listings, queryId: result.id ?? '' }
}

// ─── Shared listing fetch helper ─────────────────────────────────────────────

async function fetchAndMapListings(ids: string[], queryId: string): Promise<TradeListing[]> {
  await throttle()
  const fetchResult = (await fetchJson(`${POE_TRADE_API}/fetch/${ids.join(',')}?query=${queryId}`)) as {
    result: Array<{
      id: string
      listing: {
        price?: { amount: number; currency: string }
        account: { name: string; lastCharacterName?: string; online?: { status?: string } }
        indexed?: string
        whisper?: string
        method?: string
        fee?: number
        offers?: unknown[]
      }
      item?: {
        name?: string
        baseType?: string
        typeLine?: string
        frameType?: number
        icon?: string
        ilvl?: number
        implicitMods?: string[]
        explicitMods?: string[]
        properties?: Array<{ name: string; values: Array<[string, number]> }>
        corrupted?: boolean
        duplicated?: boolean
        identified?: boolean
      }
    }>
  }

  return (fetchResult.result ?? []).map((r) => ({
    id: r.id,
    price: r.listing.price ? { amount: r.listing.price.amount, currency: r.listing.price.currency } : null,
    account: r.listing.account.name,
    characterName: r.listing.account.lastCharacterName,
    online: !!r.listing.account.online,
    instantBuyout: !!r.listing.fee,
    icon: r.item?.icon,
    indexed: r.listing.indexed,
    itemData: r.item
      ? {
          name: r.item.name,
          baseType: r.item.baseType ?? r.item.typeLine,
          rarity: ['Normal', 'Magic', 'Rare', 'Unique'][r.item.frameType ?? 0] ?? 'Normal',
          explicitMods: r.item.explicitMods ?? [],
          implicitMods: r.item.implicitMods,
          ilvl: r.item.ilvl,
          // ExpandedListing surfaces these flags as status chips (Corrupted, Mirrored,
          // Unidentified); the regular trade path includes them, so map-regex listings
          // should too or corrupted maps silently appear as if they weren't.
          corrupted: r.item.corrupted,
          mirrored: r.item.duplicated,
          identified: r.item.identified,
          mapProperties: r.item.properties
            ?.filter((p) => p.values?.[0]?.[0] != null)
            .map((p) => ({ name: p.name, value: p.values[0][0] })),
        }
      : undefined,
  }))
}

// ─── Map Regex Trade Search ─────────────────────────────────────────────────

export async function searchMapsByRegex(
  league: string,
  tier: number,
  avoidTexts: string[],
  wantTexts: string[],
  wantMode: 'any' | 'all',
  qualifiers: Record<string, number>,
  nightmare: boolean,
  originator: boolean,
  corrupted8mod: boolean,
  tradeStatus: string,
  tradePriceOption: string,
): Promise<TradeResult> {
  await _ensureStatsLoaded()
  await throttle()

  // poe.re text -> trade API text overrides for mods with different wording
  const modTextOverrides: Record<string, string> = {
    'Monsters inflict # Grasping Vines on Hit': 'Monsters inflict # Grasping Vine on Hit',
    'Players are targeted by a Meteor when they use a Flask':
      'Players have #% chance to be targeted by a Meteor when they use a Flask',
    'Rare Monsters have Volatile Cores': 'Rare Monsters have #% chance to have a Volatile Core',
  }

  // Match mod texts to trade stat IDs
  // Compound mods use | separators - try each part individually
  const matchMod = (text: string) => {
    const parts = text.split('|')
    for (const part of parts) {
      const p = part.trim()
      const overridden = modTextOverrides[p]
      if (overridden) {
        const result = matchModToStat(overridden, false, 'explicit')
        if (result) return result
      }
      const cleaned = p.replace(/#%?/g, '').trim()
      const result = matchModToStat(cleaned, false, 'explicit') ?? matchModToStat(p, false, 'explicit')
      if (result) return result
    }
    return null
  }

  const avoidFilters = avoidTexts
    .map((t) => matchMod(t))
    .filter(Boolean)
    .map((m) => ({ id: m!.statId, value: {} }))

  const wantFilters = wantTexts
    .map((t) => matchMod(t))
    .filter(Boolean)
    .map((m) => ({ id: m!.statId, value: {} }))

  const statGroups: Array<{
    type: string
    filters: Array<{ id: string; value: Record<string, unknown> }>
    value?: Record<string, unknown>
  }> = []

  // Avoid mods -> "not" group
  if (avoidFilters.length > 0) {
    statGroups.push({ type: 'not', filters: avoidFilters })
  }

  // Want mods -> "and" or "count" group
  if (wantFilters.length > 0) {
    if (wantMode === 'all') {
      statGroups.push({ type: 'and', filters: wantFilters })
    } else {
      statGroups.push({ type: 'count', filters: wantFilters, value: { min: 1 } })
    }
  }

  // Qualifier filters as map stat requirements
  const mapFilterObj: Record<string, unknown> = {
    map_tier: { min: tier, max: tier },
  }
  if (qualifiers.quantity) mapFilterObj.map_iiq = { min: qualifiers.quantity }
  if (qualifiers.packsize) mapFilterObj.map_packsize = { min: qualifiers.packsize }
  if (qualifiers.rarity) mapFilterObj.map_iir = { min: qualifiers.rarity }

  // Pseudo stat qualifiers (More Maps, More Currency, More Scarabs, More Div Cards)
  const pseudoQualMap: Record<string, string> = {
    moremaps: 'pseudo.pseudo_map_more_map_drops',
    morecurrency: 'pseudo.pseudo_map_more_currency_drops',
    morescarabs: 'pseudo.pseudo_map_more_scarab_drops',
    moredivcards: 'pseudo.pseudo_map_more_card_drops',
  }
  const pseudoFilters: Array<{ id: string; value: Record<string, unknown> }> = []
  for (const [key, statId] of Object.entries(pseudoQualMap)) {
    if (qualifiers[key]) pseudoFilters.push({ id: statId, value: { min: qualifiers[key] } })
  }
  if (pseudoFilters.length > 0) {
    statGroups.push({ type: 'and', filters: pseudoFilters })
  }

  // 8-mod corrupted: add pseudo affix count filter
  if (corrupted8mod) {
    statGroups.push({ type: 'and', filters: [{ id: 'pseudo.pseudo_number_of_affix_mods', value: { min: 8 } }] })
  }

  // Originator: implicit stat "Area is Influenced by the Originator's Memories"
  if (originator && !nightmare) {
    const originatorStat = matchModToStat("Area is Influenced by the Originator's Memories", false, 'implicit')
    if (originatorStat) {
      statGroups.push({ type: 'and', filters: [{ id: originatorStat.statId, value: {} }] })
    }
  }

  const miscFilters: Record<string, unknown> = {}
  if (corrupted8mod) miscFilters.corrupted = { option: 'true' }

  const query: Record<string, unknown> = {
    status: { option: tradeStatus },
    type: nightmare ? 'Nightmare Map' : { option: 'Map', discriminator: 'map' },
    stats: statGroups.length > 0 ? statGroups : [{ type: 'and', filters: [] }],
    filters: {
      type_filters: { disabled: false, filters: { rarity: { option: 'nonunique' } } },
      map_filters: { disabled: false, filters: mapFilterObj },
      ...(Object.keys(miscFilters).length > 0 ? { misc_filters: { disabled: false, filters: miscFilters } } : {}),
      trade_filters: {
        disabled: false,
        filters: {
          ...(tradePriceOption === 'chaos_divine' ? { price: { min: null, max: null, option: tradePriceOption } } : {}),
          collapse: { option: 'true' },
        },
      },
    },
  }

  const body = JSON.stringify({ query, sort: { price: 'asc' } })

  const searchResult = (await fetchJson(`${POE_TRADE_API}/search/${encodeURIComponent(league)}`, {
    method: 'POST',
    body,
  })) as TradeSearchResult

  if (!searchResult.result || searchResult.result.length === 0) {
    return { total: searchResult.total ?? 0, listings: [], queryId: searchResult.id ?? '' }
  }

  const listings = await fetchAndMapListings(searchResult.result.slice(0, 10), searchResult.id)

  return {
    total: searchResult.total ?? 0,
    listings,
    queryId: searchResult.id ?? '',
    remainingIds: searchResult.result.slice(10),
  }
}

export async function fetchMoreListings(
  queryId: string,
  ids: string[],
): Promise<{ listings: TradeListing[]; remainingIds: string[] }> {
  await throttle()
  const batch = ids.slice(0, 10)
  const listings = await fetchAndMapListings(batch, queryId)
  return { listings, remainingIds: ids.slice(10) }
}
