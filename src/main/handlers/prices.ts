import { ipcMain } from 'electron'
import Store from 'electron-store'
import { getCurrentFilter, onFilterLoaded } from '../filter-state'
import { evaluateAndSend, preloadPriceCheck, runPriceCheck } from '../evaluation'
import { findMatchingBlocks } from '../filter/matcher'
import {
  refreshPrices,
  lookupPrice,
  lookupBestUniquePrice,
  lookupDivCardPrice,
  getUniquesByBase,
  getGemNames,
} from '../trade/prices'
import type { AppSettings, FilterBlock, FilterFile, PoeItem, SearchableItem } from '../../shared/types'
import { defaultPoeItem } from '../../shared/poe-item'
import uniqueInfoData from '../../shared/data/items/unique-info.json'
import itemClassesData from '../../shared/data/items/item-classes.json'
import divCardsData from '../../shared/data/economy/div-cards.json'
import { TRANSFIGURED_GEM_DISC } from '../../shared/data/trade/transfigured-gems'

/** Classes whose BaseTypes should surface in the item search combobox. */
const STACKABLE_CLASSES = new Set([
  'Currency',
  'Stackable Currency',
  'Divination Cards',
  'Essences',
  'Map Fragments',
  'Scarabs',
  'Incubators',
  'Delve Socketable Currency',
  'Delve Stackable Socketable Currency',
  'Expedition Logbook',
  'Heist Brooches',
  'Heist Cloaks',
  'Heist Tools',
  'Sentinel',
  'Misc Map Items',
])

/** Reverse map: base type -> item class, built once from static item-classes data. */
const BASE_TO_CLASS: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  const classes = itemClassesData as unknown as Record<string, { bases: string[] }>
  for (const [cls, { bases }] of Object.entries(classes)) {
    for (const b of bases) map[b] = cls
  }
  return map
})()

/** Div card name -> reward text, built once from static economy data. */
const DIV_CARD_REWARDS: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const card of divCardsData as Array<{ name: string; reward?: string }>) {
    if (card.reward) map[card.name] = card.reward
  }
  return map
})()

/** Build the gem list to surface in search: every gem poe.ninja knows about (pulled live
 *  from the SkillGem overview), plus every transfigured name from our local static data
 *  as a backstop (so unpriced transfigured variants don't drop out if poe.ninja omits
 *  them). Called on demand since poe.ninja data can be empty until the first fetch. */
function buildGemNames(): string[] {
  const set = new Set<string>()
  for (const n of getGemNames()) set.add(n)
  for (const transfigured of Object.keys(TRANSFIGURED_GEM_DISC)) set.add(transfigured)
  return [...set]
}

/** Support gems end in " Support"; everything else is a skill gem. Filters (NeverSink-
 *  based and most others) match these classes with `Class == "Skill Gems" "Support Gems"`
 *  -- note the exact-match operator and the `Skill Gems` name, NOT `Active Skill Gems`.
 *  Using the wrong string here drops every synthetic gem through to the filter's final
 *  catch-all block instead of the proper gem tier. */
function gemItemClass(name: string): string {
  return / Support$/.test(name) ? 'Support Gems' : 'Skill Gems'
}

/** Reverse-lookup a unique name to its base type using the live uniques-by-base map. */
function resolveUniqueBase(uniqueName: string, fallback = uniqueName): string {
  for (const [base, names] of Object.entries(getUniquesByBase())) {
    if (names.includes(uniqueName)) return base
  }
  return fallback
}

/** Scan the current filter for the first block whose BaseType condition contains
 *  `baseType` and return its Class condition value (empty string if not found). */
function findItemClassInFilter(baseType: string): string {
  const currentFilter = getCurrentFilter()
  if (!currentFilter) return ''
  for (const block of currentFilter.blocks) {
    const btCond = block.conditions.find((c) => c.type === 'BaseType' && c.values.includes(baseType))
    if (!btCond) continue
    const classCond = block.conditions.find((c) => c.type === 'Class')
    return classCond?.values[0] ?? ''
  }
  return ''
}

// Searchable-items cache: building the list walks every unique + gem + map against the
// full filter, which is hundreds of ms on a strict filter. We only recompute when the
// filter reference changes (new load / quick-update) or every 6 hours (so newly-priced
// gems from poe.ninja get picked up).
const SEARCHABLE_CACHE_TTL = 6 * 60 * 60 * 1000
let searchableCache: { filter: FilterFile; items: SearchableItem[]; computedAt: number } | null = null

/** Evaluate a synthetic item against the filter and return the block the user should
 *  see styling for: the first non-Continue match if any, else the last Continue-chain
 *  match (still shown as informational). */
function resolveActiveMatch(
  filter: FilterFile,
  item: PoeItem,
): ReturnType<typeof findMatchingBlocks>[number] | undefined {
  const matches = findMatchingBlocks(filter, item)
  return matches.find((m) => m.isFirstMatch) ?? matches[matches.length - 1]
}

/** Minimal subset of FilterBlock the renderer uses to reuse <LootLabel /> styling. */
function toLabel(block: FilterBlock): SearchableItem['block'] {
  return { visibility: block.visibility, actions: block.actions }
}

/** Build a searchable row by synthesizing a PoeItem, evaluating it against the filter,
 *  and attaching the matched block's label. Used by uniques / maps / gems so every
 *  category shares the same "synthesize -> find active match -> package" shape. */
export function buildSearchableRow(
  filter: FilterFile,
  base: Omit<SearchableItem, 'block'>,
  syntheticOverrides: Partial<PoeItem>,
): SearchableItem {
  const match = resolveActiveMatch(filter, defaultPoeItem(syntheticOverrides))
  return { ...base, block: match ? toLabel(match.block) : null }
}

/** All gem names that should surface in search for the given filter. */
function collectGems(filter: FilterFile): SearchableItem[] {
  return buildGemNames().map((name) =>
    buildSearchableRow(
      filter,
      { name, baseType: name, itemClass: gemItemClass(name), rarity: 'Gem' },
      {
        itemClass: gemItemClass(name),
        rarity: 'Gem',
        name,
        baseType: name,
        gemLevel: 20,
        quality: 20,
        transfigured: name in TRANSFIGURED_GEM_DISC,
      },
    ),
  )
}

/** Tier 1-16 regular maps, Nightmare Map, and Tier 1-16 Originator (Zana) map variants.
 *  POE1 no longer has zone-named maps so this is the entire trade universe for maps. */
function collectMaps(filter: FilterFile): SearchableItem[] {
  const rows: SearchableItem[] = []
  const mapRow = (
    name: string,
    tier: number,
    extra?: { iconKey?: string; flags?: { zanaMemory?: boolean } },
  ): SearchableItem =>
    buildSearchableRow(
      filter,
      { name, baseType: name, itemClass: 'Maps', rarity: 'Currency', ...extra },
      {
        itemClass: 'Maps',
        rarity: 'Normal',
        name,
        baseType: name,
        mapTier: tier,
        itemLevel: 67 + tier,
        zanaMemory: extra?.flags?.zanaMemory ?? false,
      },
    )
  for (let tier = 1; tier <= 16; tier++) rows.push(mapRow(`Map (Tier ${tier})`, tier))
  rows.push(mapRow('Nightmare Map', 16))
  for (let tier = 1; tier <= 16; tier++) {
    rows.push(
      mapRow(`Map (Tier ${tier})`, tier, {
        iconKey: `Zana Map (Tier ${tier})`,
        flags: { zanaMemory: true },
      }),
    )
  }
  return rows
}

/** Uniques from `unique-info.json`, evaluated against the filter for LootLabel styling. */
function collectUniques(filter: FilterFile): SearchableItem[] {
  const rows: SearchableItem[] = []
  for (const [baseType, names] of Object.entries(uniqueInfoData as Record<string, string[]>)) {
    const itemClass = BASE_TO_CLASS[baseType] ?? ''
    for (const name of names) {
      rows.push(
        buildSearchableRow(
          filter,
          { name, baseType, itemClass, rarity: 'Unique' },
          { itemClass, rarity: 'Unique', name, baseType, itemLevel: 84 },
        ),
      )
    }
  }
  return rows
}

/** Stackables (currency, div cards, fragments, scarabs, etc.) harvested from the filter
 *  itself -- these are the base types the user's filter actually cares about. */
function collectStackables(filter: FilterFile): SearchableItem[] {
  const seenBase = new Map<string, { itemClass: string; block: FilterBlock }>()
  for (const block of filter.blocks) {
    const classCond = block.conditions.find((c) => c.type === 'Class')
    const itemClass = classCond?.values[0] ?? ''
    if (itemClass && !STACKABLE_CLASSES.has(itemClass)) continue
    for (const cond of block.conditions) {
      if (cond.type !== 'BaseType') continue
      for (const v of cond.values) {
        if (!seenBase.has(v)) seenBase.set(v, { itemClass, block })
      }
    }
  }
  return [...seenBase.entries()].map(([baseType, { itemClass, block }]) => ({
    name: baseType,
    baseType,
    itemClass,
    rarity: 'Currency',
    block: toLabel(block),
    reward: itemClass === 'Divination Cards' ? DIV_CARD_REWARDS[baseType] : undefined,
  }))
}

export async function buildSearchableItems(store: Store<AppSettings>, filter: FilterFile): Promise<SearchableItem[]> {
  await refreshPrices(store.get('league'))
  return [...collectStackables(filter), ...collectUniques(filter), ...collectMaps(filter), ...collectGems(filter)]
}

/** PoeItem overrides for a click from the item search. Gems get a 20/20 baseline plus
 *  the transfigured flag; maps parse their tier from the base type and force rarity
 *  back to 'Normal' (the search row uses 'Currency' for sort/styling, but a
 *  Currency-rarity map would fail filter blocks that gate on `Rarity Normal Magic Rare`). */
export function clickSyntheticOverrides(
  baseType: string,
  itemClass: string,
  rarity: PoeItem['rarity'],
  flags?: { zanaMemory?: boolean },
): Partial<PoeItem> {
  if (itemClass === 'Maps') {
    const tierMatch = /\(Tier (\d+)\)/.exec(baseType)
    return {
      itemClass,
      rarity: 'Normal',
      baseType,
      mapTier: tierMatch ? parseInt(tierMatch[1]) : 16,
      itemLevel: 83,
      zanaMemory: flags?.zanaMemory ?? false,
    }
  }
  if (rarity === 'Gem') {
    return {
      itemClass,
      rarity,
      baseType,
      gemLevel: 20,
      quality: 20,
      transfigured: baseType in TRANSFIGURED_GEM_DISC,
    }
  }
  return { itemClass, rarity, baseType }
}

/** Test-only reset for the module-level cache so test cases can assert miss-vs-hit
 *  behavior in isolation. Not exported from the module's public surface. */
export function __resetSearchableCache(): void {
  searchableCache = null
}

/** Populate the searchable-items cache for the current filter. Safe to call repeatedly
 *  -- returns the cached payload if the filter hasn't changed and the 6-hour TTL isn't
 *  up yet. Called proactively at startup and on a 6-hour interval so the no-item view's
 *  first render doesn't pay the walk-every-item cost on the main process. */
export async function primeSearchableItemsCache(store: Store<AppSettings>): Promise<void> {
  const filter = getCurrentFilter()
  if (!filter) return
  if (
    searchableCache &&
    searchableCache.filter === filter &&
    Date.now() - searchableCache.computedAt < SEARCHABLE_CACHE_TTL
  ) {
    return
  }
  const items = await buildSearchableItems(store, filter)
  searchableCache = { filter, items, computedAt: Date.now() }
}

export function register(store: Store<AppSettings>): void {
  ipcMain.handle(
    'lookup-base-type',
    async (
      _event,
      baseType: string,
      itemClass: string,
      rarity?: string,
      uniqueName?: string,
      flags?: { zanaMemory?: boolean },
    ) => {
      const currentFilter = getCurrentFilter()
      if (!currentFilter) return

      // If base type or class is missing for a unique, try reverse lookup from uniques-by-base
      // and search the filter for a block containing that base type
      if (currentFilter && uniqueName && (!itemClass || !baseType || baseType === uniqueName)) {
        const foundBase = resolveUniqueBase(uniqueName, baseType)
        if (foundBase && foundBase !== uniqueName) baseType = foundBase
        if (!itemClass) itemClass = findItemClassInFilter(baseType)
      }

      const resolvedRarity = (rarity as PoeItem['rarity']) || 'Normal'
      const synthetic = defaultPoeItem({
        ...clickSyntheticOverrides(baseType, itemClass, resolvedRarity, flags),
        name: uniqueName || baseType,
      })
      evaluateAndSend(synthetic)
      // Preload the price check too so switching to the Price tab lands on populated
      // results, matching the clipboard-hotkey behavior.
      await preloadPriceCheck(synthetic, store)
    },
  )

  ipcMain.handle(
    'batch-lookup-prices',
    async (
      _event,
      baseTypes: string[],
      league: string,
      uniqueTier?: boolean,
    ): Promise<Record<string, { chaosValue: number; divineValue?: number } | null>> => {
      await refreshPrices(league)
      const result: Record<string, { chaosValue: number; divineValue?: number } | null> = {}
      for (const bt of baseTypes) {
        result[bt] = (uniqueTier ? lookupBestUniquePrice(bt) : undefined) ?? lookupPrice(bt, bt) ?? null
      }
      return result
    },
  )

  ipcMain.handle(
    'batch-lookup-ref-prices',
    async (
      _event,
      refs: Array<{ name: string; baseType?: string }>,
      league: string,
    ): Promise<Record<string, { chaosValue: number; divineValue?: number } | null>> => {
      await refreshPrices(league)
      const result: Record<string, { chaosValue: number; divineValue?: number } | null> = {}
      for (const r of refs) {
        result[r.name] = lookupPrice(r.name, r.baseType ?? r.name) ?? null
      }
      return result
    },
  )

  ipcMain.handle(
    'sister-open-price-check',
    async (
      _event,
      ref: { name: string; baseType?: string; category: 'base' | 'unique' | 'divination' | 'gem' | 'beast' },
    ): Promise<void> => {
      const isUnique = ref.category === 'unique' || ref.category === 'beast'
      // For uniques, resolve the base type if the ref didn't carry one. Non-uniques use
      // name == baseType (currency, fragments, div cards, gems).
      const baseType = isUnique && !ref.baseType ? resolveUniqueBase(ref.name) : (ref.baseType ?? ref.name)
      const itemClass = findItemClassInFilter(baseType)
      const rarity: PoeItem['rarity'] = isUnique ? 'Unique' : ref.category === 'gem' ? 'Gem' : 'Normal'
      // Gems default to 20/20 (the standard trade baseline). Item-level is nulled for all
      // paths so the stat-matcher omits the ilvl chip (we don't know the actual ilvl here).
      const gemDefaults =
        rarity === 'Gem' ? { gemLevel: 20, quality: 20, transfigured: baseType in TRANSFIGURED_GEM_DISC } : {}
      const synthetic = defaultPoeItem({
        itemClass,
        rarity,
        name: isUnique ? ref.name : baseType,
        baseType,
        itemLevel: 0,
        ...gemDefaults,
      })
      await runPriceCheck(synthetic, store)
    },
  )

  ipcMain.handle(
    'batch-lookup-div-card-prices',
    async (
      _event,
      cardNames: string[],
      league: string,
    ): Promise<Record<string, { chaosValue: number; divineValue?: number } | null>> => {
      await refreshPrices(league)
      const result: Record<string, { chaosValue: number; divineValue?: number } | null> = {}
      for (const name of cardNames) {
        result[name] = lookupDivCardPrice(name) ?? null
      }
      return result
    },
  )

  ipcMain.handle('get-searchable-items', async (): Promise<SearchableItem[]> => {
    const filter = getCurrentFilter()
    if (!filter) return []
    if (
      !searchableCache ||
      searchableCache.filter !== filter ||
      Date.now() - searchableCache.computedAt >= SEARCHABLE_CACHE_TTL
    ) {
      const items = await buildSearchableItems(store, filter)
      searchableCache = { filter, items, computedAt: Date.now() }
    }
    return searchableCache.items
  })

  // Prime the cache when the filter changes (initial load, user swap, edit reload) and
  // every 6 hours thereafter. Debounce so rapid reloads from tier-move / block-edit
  // flows coalesce into one rebuild instead of blocking the main process on every save,
  // and so the rebuild waits until the current IPC batch is done processing.
  let primeTimer: ReturnType<typeof setTimeout> | null = null
  const prime = (): void => {
    primeSearchableItemsCache(store).catch((e) => console.error('[searchable-items] prime failed:', e))
  }
  const schedulePrime = (): void => {
    if (primeTimer) clearTimeout(primeTimer)
    primeTimer = setTimeout(() => {
      primeTimer = null
      prime()
    }, 500)
  }
  onFilterLoaded(schedulePrime)
  setInterval(prime, 6 * 60 * 60 * 1000)

  ipcMain.handle(
    'get-div-card-tiers',
    (): {
      tierStyles: Record<string, { border: string; bg: string; text: string }>
      cardTiers: Record<string, string>
      hiddenCards: Record<string, boolean>
    } => {
      const currentFilter = getCurrentFilter()
      if (!currentFilter) return { tierStyles: {}, cardTiers: {}, hiddenCards: {} }
      const tierStyles: Record<string, { border: string; bg: string; text: string }> = {}
      const cardTiers: Record<string, string> = {}
      const hiddenCards: Record<string, boolean> = {}
      for (const block of currentFilter.blocks) {
        if (!block.tierTag || block.tierTag.typePath !== 'divination') continue
        const tier = block.tierTag.tier
        const isHidden = block.visibility === 'Hide'
        const toRgba = (a: { values: string[] }): string => {
          const [r, g, b, alpha] = a.values.map(Number)
          return `rgba(${r ?? 0},${g ?? 0},${b ?? 0},${(alpha ?? 255) / 255})`
        }
        const border = block.actions.find((a) => a.type === 'SetBorderColor')
        const bg = block.actions.find((a) => a.type === 'SetBackgroundColor')
        const text = block.actions.find((a) => a.type === 'SetTextColor')
        tierStyles[tier] = {
          border: border ? toRgba(border) : 'transparent',
          bg: bg ? toRgba(bg) : 'transparent',
          text: text ? toRgba(text) : '#fff',
        }
        for (const cond of block.conditions) {
          if (cond.type === 'BaseType') {
            for (const v of cond.values) {
              cardTiers[v] = tier
              if (isHidden) hiddenCards[v] = true
            }
          }
        }
      }
      return { tierStyles, cardTiers, hiddenCards }
    },
  )
}
