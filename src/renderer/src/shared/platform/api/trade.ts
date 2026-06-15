/**
 * Renderer API adapter for price check, trade search, and bulk exchange.
 *
 * Preparatory wrappers around window.api. Existing renderer code still calls the
 * preload bridge directly; migrate call sites incrementally when touching price
 * check or trade screens.
 */

import type { PoeItem } from '@shared/contracts/items'
import type { PriceInfo } from '@shared/contracts/prices'

// ── Price lookups ─────────────────────────────────────────────────────────────

export function lookupBaseType(
  baseType: string,
  itemClass: string,
  rarity?: string,
  uniqueName?: string,
  flags?: { zanaMemory?: boolean },
): Promise<void> {
  return window.api.lookupBaseType(baseType, itemClass, rarity, uniqueName, flags)
}

export function getUniquesForBase(baseType: string): Promise<string[]> {
  return window.api.getUniquesForBase(baseType)
}

export function getSearchableItems(): Promise<import('@shared/contracts/items').SearchableItem[]> {
  return window.api.getSearchableItems()
}

export function getDivCardTiers(): Promise<{
  tierStyles: Record<string, { border: string; bg: string; text: string }>
  cardTiers: Record<string, string>
  hiddenCards: Record<string, boolean>
}> {
  return window.api.getDivCardTiers()
}

export function batchLookupDivCardPrices(
  cardNames: string[],
  league: string,
): Promise<Record<string, { chaosValue: number; divineValue?: number } | null>> {
  return window.api.batchLookupDivCardPrices(cardNames, league)
}

export function batchLookupPrices(
  baseTypes: string[],
  league: string,
  uniqueTier?: boolean,
): Promise<Record<string, { chaosValue: number; divineValue?: number } | null>> {
  return window.api.batchLookupPrices(baseTypes, league, uniqueTier)
}

export function batchLookupRefPrices(
  refs: Array<{ name: string; baseType?: string }>,
  league: string,
): Promise<Record<string, { chaosValue: number; divineValue?: number } | null>> {
  return window.api.batchLookupRefPrices(refs, league)
}

export function sisterOpenPriceCheck(ref: {
  name: string
  baseType?: string
  category: 'base' | 'unique' | 'divination' | 'gem' | 'beast'
}): Promise<void> {
  return window.api.sisterOpenPriceCheck(ref)
}

export function refreshPrices(): Promise<void> {
  return window.api.refreshPrices()
}

// ── Trade search ──────────────────────────────────────────────────────────────

export function tradeSearch(
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
  statFilters: Array<{
    id: string
    text: string
    value: number | null
    min: number | null
    max: number | null
    enabled: boolean
    type: string
  }>,
  searchOptions?: { listedTime?: string; priceOption?: string; statusOption?: string },
): Promise<{
  total: number
  listings: Array<{
    id: string
    price: { amount: number; currency: string } | null
    account: string
    characterName?: string
    online: boolean
    instantBuyout: boolean
    icon?: string
    indexed?: string
    itemData?: { name?: string; baseType?: string; explicitMods?: string[]; implicitMods?: string[]; ilvl?: number }
  }>
  queryId: string
  remainingIds: string[]
  loginRequiredPseudoIds?: string[]
}> {
  return window.api.tradeSearch(item, statFilters, searchOptions)
}

export function bulkExchange(
  itemName: string,
  baseType: string,
  haveId?: string,
): Promise<{
  total: number
  listings: Array<{
    id: string
    account: string
    characterName?: string
    online: boolean
    stock: number
    pay: { amount: number; currency: string }
    get: { amount: number; currency: string }
    ratio: number
    whisper?: string
  }>
  queryId: string
}> {
  return window.api.bulkExchange(itemName, baseType, haveId)
}

export function checkBulkItem(
  itemName: string,
  baseType: string,
  itemClass: string,
  rarity?: string,
): Promise<boolean> {
  return window.api.checkBulkItem(itemName, baseType, itemClass, rarity)
}

export function fetchMoreListings(
  queryId: string,
  ids: string[],
): Promise<{
  listings: Array<{
    id: string
    price: { amount: number; currency: string } | null
    account: string
    characterName?: string
    online: boolean
    instantBuyout: boolean
    icon?: string
    indexed?: string
    itemData?: {
      name?: string
      baseType?: string
      rarity?: string
      explicitMods?: string[]
      implicitMods?: string[]
      ilvl?: number
      mapProperties?: Array<{ name: string; value: string }>
    }
  }>
  remainingIds: string[]
}> {
  return window.api.fetchMoreListings(queryId, ids)
}

export function visitHideout(queryId: string, listingId: string, league: string): Promise<void> {
  return window.api.visitHideout(queryId, listingId, league)
}

export function whisperSeller(queryId: string, listingId: string, league: string): Promise<void> {
  return window.api.whisperSeller(queryId, listingId, league)
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export function poeLogin(): Promise<void> {
  return window.api.poeLogin()
}

export function poeCheckAuth(): Promise<import('@shared/contracts/updates').AuthResult> {
  return window.api.poeCheckAuth()
}

export function poeLogout(): Promise<void> {
  return window.api.poeLogout()
}

// ── Events ────────────────────────────────────────────────────────────────────

export function onRateLimit(
  cb: (state: { tiers: Array<{ used: number; max: number; window: number; penalty: number }> }) => void,
): () => void {
  return window.api.onRateLimit(cb)
}

export function onTradePenalty(cb: (until: number) => void): () => void {
  return window.api.onTradePenalty(cb)
}

export function onPriceCheck(
  cb: (data: {
    item: PoeItem
    priceInfo?: PriceInfo
    statFilters: Array<{
      id: string
      text: string
      value: number | null
      min: number | null
      max: number | null
      enabled: boolean
      type: string
      learned?: boolean
    }>
    league: string
    chaosPerDivine?: number
    unidCandidates?: Array<{ name: string; chaosValue: number }>
    sessionId: number
    learnedDecisions: Record<string, boolean>
  }) => void,
): () => void {
  return window.api.onPriceCheck(cb)
}

export function onPriceCheckOpen(cb: () => void): () => void {
  return window.api.onPriceCheckOpen(cb)
}

export function onFilterHotkeyOpen(cb: () => void): () => void {
  return window.api.onFilterHotkeyOpen(cb)
}

export function openExternal(url: string): Promise<void> {
  return window.api.openExternal(url)
}
