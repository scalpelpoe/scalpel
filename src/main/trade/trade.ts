import { app, net } from 'electron'
import { TRANSFIGURED_GEM_DISC } from '../../shared/data/trade/transfigured-gems'
import { getTradeUrls } from '../../shared/endpoints'
import { isClusterJewel, isSkillGem } from '../../shared/poe-item'
import { getPoeVersion } from '../game-state'
import { getOverlayWindow } from '../overlay'
import { harvestIcons } from './icon-cache'
import { adjustRateLimits, RateLimiter } from './rate-limiter'

/** Forward any newly-harvested name->icon pairs to the overlay so it can merge
 *  them into the in-session iconMap. Without this the renderer would only pick
 *  up new icons on next launch (when it re-reads the on-disk cache at boot). */
function broadcastNewIcons(added: Record<string, string>): void {
  if (Object.keys(added).length === 0) return
  const win = getOverlayWindow()
  if (win && !win.isDestroyed()) win.webContents.send('icon-cache-updated', added)
}

/** Tell the overlay when the trade API has locked us out for a specific
 *  duration. Sent as an absolute epoch ms (end-of-penalty) so the renderer's
 *  countdown isn't sensitive to IPC-delivery jitter or its own clock skew. */
function broadcastTradePenalty(untilEpochMs: number): void {
  const win = getOverlayWindow()
  if (win && !win.isDestroyed()) win.webContents.send('trade-penalty', untilEpochMs)
}

// Re-export stat-matcher functions so existing importers don't need to change
export { ensureStatsLoaded, ITEM_CLASS_TO_CATEGORY, matchItemMods, matchModToStat } from './stat-matcher'

// ─── Version-specific trade dialect ──────────────────────────────────────────
//
// The PoE2 trade API diverges from PoE1 in a handful of small ways -- filter
// group names, baseline-currency option values, etc. Rather than sprinkling
// `poeVersion === 2 ?` ternaries through the query builders, collect every
// version-specific knob here. When PoE2 grows additional overrides (new filter
// groups, PoE2-only fields, different item-class routing), extend this table
// instead of adding more branches at call sites.

interface TradeDialect {
  /** Filter group name for defensive stats (AR/EV/ES/ward/block). PoE2 merges
   *  these with weapon DPS into one group; PoE1 keeps them separate. */
  defenceFilterGroup: 'armour_filters' | 'equipment_filters'
  /** Filter group name for weapon DPS stats (pdps/edps/aps/crit). */
  weaponFilterGroup: 'weapon_filters' | 'equipment_filters'
  /** The "baseline or divine" option value -- chaos_divine (PoE1) or
   *  exalted_divine (PoE2). Sent as-is to the API. */
  priceDivinePair: 'chaos_divine' | 'exalted_divine'
  /** The client-side "equivalent" option. Not a valid API value; when selected
   *  we omit the price filter entirely and the consumer does the math locally. */
  priceEquivalent: 'chaos_equivalent' | 'exalted_equivalent'
  /** Calculated pseudo ids this game's trade API does NOT support as native
   *  `pseudo.*` stat ids and must instead be sent as Weighted Sum (`weight`)
   *  groups over their contributing real stat ids. PoE1 supports all of them
   *  (empty set); PoE2 supports the totals (resistances, life, mana) but not
   *  added-elemental-damage, so only those ids live here. Remove ids as GGG
   *  adds support. */
  weightedPseudoIds: ReadonlySet<string>
}

/** PoE2 trade-fetch responses return mod text with localization tokens like
 *  `[Attributes|Attribute]` and `[Spirit]` embedded in the string. Trade-site UI
 *  resolves these via its i18n layer; we don't have that, so rewrite the tokens
 *  into their display form: `[a|b]` -> `b`, `[a]` -> `a`. No-op on PoE1 strings
 *  (which never contain these brackets) so it runs unconditionally. Mirrors EE2's
 *  parseAffixStrings helper. */
export function stripTradeTokens(s: string): string {
  return s.replace(/\[([^\]|]+)\|?([^\]]*)\]/g, (_, a: string, b: string) => b || a)
}

// Calculated pseudos that PoE2's /api/trade2 rejects as native `pseudo.*` stat
// ids (it 400s on them). Sent as Weighted Sum groups instead. Everything else we
// compute (total resistances, life, mana) IS a valid PoE2 pseudo id and stays on
// the native path. PoE1 supports all of them, so its set is empty.
const POE2_WEIGHTED_PSEUDO_IDS: ReadonlySet<string> = new Set([
  'pseudo.pseudo_adds_elemental_damage',
  'pseudo.pseudo_adds_elemental_damage_to_attacks',
  'pseudo.pseudo_adds_elemental_damage_to_spells',
])

const TRADE_DIALECTS: Record<1 | 2, TradeDialect> = {
  1: {
    defenceFilterGroup: 'armour_filters',
    weaponFilterGroup: 'weapon_filters',
    priceDivinePair: 'chaos_divine',
    priceEquivalent: 'chaos_equivalent',
    weightedPseudoIds: new Set(),
  },
  2: {
    defenceFilterGroup: 'equipment_filters',
    weaponFilterGroup: 'equipment_filters',
    priceDivinePair: 'exalted_divine',
    priceEquivalent: 'exalted_equivalent',
    weightedPseudoIds: POE2_WEIGHTED_PSEUDO_IDS,
  },
}

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
  /** Ids of the Weighted Sum pseudos (e.g. added elemental damage on PoE2) that
   *  were dropped from the query because the user is not logged in -- the trade
   *  API rejects weighted searches for anonymous users. The UI shows a login tip
   *  on each matching filter row. Absent when nothing was dropped. */
  loginRequiredPseudoIds?: string[]
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
  // Human-readable label paired with `option` for chips whose API id differs
  // from the user-visible text (e.g. ultimatum: option="Exterminate",
  // displayValue="Defeat waves of enemies"). Flows over IPC to the renderer's
  // value box; the trade query builder reads `option`, not this.
  displayValue?: string
  timelessLeaders?: string[] // all leader stat IDs for timeless count group
  foulborn?: boolean
  modTier?: number // mod tier if known (from advanced mod data)
  modRange?: { min: number; max: number } // possible roll range for this mod
  /** Ternary chip state: 'yes' | 'no' | undefined (= any). Also used by
   *  minmax chips: 'min' | 'max' | undefined (= off). */
  chipState?: 'yes' | 'no' | 'min' | 'max'
  /** PoE2 Weighted Sum payload for calculated pseudos: the contributing real
   *  stat ids. Present only on `type: 'pseudo'` chips; ignored on PoE1, where
   *  pseudos use their native `pseudo.*` id. */
  weightFilters?: Array<{ id: string }>
  /** Set true when the adaptive-defaults engine overrode this chip's enabled state. */
  learned?: boolean
}

/** Build a trade `{ min?, max? }` value object from a filter, dropping bounds
 *  that are null. */
function minMaxValue(f: { min: number | null; max: number | null }): { min?: number; max?: number } {
  return {
    ...(f.min != null ? { min: f.min } : {}),
    ...(f.max != null ? { max: f.max } : {}),
  }
}

/** True when this pseudo chip must be sent as a Weighted Sum group rather than a
 *  native `pseudo.*` id -- i.e. its id is unsupported by the current game's trade
 *  API. See TradeDialect.weightedPseudoIds. */
function isWeightedPseudo(f: StatFilter, dialect: TradeDialect): boolean {
  return (
    f.type === 'pseudo' && dialect.weightedPseudoIds.has(f.id) && f.weightFilters != null && f.weightFilters.length > 0
  )
}

/** Whether a search would include at least one Weighted Sum group. The trade API
 *  rejects weighted searches for anonymous users, so the caller checks login
 *  before searching only when this is true. */
export function searchNeedsLogin(statFilters: StatFilter[]): boolean {
  const dialect = TRADE_DIALECTS[getPoeVersion()]
  return statFilters.some((f) => f.enabled && isWeightedPseudo(f, dialect))
}

const ynToOption = (s: 'yes' | 'no'): 'true' | 'false' => (s === 'yes' ? 'true' : 'false')

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
    const window = parseInt(r[1], 10)
    knownTiers.set(window, {
      used: parseInt(s[0], 10),
      max: parseInt(r[0], 10),
      window,
      penalty: parseInt(s[2], 10),
      lastUpdate: now,
    })
  }
  if (knownTiers.size > 0 && rateLimitCallback) {
    rateLimitCallback({ tiers: [...knownTiers.values()].sort((a, b) => a.window - b.window) })
  }
}

// ─── Proactive rate limiting ──────────────────────────────────────────────────
//
// GGG advertises per-endpoint bucket policies in every response; Awakened PoE
// Trade / Exiled Exchange 2 mirror those buckets client-side and wait *before*
// exceeding them, so 429s effectively never fire. We do the same: one bucket
// set per endpoint category. Seed each with a tiny 1/5s limiter so the first
// request still goes through some gating before we've seen the real policy.

/** Endpoint categories that GGG serves on separate policies. Picked per
 *  `net.request` so /search doesn't share a bucket with /fetch. */
export type RateLimitCategory = 'search' | 'fetch' | 'exchange'

const RATE_LIMIT_RULES: Record<RateLimitCategory, Set<RateLimiter>> = {
  search: new Set<RateLimiter>([new RateLimiter(1, 5)]),
  fetch: new Set<RateLimiter>([new RateLimiter(1, 5)]),
  exchange: new Set<RateLimiter>([new RateLimiter(1, 5)]),
}

/** Test hook: clear every bucket so back-to-back test cases don't inherit
 *  a "recently used" seed from an earlier call. No-op in production. */
export function _resetRateLimitsForTests(): void {
  for (const category of Object.keys(RATE_LIMIT_RULES) as RateLimitCategory[]) {
    for (const limit of RATE_LIMIT_RULES[category]) limit.destroy()
    RATE_LIMIT_RULES[category] = new Set<RateLimiter>([new RateLimiter(1, 5)])
  }
}

function categoryFor(url: string): RateLimitCategory {
  if (url.includes('/fetch/')) return 'fetch'
  if (url.includes('/exchange/')) return 'exchange'
  return 'search'
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────
//
// Match the approach APT + EE2 use (verified in their main/src/proxy.ts):
//   - `net.request` with `useSessionCookies: true` so any POESESSID / cf-
//     clearance picked up by the app's login window is included.
//   - No `Origin`, no `Referer`, no `Sec-Fetch-*`, no `Accept-Language`. APT
//     actively strips these from their proxy -- sending them puts us in a
//     stricter bucket than the trade website.
//   - `app.userAgentFallback` is Electron's default Chrome/Electron UA and is
//     what APT forwards; GGG is fine with it.
//   - `referrerPolicy: 'no-referrer-when-downgrade'` is the same option APT
//     uses; it's the default, but setting it explicitly documents intent.
function commonRequestOpts(url: string, method: string): Electron.ClientRequestConstructorOptions {
  return {
    url,
    method,
    useSessionCookies: true,
    referrerPolicy: 'no-referrer-when-downgrade',
  }
}

function setTradeHeaders(request: Electron.ClientRequest): void {
  request.setHeader('Content-Type', 'application/json')
  request.setHeader('Accept', 'application/json')
  request.setHeader('User-Agent', app.userAgentFallback)
}

// Hard ceiling on a single HTTP attempt. electron's `net.request` has no
// built-in timeout, so a half-open TCP socket / silent upstream drop will
// hang the renderer's shimmer loader indefinitely. PoE2's /trade2 endpoints
// are prone to this during busy hours while the /trade2 web UI keeps serving
// out of cache. Fail fast and let the retry loop try again -- worst case the
// user sees a short "timed out" after two misses instead of an endless spinner.
const REQUEST_TIMEOUT_MS = 15000

async function fetchJson(url: string, options?: { method?: string; body?: string }, retries = 2): Promise<unknown> {
  const category = categoryFor(url)
  // Proactive wait: block until every bucket the server has advertised for
  // this endpoint category has a free slot. This is what keeps 429s from
  // firing under normal use. Seed limiters handle the first request before
  // we've seen a response's headers.
  await RateLimiter.waitMulti(RATE_LIMIT_RULES[category])
  for (let attempt = 0; attempt <= retries; attempt++) {
    const started = Date.now()
    try {
      const result = await new Promise((resolve, reject) => {
        const request = net.request(commonRequestOpts(url, options?.method ?? 'GET'))
        setTradeHeaders(request)

        // Abort+reject on no-response-within-timeout. Single-shot so retries
        // from the rate-limit path stay in charge of when to try again.
        let timedOut = false
        const timer = setTimeout(() => {
          timedOut = true
          try {
            request.abort()
          } catch {
            /* already done */
          }
          console.error(`[trade] timeout after ${REQUEST_TIMEOUT_MS}ms: ${options?.method ?? 'GET'} ${url}`)
          reject({ timedOut: true })
        }, REQUEST_TIMEOUT_MS)

        let data = ''
        request.on('response', (response) => {
          // Two things happen with rate-limit headers on every response:
          //   1. Proactive limiters get re-synced against the server's
          //      advertised buckets so the *next* waitMulti knows the truth.
          //   2. The UI-facing state (knownTiers + broadcast) continues to
          //      drive the meter + tooltip.
          // net.request's headers come as string | string[]; cast down for
          // adjustRateLimits which expects plain strings.
          const flatHeaders: Record<string, string> = {}
          for (const [k, v] of Object.entries(response.headers)) {
            flatHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : String(v)
          }
          adjustRateLimits(RATE_LIMIT_RULES[category], flatHeaders)
          const limitState = response.headers['x-rate-limit-ip-state']
          const limitRules = response.headers['x-rate-limit-ip']
          if (limitState && limitRules) {
            parseAndBroadcastRateLimit(String(limitState), String(limitRules))
          }

          if (response.statusCode === 429) {
            clearTimeout(timer)
            const retryAfter = response.headers['retry-after']
            const wait = retryAfter ? parseInt(String(retryAfter), 10) * 1000 : 5000
            console.error(`[trade] 429 rate limited: retry-after=${Math.round(wait / 1000)}s for ${url}`)
            // Broadcast only when the penalty is long enough to surface to the
            // user. Short waits are absorbed by the retry loop and never reach
            // the UI, so lighting up the Greg banner for a 1-second blip would
            // just flicker.
            if (wait >= 10000) broadcastTradePenalty(Date.now() + wait)
            reject({ rateLimited: true, wait })
            return
          }
          response.on('data', (chunk) => {
            data += chunk.toString()
          })
          response.on('end', () => {
            if (timedOut) return
            clearTimeout(timer)
            const elapsed = Date.now() - started
            try {
              const parsed = JSON.parse(data)
              // Surface trade-API error bodies (e.g. invalid stat ID, bad category) so
              // they don't silently appear as "0 results". Leave rate limits (429) to
              // the dedicated branch above.
              if (response.statusCode && response.statusCode >= 400) {
                console.error(`[trade] ${response.statusCode} in ${elapsed}ms from ${url}:`, data.slice(0, 500))
              } else if (parsed && typeof parsed === 'object' && 'error' in parsed) {
                console.error(`[trade] API error in ${elapsed}ms from ${url}:`, data.slice(0, 500))
              }
              resolve(parsed)
            } catch (e) {
              console.error(`[trade] JSON parse failed after ${elapsed}ms from ${url}:`, data.slice(0, 200))
              reject(e)
            }
          })
        })
        request.on('error', (err) => {
          if (timedOut) return
          clearTimeout(timer)
          console.error(`[trade] request error for ${url}:`, err)
          reject(err)
        })
        if (options?.body) request.write(options.body)
        request.end()
      })
      return result
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'rateLimited' in e) {
        // With the proactive limiter, reaching this path means a hidden tier
        // we can't see in the response headers kicked in (GGG does bucket by
        // things like UA fingerprint on top of the advertised policies). No
        // point sleeping the retry out silently -- surface the wait to the
        // user and let the Greg banner count it down.
        const wait = (e as unknown as { wait: number }).wait
        const MAX_SILENT_WAIT_MS = 30000
        if (wait <= MAX_SILENT_WAIT_MS && attempt < retries) {
          await new Promise((r) => setTimeout(r, wait))
          continue
        }
        const waitSec = Math.round(wait / 1000)
        throw new Error(`Rate limited by the trade API -- wait ${waitSec}s and try again`)
      }
      if (e && typeof e === 'object' && 'timedOut' in e && attempt < retries) {
        // Re-loop without sleeping: the remote just ate our connection, try
        // the next endpoint immediately rather than stalling the user further.
        console.error(`[trade] timeout after ${REQUEST_TIMEOUT_MS}ms on ${url}, retrying (${attempt + 1}/${retries})`)
        continue
      }
      if (e && typeof e === 'object' && 'timedOut' in e) {
        throw new Error(`Trade API timed out after ${REQUEST_TIMEOUT_MS / 1000}s -- retry when you're ready`)
      }
      throw e
    }
  }
  throw new Error('Max retries exceeded')
}

// ─── Trade API ────────────────────────────────────────────────────────────────

import {
  ensureStatsLoaded as _ensureStatsLoaded,
  ITEM_CLASS_TO_CATEGORY as _ITEM_CLASS_TO_CATEGORY,
  matchModToStat,
} from './stat-matcher'

export interface SearchTradeOptions {
  tradeStatus?: string
  tradePriceOption?: string
  listedTime?: string
  collapseListings?: boolean
  loggedIn?: boolean
}

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
  options: SearchTradeOptions = {},
): Promise<TradeResult> {
  const { tradeStatus = 'available', tradePriceOption, listedTime, collapseListings = true, loggedIn = true } = options
  await _ensureStatsLoaded()
  const dialect = TRADE_DIALECTS[getPoeVersion()]
  const priceOption = tradePriceOption ?? dialect.priceDivinePair

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
  } else if (item.rarity === 'Unique' && item.itemClass === 'Stackable Currency') {
    // Captured beasts: a beast IS its own base, so the trade listing's typeLine is
    // the beast name and the name field is empty. Setting query.name would AND-filter
    // every listing out. Match APT's behavior and search by type only.
    query.type = item.baseType
  } else if (item.rarity === 'Unique') {
    query.name = item.name.replace(/^Foulborn\s+/i, '')
    query.type = item.baseType
  } else if (item.itemClass === 'Maps') {
    // Maps: use "Map" type with discriminator, add tier + blight filters
    const isValdoMap = item.baseType === 'Valdo Map'
    const tierMatch = item.baseType.match(/\(Tier (\d+)\)/)
    const mapTier = tierMatch ? parseInt(tierMatch[1], 10) : null
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
  } else if (isSkillGem(item)) {
    query.type = buildGemTypeField(item.baseType, item.vaalGem)
  } else {
    // Non-uniques: search by item class, not base type. The implicit covers the base.
    // Cluster jewels narrow to the cluster subcategory (jewel.cluster) so the
    // results don't bleed into abyss/timeless/regular jewels which are priced
    // very differently and would dilute the comparison.
    const classCategory = isClusterJewel(item) ? 'jewel.cluster' : _ITEM_CLASS_TO_CATEGORY[item.itemClass]
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
      if (key) armourFilters[key] = minMaxValue(f)
    }
    const existing = (query.filters as Record<string, unknown>) ?? {}
    const existingGroup = (existing[dialect.defenceFilterGroup] as { filters?: Record<string, unknown> } | undefined)
      ?.filters
    query.filters = {
      ...existing,
      [dialect.defenceFilterGroup]: { disabled: false, filters: { ...(existingGroup ?? {}), ...armourFilters } },
    }
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
      if (key) weaponQuery[key] = minMaxValue(f)
    }
    const existing = (query.filters as Record<string, unknown>) ?? {}
    const existingGroup = (existing[dialect.weaponFilterGroup] as { filters?: Record<string, unknown> } | undefined)
      ?.filters
    query.filters = {
      ...existing,
      [dialect.weaponFilterGroup]: { disabled: false, filters: { ...(existingGroup ?? {}), ...weaponQuery } },
    }
  }

  // Add socket filters
  const socketFilters = statFilters.filter((f) => (f.type === 'socket' || f.id === 'socket.white_sockets') && f.enabled)
  if (socketFilters.length > 0) {
    const socketQuery: Record<string, Record<string, number>> = {}
    // PoE2's rune_sockets filter lives under equipment_filters (same group as AR/EV/ES).
    const runeSocketRange: { min?: number; max?: number } = {}
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
        socketQuery.links = minMaxValue(f)
      } else if (f.id === 'socket.rune_sockets') {
        if (f.min != null) runeSocketRange.min = f.min
        if (f.max != null) runeSocketRange.max = f.max
      }
    }
    const existing = (query.filters as Record<string, unknown>) ?? {}
    if (Object.keys(socketQuery).length > 0) {
      query.filters = { ...existing, socket_filters: { filters: socketQuery } }
    }
    if (Object.keys(runeSocketRange).length > 0) {
      const filtersObj = (query.filters as Record<string, unknown>) ?? existing
      const group = (filtersObj[dialect.defenceFilterGroup] as { filters?: Record<string, unknown> } | undefined)
        ?.filters
      query.filters = {
        ...filtersObj,
        [dialect.defenceFilterGroup]: {
          disabled: false,
          filters: { ...(group ?? {}), rune_sockets: runeSocketRange },
        },
      }
    }
  }

  // Add heist filters (wings revealed)
  const heistFilters = statFilters.filter((f) => f.type === 'heist' && f.enabled)
  if (heistFilters.length > 0) {
    const heistQuery: Record<string, { min?: number; max?: number }> = {}
    for (const f of heistFilters) {
      // Map filter IDs like "heist.heist_engineering" -> trade query key "heist_engineering"
      const key = f.id.replace('heist.', '')
      heistQuery[key] = minMaxValue(f)
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
    if (f.id === 'misc.quality' && f.enabled) miscQuery.quality = minMaxValue(f)
    if (f.id === 'misc.ilvl' && f.enabled) miscQuery.ilvl = minMaxValue(f)
    if (f.id === 'misc.gem_level' && f.enabled) miscQuery.gem_level = minMaxValue(f)
    if (f.id === 'misc.gem_transfigured') miscQuery.gem_transfigured = { option: f.enabled ? 'true' : 'false' }
    if (f.id === 'misc.corrupted' && (f.chipState === 'yes' || f.chipState === 'no'))
      miscQuery.corrupted = { option: ynToOption(f.chipState) }
    if (f.id === 'misc.mirrored' && (f.chipState === 'yes' || f.chipState === 'no'))
      miscQuery.mirrored = { option: ynToOption(f.chipState) }
    if (f.id === 'misc.identified') miscQuery.identified = { option: f.enabled ? 'false' : 'true' }
    if (f.id === 'misc.memory_level' && f.enabled) miscQuery.memory_level = minMaxValue(f)
    if (f.id === 'misc.area_level' && f.enabled) miscQuery.area_level = minMaxValue(f)
    if (f.id === 'misc.stored_experience' && f.enabled) miscQuery.stored_experience = minMaxValue(f)
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
  const fracturedFilter = miscFiltersAll.find((f) => f.id === 'misc.fractured')
  if (fracturedFilter?.chipState === 'yes' || fracturedFilter?.chipState === 'no') {
    miscQuery.fractured_item = { option: ynToOption(fracturedFilter.chipState) }
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
        mapQuery[key] = minMaxValue(f)
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
  // Unid items have hidden mods, so any explicit/implicit/fractured/crafted/pseudo
  // filter would never match -- drop those when the unid chip is on. Enchants
  // and imbues survive identification (cluster jewel passive count etc.), so
  // those keep flowing through.
  const unidEnabled = statFilters.some((f) => f.id === 'misc.identified' && f.enabled)
  const survivesUnid = (f: StatFilter): boolean => f.type === 'enchant' || f.type === 'imbued'
  const enabledFilters = statFilters.filter(
    (f) =>
      f.enabled &&
      f.type !== 'timeless' &&
      f.id !== 'misc.memory_level' &&
      f.id !== 'socket.white_sockets' &&
      (!['defence', 'weapon', 'socket', 'misc', 'gem', 'map', 'heist', 'currency', 'ultimatum'].includes(f.type) ||
        miscPseudoIds.has(f.id) ||
        mapPseudoIds.has(f.id)) &&
      (!unidEnabled || survivesUnid(f)),
  )
  // A few calculated pseudos (added elemental damage on PoE2) aren't valid native
  // `pseudo.*` ids on their trade API and 400 if sent, so we emit a Weighted Sum
  // group over the contributing real stat ids instead. Natively-supported pseudos
  // (resistances, life, mana) and all PoE1 pseudos stay in the `and` group as
  // native ids. dialect.weightedPseudoIds names the ids that need this routing.
  const weightPseudoFilters = enabledFilters.filter((f) => isWeightedPseudo(f, dialect))
  const andFilters = enabledFilters.filter((f) => !weightPseudoFilters.includes(f))

  // The trade API rejects weighted searches for anonymous users ("too complex,
  // log in"), so emit weight groups only when logged in. When not, the unsupported
  // pseudos are dropped (already excluded from andFilters) and we report their ids
  // so the UI can prompt a login on those rows rather than silently lose them.
  const loginRequiredPseudoIds = loggedIn ? [] : weightPseudoFilters.map((f) => f.id)
  // Spread into whichever TradeResult we return below; empty object when nothing
  // was dropped so the field is absent.
  const loginRequiredField = loginRequiredPseudoIds.length > 0 ? { loginRequiredPseudoIds } : {}

  const timelessFilters = unidEnabled ? [] : statFilters.filter((f) => f.enabled && f.type === 'timeless')

  const statGroups: Array<{
    type: string
    filters: Array<{ id: string; value?: Record<string, unknown>; disabled?: boolean }>
    value?: Record<string, unknown>
    disabled?: boolean
  }> = []

  if (andFilters.length > 0) {
    statGroups.push({
      type: 'and',
      filters: andFilters.map((f) => ({
        id: f.id,
        value: f.option ? { option: f.option } : minMaxValue(f),
      })),
    })
  }

  // One Weighted Sum group per pseudo that needs it. The trade2 weight group
  // lists each stat id as `{id, disabled:false}` and sums at the implicit weight
  // of 1; it does NOT accept a per-filter `value:{weight}` (that renders the saved
  // search blank). Skipped for anonymous users (see loginRequiredPseudoIds above).
  if (loggedIn) {
    for (const f of weightPseudoFilters) {
      statGroups.push({
        type: 'weight',
        disabled: false,
        filters: f.weightFilters!.map((w) => ({ id: w.id, disabled: false })),
        value: minMaxValue(f),
      })
    }
  }

  // Timeless jewel: "any leader" uses count group, specific leader uses and group
  const timelessAny = timelessFilters.find((f) => f.id === 'timeless-any')
  const timelessSpecific = timelessFilters.find((f) => f.id !== 'timeless-any')
  if (timelessAny?.timelessLeaders) {
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

  // Inscribed Ultimatum filters. Each enabled chip carries the API-internal id
  // in its `option` field (resolved at chip-generation time in stat-matcher).
  const ultimatumChips = statFilters.filter((f) => f.type === 'ultimatum' && f.enabled)
  if (ultimatumChips.length > 0) {
    const ultiKeyMap: Record<string, string> = {
      'ultimatum.challenge': 'ultimatum_challenge',
      'ultimatum.reward': 'ultimatum_reward',
      'ultimatum.input': 'ultimatum_input',
      'ultimatum.output': 'ultimatum_output',
    }
    const ultimatumFilters: Record<string, { option: string }> = {}
    for (const f of ultimatumChips) {
      const key = ultiKeyMap[f.id]
      if (key && typeof f.option === 'string') ultimatumFilters[key] = { option: f.option }
    }
    if (Object.keys(ultimatumFilters).length > 0) {
      query.filters = {
        ...((query.filters as Record<string, unknown>) ?? {}),
        ultimatum_filters: { disabled: false, filters: ultimatumFilters },
      }
    }
  }

  query.stats = statGroups.length > 0 ? statGroups : [{ type: 'and', filters: [] }]

  // Add trade filters: collapse by account, price currency option, optional listed-time.
  // The "equivalent" pseudo-option isn't valid for trade_filters.price.option -- sending
  // it drops the whole filter block and returns broken results. APT/EE2 omit the price
  // filter entirely in that mode and do the equivalence math client-side; same here.
  const existing = (query.filters as Record<string, unknown>) ?? {}
  const tradeFiltersInner: Record<string, unknown> = {}
  // Only send the collapse option when grouping is wanted; sending 'false' is
  // not the same as omitting it and produces ungrouped-but-noisy results.
  if (collapseListings) {
    tradeFiltersInner.collapse = { option: 'true' }
  }
  if (priceOption !== dialect.priceEquivalent) {
    tradeFiltersInner.price = { min: null, max: null, option: priceOption }
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

  const urls = getTradeUrls(getPoeVersion())
  const searchResult = (await fetchJson(urls.search(league), {
    method: 'POST',
    body,
  })) as TradeSearchResult

  if (!searchResult.result || searchResult.result.length === 0) {
    return {
      total: searchResult.total ?? 0,
      listings: [],
      queryId: searchResult.id ?? '',
      remainingIds: [],
      ...loginRequiredField,
    }
  }

  // Fetch first 10 results
  const ids = searchResult.result.slice(0, 10).join(',')
  const fetchResult = (await fetchJson(urls.fetch(ids, searchResult.id ?? ''))) as {
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
        properties?: Array<{ name: string; values: Array<[string, number]>; type?: number }>
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
              magnitudes: Array<{ hash: string; min: string; max: string }> | null
            }>
          >
          hashes?: Record<string, Array<[string, number[]]>>
        }
      }
    }>
  }

  // The trade fetch endpoint occasionally returns `null` for entries whose
  // listing was deleted between our search call and our fetch call -- guard
  // both consumers below so we don't NPE inside the map callback.
  const fetchedEntries = (fetchResult.result ?? []).filter((r): r is NonNullable<typeof r> => r != null)

  broadcastNewIcons(
    harvestIcons(
      getPoeVersion(),
      fetchedEntries.map((r) => ({
        name: r.item?.name,
        baseType: r.item?.baseType,
        rarity: ['Normal', 'Magic', 'Rare', 'Unique'][r.item?.frameType ?? 0],
        icon: r.item?.icon,
      })),
    ),
  )

  const listings: TradeListing[] = fetchedEntries.map((r) => ({
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
      ? (() => {
          const clean = (arr?: string[]): string[] | undefined => arr?.map(stripTradeTokens)
          const explicit = clean(r.item.explicitMods)
          const implicit = clean(r.item.implicitMods)
          const enchant = clean(r.item.enchantMods)
          const fractured = clean(r.item.fracturedMods)
          const crafted = clean(r.item.craftedMods)
          const foulborn = clean(r.item.mutatedMods)
          return {
            name: r.item.name,
            baseType: r.item.baseType,
            rarity: ['Normal', 'Magic', 'Rare', 'Unique'][r.item.frameType ?? 0] ?? 'Normal',
            explicitMods: [...(fractured ?? []), ...(explicit ?? []), ...(crafted ?? []), ...(foulborn ?? [])],
            implicitMods: implicit,
            enchantMods: enchant,
            fracturedMods: fractured,
            craftedMods: crafted,
            foulbornMods: foulborn,
            ilvl: r.item.ilvl,
            sockets: r.item.sockets,
            gemLevel: r.item.properties?.find((p) => p.name === 'Level')?.values?.[0]?.[0]
              ? parseInt(r.item.properties.find((p) => p.name === 'Level')!.values[0][0], 10)
              : undefined,
            quality: r.item.properties?.find((p) => p.name === 'Quality')?.values?.[0]?.[0]
              ? parseInt(r.item.properties.find((p) => p.name === 'Quality')!.values[0][0].replace(/[+%]/g, ''), 10)
              : undefined,
            storedExperience: r.item.properties?.find((p) => p.name.startsWith('Stored Experience'))?.values?.[0]?.[0]
              ? parseInt(r.item.properties.find((p) => p.name.startsWith('Stored Experience'))!.values[0][0], 10)
              : undefined,
            areaLevel: r.item.properties?.find((p) => p.name === 'Area Level')?.values?.[0]?.[0]
              ? parseInt(r.item.properties.find((p) => p.name === 'Area Level')!.values[0][0], 10)
              : undefined,
            heistJob: (() => {
              const prop = r.item?.properties?.find((p) => p.type === 46)
              if (!prop?.values?.[0]?.[0] && !prop?.values?.[1]?.[0]) return undefined
              return { skill: prop?.values[1]?.[0] as string, level: parseInt(prop?.values[0]?.[0] as string, 10) }
            })(),
            corrupted: r.item.corrupted,
            mirrored: r.item.duplicated,
            identified: r.item.identified,
            ...(() => {
              const ap = r.item?.additionalProperties
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
              const mods = r.item?.extended?.mods
              const hashes = r.item?.extended?.hashes
              if (!mods || !hashes) return undefined

              // Detect implicit magnitude multipliers (e.g. "25% increased Suffix Modifier magnitudes")
              let prefixMult = 1
              let suffixMult = 1
              for (const imp of r.item?.implicitMods ?? []) {
                const mm = imp.match(/(\d+)% increased (Prefix|Suffix) Modifier magnitudes/)
                if (mm) {
                  if (mm[2] === 'Prefix') prefixMult += parseInt(mm[1], 10) / 100
                  if (mm[2] === 'Suffix') suffixMult += parseInt(mm[1], 10) / 100
                }
              }

              const result: Record<string, { tier: string; name: string; ranges: string }> = {}
              const categories: Array<{ key: string; texts?: string[] }> = [
                { key: 'explicit', texts: r.item?.explicitMods },
                { key: 'implicit', texts: r.item?.implicitMods },
                { key: 'fractured', texts: r.item?.fracturedMods },
                { key: 'crafted', texts: r.item?.craftedMods },
                { key: 'enchant', texts: r.item?.enchantMods },
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
                  // The trade API can return magnitudes: null for mods with no
                  // numeric ranges (Inscribed Ultimatum challenges, certain
                  // unique fixed mods, etc). The TS type promises an array but
                  // runtime disagrees - guard so we don't NPE.
                  const ranges = (m.magnitudes ?? [])
                    .map((mag) => {
                      const min = Math.trunc(parseFloat(mag.min) * mult)
                      const max = Math.trunc(parseFloat(mag.max) * mult)
                      return min === max ? String(min) : `${min}-${max}`
                    })
                    .join(', ')
                  // Strip tokens to match the stripped mod text used as display key
                  // in the explicit/implicit/fractured/crafted arrays above.
                  result[stripTradeTokens(texts[i])] = { tier: m.tier, name: m.name, ranges }
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
        })()
      : undefined,
  }))

  return {
    total: searchResult.total,
    listings,
    queryId: searchResult.id,
    remainingIds: searchResult.result.slice(10),
    ...loginRequiredField,
  }
}

// ─── Bulk Exchange ──────────────────────────────────────────────────────────

import { isVendorExchangeItem } from '../../shared/data/trade/bulk-exchange-eligibility'
import { getBulkExchangeIdMap } from '../../shared/data/trade/bulk-exchange-ids'

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
  // Try exact name first (e.g. "Divine Orb", "Uncut Skill Gem (Level 20)"),
  // then base type. Map is picked per game: PoE1 uses the hand-maintained
  // legacy list, PoE2 uses EE2-sourced IDs.
  const bulkIdMap = getBulkExchangeIdMap(getPoeVersion())
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
    'Wombgifts', // ilvl + Hiveblood requirement vary per drop
  ])
  if (regularTradeClasses.has(itemClass)) return false
  // Specific items with variable properties that need regular trade
  if (baseType === "Facetor's Lens") return false
  // Beasts are "Stackable Currency" but have rarity Rare/Unique and need regular trade
  if (itemClass === 'Stackable Currency' && (_rarity === 'Rare' || _rarity === 'Unique')) return false

  // PoE2 routing: anything sold at Ange's exchange goes through bulk, and the
  // final check below catches the rest via exchange-ID presence. The shared
  // eligibility table is the user-facing source of truth for "what you'd
  // trade in bulk" -- PoE1 uses the same predicate via Faustus elsewhere.
  if (getPoeVersion() === 2 && isVendorExchangeItem(2, itemClass, baseType, _rarity)) return true

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

  const result = (await fetchJson(getTradeUrls(getPoeVersion()).exchange(league), {
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
  const fetchResult = (await fetchJson(getTradeUrls(getPoeVersion()).fetch(ids.join(','), queryId))) as {
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

  // Same null-entry guard as searchTrade: the fetch endpoint occasionally
  // returns null for listings deleted mid-flight.
  const fetchedEntries = (fetchResult.result ?? []).filter((r): r is NonNullable<typeof r> => r != null)

  broadcastNewIcons(
    harvestIcons(
      getPoeVersion(),
      fetchedEntries.map((r) => ({
        name: r.item?.name,
        baseType: r.item?.baseType ?? r.item?.typeLine,
        rarity: ['Normal', 'Magic', 'Rare', 'Unique'][r.item?.frameType ?? 0],
        icon: r.item?.icon,
      })),
    ),
  )

  return fetchedEntries.map((r) => ({
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
          explicitMods: (r.item.explicitMods ?? []).map(stripTradeTokens),
          implicitMods: r.item.implicitMods?.map(stripTradeTokens),
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
  collapseListings: boolean = true,
): Promise<TradeResult> {
  await _ensureStatsLoaded()
  const dialect = TRADE_DIALECTS[getPoeVersion()]

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

  const avoidFilters = avoidTexts.flatMap((t) => {
    const match = matchMod(t)
    return match?.statId ? [{ id: match.statId, value: {} }] : []
  })

  const wantFilters = wantTexts.flatMap((t) => {
    const match = matchMod(t)
    return match?.statId ? [{ id: match.statId, value: {} }] : []
  })

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
          ...(tradePriceOption === dialect.priceDivinePair
            ? { price: { min: null, max: null, option: tradePriceOption } }
            : {}),
          ...(collapseListings ? { collapse: { option: 'true' } } : {}),
        },
      },
    },
  }

  const body = JSON.stringify({ query, sort: { price: 'asc' } })

  const searchResult = (await fetchJson(getTradeUrls(getPoeVersion()).search(league), {
    method: 'POST',
    body,
  })) as TradeSearchResult

  if (!searchResult.result || searchResult.result.length === 0) {
    return { total: searchResult.total ?? 0, listings: [], queryId: searchResult.id ?? '', remainingIds: [] }
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
  const batch = ids.slice(0, 10)
  const listings = await fetchAndMapListings(batch, queryId)
  return { listings, remainingIds: ids.slice(10) }
}
