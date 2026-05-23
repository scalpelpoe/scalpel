import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, net } from 'electron'
import uniqueInfoPoe1 from '../../shared/data/items/unique-info.json'
import uniqueInfoPoe2 from '../../shared/data/items/unique-info-poe2.json'
import { POE_NINJA_API } from '../../shared/endpoints'
import type { NinjaItemRef } from '../../shared/external-link'
import { deriveItemVariant } from '../../shared/external-link'
import type { PriceInfo } from '../../shared/types'
import { getPoeVersion } from '../game-state'
import { getManifest } from '../manifest'
import { fetchAndBuildPoe2PriceMap, fetchPoe2PricesFromProxy, type Poe2PriceResult } from './prices.poe2'

const staticUniquesByVersion: Record<1 | 2, Record<string, string[]>> = {
  1: uniqueInfoPoe1 as Record<string, string[]>,
  2: uniqueInfoPoe2 as Record<string, string[]>,
}
// PoE1's map gets augmented at runtime from the dense endpoint; PoE2 stays
// static (poe.ninja's PoE2 overviews don't carry base info in the variant
// string the way PoE1's do, so we trust the bundled poe2db scrape).
const poe1StaticUniquesByBase = staticUniquesByVersion[1]

// Dynamic map built from poe.ninja data, falls back to cached file, then static file
let uniqueBaseMap: Record<string, string[]> = loadCachedUniquesByBase()

function getCachePath(): string {
  return join(app.getPath('userData'), 'uniques-by-base-cache.json')
}

function loadCachedUniquesByBase(): Record<string, string[]> {
  try {
    const cachePath = getCachePath()
    if (existsSync(cachePath)) {
      return JSON.parse(readFileSync(cachePath, 'utf-8'))
    }
  } catch {
    /* fall through */
  }
  return poe1StaticUniquesByBase as Record<string, string[]>
}

function saveCachedUniquesByBase(data: Record<string, string[]>): void {
  try {
    writeFileSync(getCachePath(), JSON.stringify(data), 'utf-8')
  } catch {
    /* ignore */
  }
}

// PoE2 keeps its own cache file. Both games share the userData dir and the
// app relaunches on game switch, so a shared file would let one game clobber
// the other's cached base map. Falls back to the bundled static PoE2 scrape.
function getPoe2CachePath(): string {
  return join(app.getPath('userData'), 'uniques-by-base-poe2-cache.json')
}

function loadCachedUniquesByBasePoe2(): Record<string, string[]> {
  try {
    const cachePath = getPoe2CachePath()
    if (existsSync(cachePath)) {
      return JSON.parse(readFileSync(cachePath, 'utf-8'))
    }
  } catch {
    /* fall through */
  }
  return staticUniquesByVersion[2]
}

function saveCachedUniquesByBasePoe2(data: Record<string, string[]>): void {
  try {
    writeFileSync(getPoe2CachePath(), JSON.stringify(data), 'utf-8')
  } catch {
    /* ignore */
  }
}

let uniqueBaseMapPoe2: Record<string, string[]> = loadCachedUniquesByBasePoe2()

// Cache: "<poeVersion>:<league>" -> (name -> price). Versioning the key prevents
// "Standard" from one game silently serving the other game's prices if an
// in-process flip ever happens (relaunch on game switch makes that rare today,
// but the cost of the discriminator is one string concat per refresh).
let cachedKey = ''
let priceMap = new Map<string, PriceInfo>()
// Variant-keyed prices for items that ninja's dense API splits across multiple
// lines (skill gems by level/quality/corruption, multi-link uniques by link count).
// Key shape: `${name.toLowerCase()}|${variant}`. Fallback to name-only priceMap is
// handled by lookupPriceForItem below. PoE2 populates this from the EE2 proxy for
// unique items; the direct-ninja exchange fallback leaves it empty.
let pricesByVariant = new Map<string, PriceInfo>()
let lastFetchTime = 0
// PoE2 now uses the EE2 proxy by default (one CDN-cached request per refresh),
// matching the same load profile as PoE1's dense endpoint. Both versions use
// the same 10-minute TTL; the direct-ninja fallback path is kept but is not
// the default.
const CACHE_TTL_BY_VERSION: Record<1 | 2, number> = {
  1: 10 * 60 * 1000,
  2: 10 * 60 * 1000,
}

// Dense endpoint — returns ALL item types in one request with current prices
// (same endpoint Awakened PoE Trade uses)
const DENSE_URL = POE_NINJA_API

interface DenseLine {
  name?: string
  chaos?: number
  graph?: (number | null)[]
  variant?: string
}

interface DenseOverview {
  type: string
  lines: DenseLine[]
}

interface DenseResponse {
  currencyOverviews: DenseOverview[]
  itemOverviews: DenseOverview[]
}

function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = net.request(url)
    request.setHeader('User-Agent', 'Scalpel-Prices')
    request.setHeader('Accept', 'application/json')
    let data = ''
    request.on('response', (response) => {
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
    request.end()
  })
}

// Separate price map for div cards to avoid name collisions with other item types
let divCardPriceMap = new Map<string, PriceInfo>()

// Gem names seen in the most recent poe.ninja response. Used by the item-search
// handler to populate the gem section of the combobox -- static gem data would quickly
// rot as GGG adds/renames gems, so we rely on the live overview instead.
let gemNames: Set<string> = new Set()

// Known jewel base types for variant parsing
const JEWEL_BASES = [
  'Prismatic Jewel',
  'Cobalt Jewel',
  'Crimson Jewel',
  'Viridian Jewel',
  'Large Cluster Jewel',
  'Medium Cluster Jewel',
  'Small Cluster Jewel',
  'Timeless Jewel',
]

function buildUniquesByBaseFromDense(resp: DenseResponse): void {
  const dynamicMap: Record<string, Set<string>> = {}

  for (const overview of resp.itemOverviews ?? []) {
    if (!overview.type.startsWith('Unique')) continue

    for (const line of overview.lines ?? []) {
      if (!line.name || !line.variant) continue
      // Strip "Foulborn " prefix from name
      const name = line.name.replace(/^Foulborn\s+/i, '')

      // Try to extract base type from variant
      const parts = line.variant.split(',').map((s) => s.trim())

      // For jewels: last part is the base type
      if (overview.type === 'UniqueJewel') {
        const base = parts.find((p) => JEWEL_BASES.some((b) => p.endsWith(b)))
        if (base) {
          const baseType = JEWEL_BASES.find((b) => base.endsWith(b))!
          if (!dynamicMap[baseType]) dynamicMap[baseType] = new Set()
          dynamicMap[baseType].add(name)
        }
      }

      // For weapons/armour: find a part that matches a known base type from static data
      if (
        overview.type === 'UniqueWeapon' ||
        overview.type === 'UniqueArmour' ||
        overview.type === 'UniqueAccessory' ||
        overview.type === 'UniqueFlask'
      ) {
        for (const part of parts) {
          // Skip common non-base parts
          if (/^\d+L$/.test(part) || part === 'Relic' || part === 'Relics') continue
          if (poe1StaticUniquesByBase[part as keyof typeof poe1StaticUniquesByBase]) {
            if (!dynamicMap[part]) dynamicMap[part] = new Set()
            dynamicMap[part].add(name)
            break
          }
        }
      }
    }
  }

  // Merge dynamic data into the base map (dynamic supplements static)
  const merged = { ...(poe1StaticUniquesByBase as Record<string, string[]>) }
  for (const [base, names] of Object.entries(dynamicMap)) {
    const existing = new Set(merged[base] ?? [])
    for (const n of names) existing.add(n)
    merged[base] = [...existing]
  }
  uniqueBaseMap = merged
  saveCachedUniquesByBase(merged)
}

function processDenseResponse(resp: DenseResponse): void {
  let divineRate = 0

  // Process all overviews (currency + items use the same line format)
  const allOverviews = [...(resp.currencyOverviews ?? []), ...(resp.itemOverviews ?? [])]

  for (const overview of allOverviews) {
    const isDivCards = overview.type === 'DivinationCard'
    const isSkillGem = overview.type === 'SkillGem'
    for (const line of overview.lines ?? []) {
      const name = line.name
      const chaos = line.chaos
      if (!name) continue
      if (isSkillGem) gemNames.add(name)
      if (!chaos || chaos <= 0) continue

      if (name === 'Divine Orb') divineRate = chaos

      const info = {
        chaosValue: chaos,
        divineValue: divineRate > 0 ? chaos / divineRate : undefined,
        graph: line.graph,
      }
      priceMap.set(name.toLowerCase(), info)
      // Variant-keyed entry too (with empty-string variant for items that don't
      // have one). Lets lookupPriceForItem hit the exact gem/link variant when
      // the caller has full item context.
      pricesByVariant.set(`${name.toLowerCase()}|${line.variant ?? ''}`, info)
      if (isDivCards) divCardPriceMap.set(name.toLowerCase(), info)
    }
  }

  // Second pass to fill in divine values for items processed before Divine Orb was found.
  // Mirrored below for the variant-keyed map; both maps need backfill since they hold
  // distinct PriceInfo objects.
  if (divineRate > 0) {
    for (const [key, info] of priceMap) {
      if (info.divineValue == null) {
        priceMap.set(key, { ...info, divineValue: info.chaosValue / divineRate })
      }
    }
    for (const [key, info] of pricesByVariant) {
      if (info.divineValue == null) {
        pricesByVariant.set(key, { ...info, divineValue: info.chaosValue / divineRate })
      }
    }
  }
}

/** Reset all price maps + bookkeeping in one shot. Called after a successful fetch
 *  so a failed request (offline, sleep/resume, net::ERR_NETWORK_IO_SUSPENDED) leaves
 *  the old cache intact until the next scheduled retry 10-20 min later. */
function cacheKeyFor(league: string): string {
  return `${getPoeVersion()}:${league}`
}

function resetCache(league: string, now: number): void {
  cachedKey = cacheKeyFor(league)
  priceMap = new Map()
  pricesByVariant = new Map()
  divCardPriceMap = new Map()
  gemNames = new Set()
  lastFetchTime = now
}

export async function refreshPrices(league: string): Promise<void> {
  if (!league) return
  const now = Date.now()
  if (cacheKeyFor(league) === cachedKey && now - lastFetchTime < CACHE_TTL_BY_VERSION[getPoeVersion()]) return

  try {
    if (getPoeVersion() === 2) {
      const categoryByType = getManifest().poe2NinjaCategories
      const staticUniques = staticUniquesByVersion[2]
      let result: Poe2PriceResult
      try {
        result = await fetchPoe2PricesFromProxy(league, fetchJson, categoryByType, staticUniques)
      } catch (proxyErr) {
        console.error('[FilterScalpel] EE2 proxy failed, falling back to ninja direct:', proxyErr)
        result = await fetchAndBuildPoe2PriceMap(league, fetchJson, categoryByType, staticUniques)
      }
      resetCache(league, now)
      priceMap = result.priceMap
      pricesByVariant = result.pricesByVariant
      uniqueBaseMapPoe2 = result.uniquesByBase
      saveCachedUniquesByBasePoe2(result.uniquesByBase)
      return
    }
    const resp = (await fetchJson(`${DENSE_URL}?league=${encodeURIComponent(league)}&language=en`)) as DenseResponse
    resetCache(league, now)
    processDenseResponse(resp)
    buildUniquesByBaseFromDense(resp)
  } catch (e) {
    console.error('[FilterScalpel] Failed to fetch prices:', e)
    // Don't update lastFetchTime on failure so the next call retries instead of being
    // short-circuited by the cache TTL check.
  }
}

/** Forget the last-fetch timestamp so the next refreshPrices() call bypasses the TTL. */
export function invalidatePriceCache(): void {
  lastFetchTime = 0
}

export function lookupPrice(itemName: string, baseType: string): PriceInfo | undefined {
  // Try exact name first (for uniques), then base type (for currency/fragments)
  return priceMap.get(itemName.toLowerCase()) ?? priceMap.get(baseType.toLowerCase())
}

/** Unique price lookup that disambiguates same-name / different-base
 *  uniques (e.g. Grand Spectrum Emerald vs Ruby). Tries the variant key
 *  `${name}|${baseType}` first, then the legacy name-only entry. Shared
 *  by both games: exact for PoE2 (EE2 `variant` == base type), and a
 *  strict no-regression improvement for PoE1 (name-only fallback). */
export function lookupUniquePriceForBase(name: string, baseType: string): PriceInfo | undefined {
  return pricesByVariant.get(`${name.toLowerCase()}|${baseType}`) ?? priceMap.get(name.toLowerCase())
}

/** Variant-aware price lookup. Tries the exact variant key first (e.g. "hatred|21 20c"
 *  hits the corrupt 21/20 entry), falls back to the legacy name-only lookup. The
 *  variant string comes from the shared `deriveItemVariant` helper so URL slug and
 *  price lookup always agree -- when we link a user to /skill-gems/hatred-21-20c,
 *  the price chip we show is the price ninja actually has for that page. */
export function lookupPriceForItem(item: NinjaItemRef): PriceInfo | undefined {
  const variant = deriveItemVariant(item)
  if (variant != null) {
    const exact = pricesByVariant.get(`${item.name.toLowerCase()}|${variant}`)
    if (exact) return exact
  }
  return lookupPrice(item.name, item.baseType)
}

/** Test hook: seed both maps without making network calls. The variant entry
 *  also writes into the legacy name-keyed map (last write wins) so name-only
 *  fallbacks behave the same as in production. */
export function _setPricesForTests(entries: Array<{ name: string; variant?: string; chaos: number }>): void {
  priceMap = new Map()
  pricesByVariant = new Map()
  for (const e of entries) {
    const info = { chaosValue: e.chaos, divineValue: undefined }
    priceMap.set(e.name.toLowerCase(), info)
    pricesByVariant.set(`${e.name.toLowerCase()}|${e.variant ?? ''}`, info)
  }
}

/** Look up a divination card price specifically (avoids name collisions with other item types) */
export function lookupDivCardPrice(cardName: string): PriceInfo | undefined {
  return divCardPriceMap.get(cardName.toLowerCase())
}

/** Gem names from the most recent poe.ninja SkillGem overview. Empty until the first
 *  successful refreshPrices() call. */
export function getGemNames(): Set<string> {
  return gemNames
}

/** Active baseType -> [unique names] map. Returns the PoE1 dense-augmented map
 *  in PoE1, or the dynamic (cache-backed) PoE2 map in PoE2. */
export function getUniquesByBase(): Record<string, string[]> {
  return getPoeVersion() === 2 ? uniqueBaseMapPoe2 : uniqueBaseMap
}

export function lookupBestUniquePrice(baseType: string): PriceInfo | undefined {
  const names = getUniquesByBase()[baseType]
  if (!names) return undefined
  let best: PriceInfo | undefined
  for (const name of names) {
    const info = lookupUniquePriceForBase(name, baseType)
    if (info && (!best || info.chaosValue > best.chaosValue)) {
      best = info
    }
  }
  return best
}
