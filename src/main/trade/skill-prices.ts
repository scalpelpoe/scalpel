import type { PriceEntry } from '@shared/types'
import { getPoeVersion } from '../game-state'
import { lookupPrice, refreshPrices } from './prices'
import { searchTrade, type StatFilter } from './trade'

export interface SkillPrice extends PriceEntry {
  sampleSize: number
  updatedAt: number
}

const cache = new Map<string, { expires: number; result: SkillPrice | null }>()
const pending = new Map<string, Promise<SkillPrice | null>>()
const TTL = 5 * 60_000

/** A low-end asking-price estimate, not a completed-sale price. Uses the same
 * authenticated transport and rate limiter as manual price checks. */
export async function getSkillPrice(league: string, name: string, level: number): Promise<SkillPrice | null> {
  if (
    typeof name !== 'string' ||
    !/^[a-z][a-z '\-]{2,79}$/i.test(name) ||
    !Number.isInteger(level) ||
    level < 1 ||
    level > 40
  ) {
    throw new Error('Invalid skill name or level')
  }
  if (getPoeVersion() !== 2) return null
  name = name.trim()
  const key = JSON.stringify([league, name.toLowerCase(), level])
  const cached = cache.get(key)
  if (cached && cached.expires > Date.now()) return cached.result
  const existing = pending.get(key)
  if (existing) return existing
  if (pending.size >= 20) throw new Error('Too many pending skill price lookups')
  const request = (async (): Promise<SkillPrice | null> => {
    await refreshPrices(league)
    if (getPoeVersion() !== 2) return null
    const divine = lookupPrice('Divine Orb', 'Divine Orb')?.chaosValue
    const numeric = (id: string, value: number): StatFilter => ({
      id,
      text: id,
      value,
      min: value,
      max: value,
      enabled: true,
      type: 'gem',
    })
    const result = await searchTrade(
      league,
      { name, baseType: name, itemClass: 'Skill Gems', rarity: 'Gem' },
      [
        numeric('misc.gem_level', level),
        numeric('misc.quality', 0),
        { ...numeric('misc.corrupted', 0), chipState: 'no' },
      ],
      { tradeStatus: 'available', tradePriceOption: 'exalted_divine', collapseListings: true },
    )
    // A game switch during the request must not use PoE1 currency rates.
    if (getPoeVersion() !== 2) return null
    const values = result.listings
      .flatMap((listing) => {
        const price = listing.price
        if (!price || !Number.isFinite(price.amount) || price.amount <= 0) return []
        if (
          listing.itemData?.gemLevel !== level ||
          listing.itemData?.corrupted ||
          (listing.itemData?.quality ?? 0) !== 0
        )
          return []
        const base = listing.itemData?.baseType
        if (base && base.toLowerCase() !== name.toLowerCase()) return []
        const rate = price.currency === 'exalted' ? 1 : price.currency === 'divine' ? divine : undefined
        return rate && Number.isFinite(rate) && rate > 0 ? [price.amount * rate] : []
      })
      .sort((a, b) => a - b)
      .slice(0, 5)
    // Median of up to five lowest offers reduces sensitivity to a single bait listing.
    const middle = Math.floor(values.length / 2)
    const value = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2
    const quote: SkillPrice | null = values.length
      ? {
          name: `${name} (Level ${level})`,
          category: 'skill-gems',
          chaosValue: value,
          ...(divine && divine > 0 ? { divineValue: value / divine } : {}),
          sampleSize: values.length,
          updatedAt: Date.now(),
        }
      : null
    if (cache.size >= 200) cache.delete(cache.keys().next().value!)
    cache.set(key, { expires: Date.now() + TTL, result: quote })
    return quote
  })()
  pending.set(key, request)
  try {
    return await request
  } finally {
    pending.delete(key)
  }
}
