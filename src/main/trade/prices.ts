import { net } from 'electron'
import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { PriceInfo } from '../../shared/types'
import { POE_NINJA_API } from '../../shared/endpoints'
import uniqueInfoData from '../../shared/data/items/unique-info.json'
const staticUniquesByBase = uniqueInfoData as Record<string, string[]>

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
  return staticUniquesByBase as Record<string, string[]>
}

function saveCachedUniquesByBase(data: Record<string, string[]>): void {
  try {
    writeFileSync(getCachePath(), JSON.stringify(data), 'utf-8')
  } catch {
    /* ignore */
  }
}

// Cache: league -> (name -> price)
let cachedLeague = ''
let priceMap = new Map<string, PriceInfo>()
let lastFetchTime = 0
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

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
          if (staticUniquesByBase[part as keyof typeof staticUniquesByBase]) {
            if (!dynamicMap[part]) dynamicMap[part] = new Set()
            dynamicMap[part].add(name)
            break
          }
        }
      }
    }
  }

  // Merge dynamic data into the base map (dynamic supplements static)
  const merged = { ...(staticUniquesByBase as Record<string, string[]>) }
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
    for (const line of overview.lines ?? []) {
      const name = line.name
      const chaos = line.chaos
      if (!name || !chaos || chaos <= 0) continue

      if (name === 'Divine Orb') divineRate = chaos

      const info = {
        chaosValue: chaos,
        divineValue: divineRate > 0 ? chaos / divineRate : undefined,
      }
      priceMap.set(name.toLowerCase(), info)
      if (isDivCards) divCardPriceMap.set(name.toLowerCase(), info)
    }
  }

  // Second pass to fill in divine values for items processed before Divine Orb was found
  if (divineRate > 0) {
    for (const [key, info] of priceMap) {
      if (info.divineValue == null) {
        priceMap.set(key, { ...info, divineValue: info.chaosValue / divineRate })
      }
    }
  }
}

export async function refreshPrices(league: string): Promise<void> {
  if (!league) return
  const now = Date.now()
  if (league === cachedLeague && now - lastFetchTime < CACHE_TTL) return

  cachedLeague = league
  priceMap = new Map()
  divCardPriceMap = new Map()
  lastFetchTime = now

  try {
    const resp = (await fetchJson(`${DENSE_URL}?league=${encodeURIComponent(league)}&language=en`)) as DenseResponse
    processDenseResponse(resp)
    buildUniquesByBaseFromDense(resp)
  } catch (e) {
    console.error('[FilterScalpel] Failed to fetch prices:', e)
  }
}

export function lookupPrice(itemName: string, baseType: string): PriceInfo | undefined {
  // Try exact name first (for uniques), then base type (for currency/fragments)
  return priceMap.get(itemName.toLowerCase()) ?? priceMap.get(baseType.toLowerCase())
}

/** Look up a divination card price specifically (avoids name collisions with other item types) */
export function lookupDivCardPrice(cardName: string): PriceInfo | undefined {
  return divCardPriceMap.get(cardName.toLowerCase())
}

/** Find the highest-priced unique item that uses a given base type */
export function getUniquesByBase(): Record<string, string[]> {
  return uniqueBaseMap
}

export function lookupBestUniquePrice(baseType: string): PriceInfo | undefined {
  const names = uniqueBaseMap[baseType]
  if (!names) return undefined
  let best: PriceInfo | undefined
  for (const name of names) {
    const info = priceMap.get(name.toLowerCase())
    if (info && (!best || info.chaosValue > best.chaosValue)) {
      best = info
    }
  }
  return best
}
