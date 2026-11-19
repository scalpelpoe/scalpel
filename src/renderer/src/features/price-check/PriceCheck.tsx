import { useState, useEffect, useRef, useMemo, Fragment } from 'react'
import { createPortal } from 'react-dom'
import type { PriceCheckProps, StatFilter, Listing, BulkListing } from './types'
import { searchSignature } from './search-signature'
import { getTradeUrls } from '@shared/endpoints'
import { getGameFeatures } from '@shared/game-features'
import type { ExchangeDetails } from '@shared/contracts/exchange'
import { isVendorExchangeItem } from '@shared/data/trade/bulk-exchange-eligibility'
import {
  RARITY_COLORS,
  INFLUENCE_ICONS,
  iconMap,
  getItemIcon,
  formatPrice,
  getItemSize,
  getChipColor,
  TERNARY_CHIP_IDS,
  MINMAX_CHIP_IDS,
} from './constants'
import { FilterChip } from '../../components/primitives/FilterChip'
import { FaustusBanner } from './FaustusBanner'
import { AngeBanner } from './AngeBanner'
import { ExchangePanel } from './ExchangePanel'
import { TradeTimeoutBanner } from './TradeTimeoutBanner'
import { ItemHeader } from './ItemHeader'
import { getDustInfo } from '../../shared/dust'
import { CurrencyIcon } from '../../shared/CurrencyIcon'
import { StatFilterRow } from './StatFilterRow'
import { TradeListings } from '../../shared/trade-results/TradeListings'
import { BulkListings } from './BulkListings'
import { ListingRowsSkeleton } from './PriceCheckSkeleton'
import { RateLimitBar } from '../../components/primitives/RateLimitBar'
import { DismissibleTip } from '../../shared/DismissibleTip'
import {
  BASE_DEFAULT_ITEM_CLASSES,
  CRAFTING_READY_EXCLUDED_CLASSES,
  applyAllModsToFilters,
  applyBaseModeToFilters,
  applyCraftingReadyToFilters,
  isCraftingReadyState,
  isPerfectUniqueRoll,
  resolveDefaultPreset,
  shouldIncludeImplicitsInBase,
} from './base-mode'
import { applyLearnedDecisions } from './learned-decisions'
import { pickMercenarySupportsToEnable } from './mercenary-tighten'
import { toggleFilterAt } from './toggle-filter'
import { shouldAutoBulkSearch, shouldShowExchangePanel } from './exchange-view'
import type { ListedTime, PriceOption, ResultsView, StatusOption } from './search-settings'
import {
  LISTED_TIME_OPTIONS,
  getPriceOptions,
  defaultPriceOption,
  normalizePriceOption,
  primaryCurrencySwap,
  STATUS_OPTIONS,
} from './search-settings'
import { SearchSettingDropdown } from './SearchSettingDropdown'
import { zebraRowBg, stripIpcErrorWrapper } from '../../shared/utils'
import { useAuth } from '../../shared/use-auth'
import { ContextMenu, type ContextMenuEntry } from '../../components/primitives/ContextMenu'
import { learnedMenuEntries, type SessionPref } from './learned-preference-menu'

export function PriceCheck({
  item,
  priceInfo,
  statFilters: initialFilters,
  league,
  poeVersion,
  chaosPerDivine,
  divineGraph,
  unidCandidates,
  sessionId,
  learnedDecisions,
  onClose: _onClose,
  onOpenWiki,
  pluginButtons,
  onOpenPoeDb,
  onOpenNinja,
}: PriceCheckProps): JSX.Element {
  const tradeUrls = getTradeUrls(poeVersion)
  const features = getGameFeatures(poeVersion)
  const baselineKey = poeVersion === 2 ? 'exalted' : 'chaos'
  const isDivCard = item.itemClass === 'Divination Cards'
  const [selectedUnique, setSelectedUnique] = useState<string | null>(null)
  const color = selectedUnique ? RARITY_COLORS['Unique'] : (RARITY_COLORS[item.rarity] ?? '#c8c8c8')
  const heroIcon = selectedUnique ? (iconMap[selectedUnique] ?? getItemIcon(item)) : getItemIcon(item)
  const heroName = selectedUnique ?? item.name
  const { auth, loggedIn, login } = useAuth()
  // Ids of pseudos the last search dropped because the user is not logged in
  // (Weighted Sum, e.g. added elemental damage on PoE2). Each drives an in-row
  // login tip under the matching filter.
  const [loginRequiredPseudoIds, setLoginRequiredPseudoIds] = useState<string[]>([])
  // Ids of Mercenary Warrant support rows the last search had to send unscoped:
  // pinning a support to its skill needs a `mercenary` stat group, and an
  // anonymous query only fits one. They still filtered, just item-wide.
  const [loginRequiredMercenaryIds, setLoginRequiredMercenaryIds] = useState<string[]>([])
  // Rate-limit state comes from main already merged across all policies we've seen. The
  // RateLimitBar handles decay + blending; we just store the latest snapshot here.
  const [rateLimitTiers, setRateLimitTiers] = useState<
    Array<{ used: number; max: number; window: number; penalty: number; lastUpdate?: number }>
  >([])
  /** Absolute epoch ms when the current trade-API penalty ends, or null when
   *  we're not in a penalty window. Broadcast from main on each 429 with a
   *  retry-after long enough to warrant surfacing (see trade.ts). Lives at
   *  this level so the Greg banner can replace the search-results area. */
  const [penaltyUntil, setPenaltyUntil] = useState<number | null>(null)

  useEffect(() => {
    const unsubRate = window.api.onRateLimit((state) => setRateLimitTiers(state.tiers))
    const unsubPenalty = window.api.onTradePenalty((until) => setPenaltyUntil(until))
    return () => {
      unsubRate()
      unsubPenalty()
    }
  }, [])

  const [filters, setFilters] = useState<StatFilter[]>(initialFilters)
  // Right-click learned-preference menu on a stat row: viewport coords + the
  // ORIGINAL index into `filters` of the row that was clicked.
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; scale: number; filterIdx: number } | null>(null)
  // Mid-session pins/unpins; shadows the static learnedDecisions payload so
  // menu entries stay correct when the menu is re-opened before a new check.
  const [sessionPrefs, setSessionPrefs] = useState<Record<string, SessionPref>>({})

  const setLearnedPreference = (filterIdx: number): void => {
    const f = filters[filterIdx]
    if (!f) return
    window.api.setLearnedPreference(sessionId, f.id, f.enabled)
    setSessionPrefs((p) => ({ ...p, [f.id]: 'set' }))
    setFilters((fs) => fs.map((x, xi) => (xi === filterIdx ? { ...x, learned: true } : x)))
  }

  const unsetLearnedPreference = (filterIdx: number): void => {
    const f = filters[filterIdx]
    if (!f) return
    window.api.unsetLearnedPreference(sessionId, f.id)
    setSessionPrefs((p) => ({ ...p, [f.id]: 'unset' }))
    setFilters((fs) => fs.map((x, xi) => (xi === filterIdx ? { ...x, learned: false } : x)))
  }
  const filtersRef = useRef(filters)
  const sessionIdRef = useRef(sessionId)
  // Set true once the mount effect has applied base mode + learned defaults. The capture
  // below must not fire before this: React StrictMode (dev) simulates an unmount before the
  // async default-setup runs, and a fast overlay close can race it - either would record the
  // raw matchItemMods state instead of the settled defaults, poisoning the learning data.
  const defaultsApplied = useRef(false)
  useEffect(() => {
    filtersRef.current = filters
  }, [filters])
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])
  useEffect(
    () => () => {
      if (!defaultsApplied.current) return
      window.api.recordPrefObservation(
        sessionIdRef.current,
        filtersRef.current.map((f) => ({ id: f.id, type: f.type, enabled: f.enabled })),
      )
    },
    [],
  )
  const [filtersCollapsed, setFiltersCollapsed] = useState(false)
  const [collapsedVisibleIndices, setCollapsedVisibleIndices] = useState<Set<number> | null>(null)
  const [expandedListing, setExpandedListing] = useState<string | null>(null)
  const [actionStatus, setActionStatus] = useState<Record<string, 'pending' | 'success' | 'failed'>>({})
  const [listings, setListings] = useState<Listing[]>([])
  const priceChipMinWidth = useMemo(() => {
    const maxDigits = listings.reduce((max, l) => Math.max(max, l.price ? String(l.price.amount).length : 0), 0)
    return 38 + maxDigits * 9
  }, [listings])
  const [total, setTotal] = useState<number | null>(null)
  const [queryId, setQueryId] = useState<string | null>(null)
  // Mirror of queryId for stale-response detection in loadMore. Closures capture
  // queryId at fetch-start; we compare against the ref at response-landing time
  // so an in-flight load-more doesn't pollute the next search's listings if the
  // user re-searches mid-flight. Assigned synchronously at each setQueryId call
  // site rather than via a follow-on useEffect, so a re-search registers in the
  // ref before any in-flight loadMore resumes (a useEffect would commit one
  // render late and the bug would still slip through on tight races).
  const queryIdRef = useRef<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [remainingIds, setRemainingIds] = useState<string[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  // Auto-prefetch listings 11-20 immediately after a fresh search lands. The
  // trade API's /fetch bucket resets fast enough that one extra call back-to-
  // back is well within bounds (see src/main/trade/rate-limiter.ts). Doubles
  // the default-visible listings without the user having to click "Load more".
  // Guarded by `autoPrefetchedFor` so we only fire once per queryId, not on
  // every change to `remainingIds` (e.g. after a manual Load more click).
  const autoPrefetchedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!queryId || remainingIds.length === 0) return
    if (autoPrefetchedFor.current === queryId) return
    // Defer if a previous loadMore is still in flight (e.g. a stale auto-prefetch
    // from a prior search). Don't claim the queryId in the ref yet - the effect
    // will re-fire once `loadingMore` clears, and we'll retry then.
    if (loadingMore) return
    autoPrefetchedFor.current = queryId
    void loadMore()
  }, [queryId, remainingIds.length, loadingMore])
  const autoSearched = useRef(false)
  const lastSearchedSig = useRef<string>('')
  // Mercenary Warrants get exactly one automatic narrowing pass per item.
  const mercenaryTightened = useRef(false)
  const [isBulk, setIsBulk] = useState<boolean | null>(null)
  const [bulkListings, setBulkListings] = useState<BulkListing[]>([])
  // undefined = request in flight, null = no exchange data for this item.
  const [exchange, setExchange] = useState<ExchangeDetails | null | undefined>(undefined)
  // Bulk listings are opt-in for exchange items: the request only fires on the
  // first expand, so a normal currency check costs zero trade-API budget.
  const [listingsOpen, setListingsOpen] = useState(false)

  // Per-search settings overrides (exposed via the Settings chip). Defaults come from the
  // user's global settings once they load; left blank for "listed" ("any time").
  const [showSettings, setShowSettings] = useState(false)
  const [listedTime, setListedTime] = useState<ListedTime>('')
  const [priceOption, setPriceOption] = useState<PriceOption>(() => defaultPriceOption(poeVersion))
  const [statusOption, setStatusOption] = useState<StatusOption>('available')
  const [resultsView, setResultsView] = useState<ResultsView>('default')

  const includeImplicits = shouldIncludeImplicitsInBase(item.rarity, item.corrupted, item.vestigial)
  const applyBaseMode = (): void => {
    setFilters((prev) => applyBaseModeToFilters(prev, item.rarity, item.corrupted, { vestigial: item.vestigial }))
  }

  // Gear-only: maps/tablets/relics/flasks are isEquipment but their explicit "affixes" are
  // map/monster/sanctum mods, not craftable gear prefixes/suffixes. Mirrored and corrupted
  // items are excluded too -- they can't be crafted on, and the preset chip is hidden for
  // them, so applying it would leave no way to toggle off.
  const craftingReadyEligible =
    poeVersion === 2 &&
    (item.rarity === 'Normal' || item.rarity === 'Magic') &&
    !item.mirrored &&
    !item.corrupted &&
    !CRAFTING_READY_EXCLUDED_CLASSES.has(item.itemClass)
  const applyCraftingReady = (): void => {
    setFilters((prev) => applyCraftingReadyToFilters(prev, item.rarity, item.corrupted))
  }

  // Check if this is a bulk exchange item on mount
  useEffect(() => {
    window.api.checkBulkItem(item.name, item.baseType, item.itemClass, item.rarity, item.zanaMemory).then(setIsBulk)
  }, [item.name, item.baseType, item.itemClass, item.zanaMemory])

  // Currency Exchange details. Only worth asking for items the vendor actually
  // carries -- isVendorExchangeItem is the cheap local gate in front of the
  // network call. Anything else resolves straight to null so the auto-search
  // gate isn't left waiting on a request we never made.
  useEffect(() => {
    if (!isVendorExchangeItem(poeVersion, item.itemClass, item.baseType, item.rarity)) {
      setExchange(null)
      return
    }
    let cancelled = false
    setExchange(undefined)
    window.api
      .exchangeDetails(item.baseType)
      .then((d) => {
        if (!cancelled) setExchange(d)
      })
      .catch(() => {
        if (!cancelled) setExchange(null)
      })
    return () => {
      cancelled = true
    }
  }, [item.baseType, item.itemClass, item.rarity, poeVersion])

  // Opening preset (see resolveDefaultPreset): PoE2 Crafting Ready wins where eligible,
  // then BASE_DEFAULT_ITEM_CLASSES force Base, then the "Affixes prechecked" setting --
  // 'default' Bases uniques only, 'base' Bases everything, 'all' ticks every affix.
  const baseModeApplied = useRef(false)
  const baseModeExpandedIndices = useRef<Set<number> | null>(null)
  const keepUncheckedVisible = useRef(false)
  const neverAutoSearch = useRef(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  useEffect(() => {
    if (baseModeApplied.current) return
    window.api.getSettings().then((s) => {
      if (baseModeApplied.current) return
      keepUncheckedVisible.current = !!s.tradeKeepUncheckedVisible
      neverAutoSearch.current = !!s.tradeNeverAutoSearch
      // Seed the per-search dropdowns from the user's global preferences --
      // except for primary-currency items, where pricing in the same currency
      // is meaningless. Override to the OTHER primary currency so the user
      // sees a real exchange rate (PoE1: chaos<->divine, PoE2: exalted<->divine).
      const crossCurrency = primaryCurrencySwap(item.name, poeVersion)
      if (crossCurrency) setPriceOption(crossCurrency)
      // normalize: the two games' currency lists barely overlap, so a value
      // carried over from the other game (or a retired catalog entry) has to
      // fall back rather than silently ship a dead option id to the API.
      else if (s.activeProfile?.tradePriceOption)
        setPriceOption(normalizePriceOption(s.activeProfile.tradePriceOption, poeVersion))
      if (s.tradeStatus) setStatusOption(s.tradeStatus as StatusOption)
      if (s.tradeDefaultListedTime !== undefined) setListedTime(s.tradeDefaultListedTime as ListedTime)
      if (s.tradeResultsView) setResultsView(s.tradeResultsView)
      setSettingsLoaded(true)
      // Crafting Ready wins for eligible PoE2 white/magic items (it is a superset of
      // Base that keeps the affixes on). Gated by the global setting (default on).
      const craftingReadyDefault = craftingReadyEligible && (s.tradePoe2CraftingReadyDefault ?? true)
      const { preset, keepRowsVisible } = resolveDefaultPreset({
        mode: s.tradeAffixesPrechecked ?? 'default',
        craftingReadyDefault,
        isClassDefault: BASE_DEFAULT_ITEM_CLASSES.has(item.itemClass),
        isUnique: item.rarity === 'Unique',
      })
      if (keepRowsVisible) {
        // Keep rows visible that are enabled pre-preset OR that learning will enable.
        baseModeExpandedIndices.current = new Set(
          filters.map((f, i) => (f.enabled || learnedDecisions?.[f.id] === true ? i : -1)).filter((i) => i >= 0),
        )
      }
      // Learning is the final layer: apply it on top of the (optionally preset) defaults.
      setFilters((prev) => {
        let seeded = prev
        if (preset === 'crafting-ready') seeded = applyCraftingReadyToFilters(prev, item.rarity, item.corrupted)
        else if (preset === 'base')
          seeded = applyBaseModeToFilters(prev, item.rarity, item.corrupted, { vestigial: item.vestigial })
        else if (preset === 'all')
          seeded = applyAllModsToFilters(prev, item.rarity, item.corrupted, { vestigial: item.vestigial })
        return applyLearnedDecisions(seeded, learnedDecisions)
      })
      baseModeApplied.current = true
      defaultsApplied.current = true
    })
  }, [])

  const searchName = selectedUnique ?? item.name

  const currentSig = useMemo(
    () => searchSignature(filters, { listedTime, priceOption, statusOption }),
    [filters, listedTime, priceOption, statusOption],
  )
  // Only dirty after a search has run, not while one is in progress, and never for bulk.
  const searchDirty = searched && !searching && !isBulk && currentSig !== lastSearchedSig.current
  // The Currency Exchange dashboard is up and has taken over the results area.
  const showExchangePanel = shouldShowExchangePanel({ isBulk, details: exchange })

  const doBulkSearch = async (): Promise<void> => {
    setSearching(true)
    setError(null)
    setPenaltyUntil(null)
    setSearched(true)
    try {
      // PriceInfo.chaosValue keeps its PoE1 name but semantically means
      // "baseline currency count" -- chaos in PoE1, exalted in PoE2 -- so the
      // currency we offer to pay with follows the active game's baseline. For
      // primary-currency items we override to the OTHER primary so we're not
      // pricing divines in divines (the rate would always be 1:1).
      const swap = primaryCurrencySwap(item.name, poeVersion)
      const payWith =
        swap ??
        (priceInfo?.divineValue != null && priceInfo.divineValue >= 1 ? 'divine' : features.bulkBaselineCurrency)
      const result = await window.api.bulkExchange(item.name, item.baseType, payWith, item.zanaMemory)
      setBulkListings(result.listings)
      setTotal(result.total)
      setQueryId(result.queryId)
      queryIdRef.current = result.queryId
    } catch (e) {
      setError(stripIpcErrorWrapper(e instanceof Error ? e.message : 'Search failed'))
    }
    setSearching(false)
  }

  // `overrideFilters` is the tightening pass re-searching with rows it has just
  // switched on: setFilters won't have landed by the time we need them, so the
  // array travels by argument rather than through state.
  const doSearch = async (overrideFilters?: StatFilter[]): Promise<void> => {
    const active = overrideFilters ?? filters
    setSearching(true)
    setError(null)
    setPenaltyUntil(null)
    setLoginRequiredPseudoIds([])
    // With "don't hide unchecked" on, still collapse on the first auto-search, then skip
    // re-collapse on subsequent manual searches. If "never auto-search" is also on, there
    // is no auto-search -- the user is actively unchecking from the start, so skip even the
    // first manual search.
    const skipCollapse = keepUncheckedVisible.current && (searched || neverAutoSearch.current)
    setSearched(true)
    if (!skipCollapse) {
      setFiltersCollapsed(true)
      // Snapshot which filters are currently enabled -- these stay visible when collapsed.
      // Also keep rows that were originally on before auto-Base disabled them, so the user
      // can still see the "turned off" rows above the fold rather than hidden behind "more filters".
      const enabledIndices = new Set(active.map((f, i) => (f.enabled ? i : -1)).filter((i) => i >= 0))
      if (baseModeExpandedIndices.current) {
        for (const i of baseModeExpandedIndices.current) enabledIndices.add(i)
      }
      // Rune rows stay above the fold even when unchecked: a socketed rune is an intrinsic,
      // visible part of the item (like the trade site shows it), and a resistance rune folds
      // into a pseudo, so its own chip is off by default yet should still be seen.
      // Same for a Forbidden Shako's randomized supports. When both slots roll the SAME
      // support only the higher one can be searched (two filters on one indexable id
      // match nothing), so the twin arrives disabled -- but it is still a mod printed on
      // the item, and hiding it reads as the price checker having lost it (#564).
      active.forEach((f, i) => {
        if (f.type === 'rune' || f.randomSupport) enabledIndices.add(i)
      })
      setCollapsedVisibleIndices(enabledIndices)
    }
    lastSearchedSig.current = searchSignature(active, { listedTime, priceOption, statusOption })
    try {
      const result = await window.api.tradeSearch(
        {
          name: searchName,
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
        active,
        { listedTime, priceOption, statusOption },
      )
      setListings(result.listings)
      setTotal(result.total)
      setQueryId(result.queryId)
      queryIdRef.current = result.queryId
      setRemainingIds(result.remainingIds ?? [])
      setLoginRequiredPseudoIds(result.loginRequiredPseudoIds ?? [])
      setLoginRequiredMercenaryIds(result.loginRequiredMercenaryIds ?? [])

      // Mercenary Warrants open on skills alone, which prices the build rather
      // than the warrant. The comps that just came back are the cheapest ones
      // matching those skills, so they say which of this warrant's supports are
      // unusual -- tick those and search again. Once per item: after this the
      // user owns the selection, including if they clear it.
      if (!mercenaryTightened.current) {
        const picks = pickMercenarySupportsToEnable(active, result.listings, result.total)
        if (picks.length > 0) {
          mercenaryTightened.current = true
          const tightened = active.map((f, i) => (picks.includes(i) ? { ...f, enabled: true } : f))
          // Positional, not a wholesale replace: a chip the user clicked while the
          // search was in flight would otherwise be reverted. Toggling only flips
          // `enabled`, so the indices still line up. If they did click, the query
          // we are about to send no longer matches state and the panel says so.
          setFilters((prev) => prev.map((f, i) => (picks.includes(i) ? { ...f, enabled: true } : f)))
          await doSearch(tightened)
        }
      }
    } catch (e) {
      setError(stripIpcErrorWrapper(e instanceof Error ? e.message : 'Search failed'))
    }
    setSearching(false)
  }

  const loadMore = async (): Promise<void> => {
    if (!queryId || remainingIds.length === 0 || loadingMore) return
    const fetchQueryId = queryId
    setLoadingMore(true)
    try {
      const result = await window.api.fetchMoreListings(fetchQueryId, remainingIds)
      // Stale-response guard: drop the response if the user has re-searched
      // (queryId changed) while this fetch was in flight. Without this, the
      // prior search's listings would append onto the new search's results.
      if (queryIdRef.current !== fetchQueryId) return
      setListings((prev) => [...prev, ...result.listings])
      setRemainingIds(result.remainingIds)
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false)
    }
  }

  // Auto-search on first mount (wait for bulk check AND settings load first).
  // Gated by the "Never auto-search" setting -- user must click Search manually in that case.
  useEffect(() => {
    if (isBulk === null) return // still checking
    if (!settingsLoaded) return
    if (neverAutoSearch.current) return
    // Exchange items are still resolving their details; searching now would burn
    // a trade request whose results the dashboard is about to hide.
    if (isBulk && exchange === undefined) return
    if (!autoSearched.current && (!unidCandidates || selectedUnique)) {
      autoSearched.current = true
      if (isBulk) {
        if (shouldAutoBulkSearch({ isBulk, details: exchange })) doBulkSearch()
      } else {
        doSearch()
      }
    }
  }, [selectedUnique, isBulk, settingsLoaded, exchange])

  const toggleFilter = (idx: number): void => {
    setFilters((prev) => toggleFilterAt(prev, idx))
  }

  const updateFilterMin = (idx: number, val: string): void => {
    setFilters((prev) => prev.map((f, i) => (i === idx ? { ...f, min: val === '' ? null : parseFloat(val) } : f)))
  }

  const updateFilterMax = (idx: number, val: string): void => {
    setFilters((prev) => prev.map((f, i) => (i === idx ? { ...f, max: val === '' ? null : parseFloat(val) } : f)))
  }

  const allIcons = iconMap as Record<string, string>

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-bg">
      {/* Item header */}
      <ItemHeader
        heroIcon={heroIcon}
        heroName={heroName}
        baseType={item.baseType}
        color={color}
        isDivCard={isDivCard}
        priceInfo={priceInfo}
        chaosPerDivine={chaosPerDivine}
        divineGraph={divineGraph}
        stackSize={item.stackSize > 1 ? item.stackSize : undefined}
        maxStackSize={item.maxStackSize}
        dustInfo={getDustInfo(item)}
        areaLevel={item.monsterLevel}
        heistJobs={item.heistJobs}
        onOpenWiki={onOpenWiki}
        pluginButtons={pluginButtons}
        onOpenPoeDb={onOpenPoeDb}
        onOpenNinja={onOpenNinja}
      />

      <div className="flex-1 overflow-y-auto px-[14px] py-[10px] flex flex-col gap-[10px]">
        {/* Unidentified unique: show candidate selection */}
        {unidCandidates && (
          <div
            className="flex gap-[6px] flex-wrap overflow-x-hidden shrink-0"
            style={{
              maxHeight: selectedUnique ? 0 : 200,
              overflowY: selectedUnique ? 'hidden' : 'auto',
              opacity: selectedUnique ? 0 : 1,
              transition: 'max-height 0.3s ease-out, opacity 0.2s ease-out',
              marginBottom: selectedUnique ? -10 : 0,
            }}
          >
            {unidCandidates.map((c) => {
              const iconUrl = allIcons[c.name]
              // Scale based on inventory size, normalize to ~50px tall
              const size = getItemSize(item.itemClass, c.name)
              const h = size[1]
              const w = size[0]
              const imgH = Math.min(60, Math.max(44, h * 20))
              const imgW = Math.max(36, Math.round(imgH * (w / h)))
              return (
                <div
                  key={c.name}
                  onClick={() => {
                    setSelectedUnique(c.name)
                    autoSearched.current = false
                  }}
                  className="flex flex-col items-center gap-1 px-[10px] py-2 bg-black/20 border border-border rounded-[6px] cursor-pointer overflow-hidden relative"
                  style={{ minWidth: 70 }}
                >
                  {/* Glow */}
                  {iconUrl && (
                    <img
                      src={iconUrl}
                      alt=""
                      className="absolute pointer-events-none"
                      style={{
                        top: '30%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: imgW * 2.5,
                        height: imgH * 2.5,
                        objectFit: 'contain',
                        filter: 'blur(16px) saturate(2)',
                        opacity: 0.3,
                      }}
                    />
                  )}
                  {iconUrl ? (
                    <img
                      src={iconUrl}
                      alt=""
                      className="relative object-contain"
                      style={{
                        width: imgW,
                        height: imgH,
                      }}
                    />
                  ) : (
                    <div
                      className="rounded-[3px]"
                      style={{ width: 30, height: 40, background: 'rgba(255,255,255,0.05)' }}
                    />
                  )}
                  <span className="relative text-[9px] font-semibold text-center leading-tight text-[#af6025]">
                    {c.name}
                  </span>
                  {c.chaosValue > 0 &&
                    (() => {
                      // Roll high-baseline candidates (e.g. Headhunter at 11.9k exalted)
                      // up to divines once they clear one divine, matching PriceChip.
                      const useDivine = chaosPerDivine != null && chaosPerDivine > 0 && c.chaosValue >= chaosPerDivine
                      return (
                        <span className="relative flex items-center gap-[2px] text-[9px] font-[inherit] text-text-dim">
                          {formatPrice(useDivine ? c.chaosValue / chaosPerDivine : c.chaosValue)}
                          <CurrencyIcon name={useDivine ? 'divine' : baselineKey} className="w-[10px] h-[10px]" />
                        </span>
                      )
                    })()}
                </div>
              )
            })}
          </div>
        )}

        {/* Chip filters (sockets, links, quality, ilvl, exact values) -- hide for bulk items */}
        {!isBulk &&
          (filters.some((f) => f.type === 'socket' || f.type === 'misc') ||
            filters.some((f) => f.type !== 'socket' && f.type !== 'misc' && f.value != null)) && (
            <div className="flex gap-[6px] flex-wrap">
              {/* Exact Values chip */}
              {(() => {
                const hasStatFilters = filters.some(
                  (f) => f.type !== 'socket' && f.type !== 'misc' && f.type !== 'timeless' && f.value != null,
                )
                if (!hasStatFilters) return null
                const isFullValues = filters.every(
                  (f) =>
                    f.type === 'socket' ||
                    f.type === 'misc' ||
                    f.type === 'timeless' ||
                    !f.enabled ||
                    f.value == null ||
                    f.min === f.value,
                )
                return (
                  <FilterChip
                    label="Exact Values"
                    active={isFullValues}
                    onClick={() =>
                      setFilters((prev) =>
                        prev.map((f) => {
                          if (f.type === 'socket' || f.type === 'misc' || f.type === 'timeless') return f
                          if (f.value == null) return f
                          return { ...f, min: f.value }
                        }),
                      )
                    }
                  />
                )
              })()}
              {/* Base chip -- hidden for mirrored items, which can't be crafted on.
                  Keyed off the item property, not the mirrored search chip's state,
                  so toggling that filter on a non-mirrored item doesn't drop the chip. */}
              {(() => {
                if (item.mirrored) return null

                // Base mode signature: basetype chip on, no mod-style filters
                // active. ilvl is expected for non-uniques (rare crafting
                // bases) but intentionally off for uniques -- whose roll pool
                // is fixed per item -- so only check it when the rarity calls
                // for it.
                const isUnique = item.rarity === 'Unique'
                const isBaseMode =
                  filters.some((f) => f.id === 'misc.basetype' && f.enabled) &&
                  (isUnique || filters.some((f) => f.id === 'misc.ilvl' && f.enabled)) &&
                  (includeImplicits ||
                    !filters.some((f) => (f.type === 'implicit' || f.type === 'enchant') && f.enabled)) &&
                  filters.filter(
                    (f) =>
                      f.type !== 'socket' &&
                      f.type !== 'misc' &&
                      f.type !== 'timeless' &&
                      f.type !== 'fractured' &&
                      f.type !== 'currency' &&
                      f.type !== 'heist' &&
                      f.type !== 'implicit' &&
                      f.type !== 'enchant' &&
                      f.type !== 'rune' &&
                      !f.foulborn &&
                      !isPerfectUniqueRoll(f, item.rarity) &&
                      !f.premium &&
                      f.enabled,
                  ).length === 0

                return (
                  <FilterChip
                    label="Base"
                    active={isBaseMode}
                    onClick={() => {
                      applyBaseMode()
                      // Promote implicit/enchant filters into the visible set when we're enabling them
                      if (includeImplicits && collapsedVisibleIndices) {
                        const promoted = new Set(collapsedVisibleIndices)
                        filters.forEach((f, i) => {
                          if (f.type === 'implicit' || f.type === 'enchant') promoted.add(i)
                        })
                        setCollapsedVisibleIndices(promoted)
                      }
                    }}
                  />
                )
              })()}
              {/* Crafting Ready chip -- PoE2 white/magic gear only. Base + ilvl + explicit affixes. */}
              {craftingReadyEligible &&
                (() => {
                  const active = isCraftingReadyState(filters, includeImplicits)
                  return (
                    <FilterChip
                      label="Crafting Ready"
                      active={active}
                      onClick={() => {
                        applyCraftingReady()
                        // Promote implicit/enchant and explicit rows into the visible set so
                        // the affixes we just enabled aren't hidden behind "more filters".
                        if (collapsedVisibleIndices) {
                          const promoted = new Set(collapsedVisibleIndices)
                          filters.forEach((f, i) => {
                            if (
                              f.type === 'explicit' ||
                              (includeImplicits && (f.type === 'implicit' || f.type === 'enchant'))
                            )
                              promoted.add(i)
                          })
                          setCollapsedVisibleIndices(promoted)
                        }
                      }}
                    />
                  )
                })()}
              {/* Filter chips (sockets, quality, ilvl, influence, etc.) */}
              {filters.map((f, i) => {
                if (f.type !== 'socket' && f.type !== 'misc') return null
                if (TERNARY_CHIP_IDS.has(f.id)) return null
                if (MINMAX_CHIP_IDS.has(f.id)) return null
                return (
                  <FilterChip
                    key={i}
                    label={f.text}
                    active={f.enabled}
                    onClick={() => toggleFilter(i)}
                    color={getChipColor(f.id)}
                    icon={f.id.startsWith('misc.influence_') ? INFLUENCE_ICONS[f.id] : undefined}
                  />
                )
              })}
              {/* Timeless jewel chips */}
              {filters.map((f, i) => {
                if (f.type !== 'timeless') return null
                return <FilterChip key={i} label={f.text} active={f.enabled} onClick={() => toggleFilter(i)} />
              })}
              {/* Ternary chips (corrupted / mirrored / fractured) */}
              {filters.map((f, i) =>
                TERNARY_CHIP_IDS.has(f.id) ? (
                  <FilterChip
                    key={i}
                    label={f.text}
                    state={f.chipState}
                    onChange={(next) =>
                      setFilters((prev) => prev.map((g, j) => (j === i ? { ...g, chipState: next } : g)))
                    }
                  />
                ) : null,
              )}
              {/* Minmax chips (ilvl) */}
              {filters.map((f, i) =>
                MINMAX_CHIP_IDS.has(f.id) ? (
                  <FilterChip
                    key={i}
                    label={f.text}
                    mode="minmax"
                    state={f.chipState}
                    onChange={(next) =>
                      setFilters((prev) =>
                        prev.map((g, j) => {
                          if (j !== i) return g
                          if (next === 'min') return { ...g, chipState: next, enabled: true, min: g.value, max: null }
                          if (next === 'max') return { ...g, chipState: next, enabled: true, min: null, max: g.value }
                          return { ...g, chipState: undefined, enabled: false }
                        }),
                      )
                    }
                  />
                ) : null,
              )}
              {/* Per-search Settings chip -- toggles a dropdown row above the search button */}
              {!isBulk && (
                <FilterChip label="Settings" active={showSettings} onClick={() => setShowSettings((v) => !v)} />
              )}
            </div>
          )}

        {/* Stat filters (defence, pseudo, explicit, implicit, crafted) -- hide for bulk items */}
        {!isBulk &&
          (() => {
            const statFilters = filters
              .map((f, i) => ({ f, i }))
              .filter(({ f }) => f.type !== 'socket' && f.type !== 'misc' && f.type !== 'timeless')
            const hiddenCount =
              filtersCollapsed && collapsedVisibleIndices
                ? statFilters.filter(({ i }) => !collapsedVisibleIndices.has(i)).length
                : statFilters.filter(({ f }) => !f.enabled).length

            if (statFilters.length === 0) return null

            // When collapsed, show filters that were enabled at time of search (snapshot)
            // Toggling a filter after search doesn't move it -- it stays in place
            const visibleStats =
              filtersCollapsed && collapsedVisibleIndices
                ? statFilters.filter(({ i }) => collapsedVisibleIndices.has(i))
                : statFilters

            return (
              <div className="bg-black/20 flex flex-col rounded-none mx-[-14px] p-0">
                {/* Visible filters */}
                {visibleStats.map(({ f, i }, rowIdx) => (
                  <Fragment key={i}>
                    <StatFilterRow
                      f={f}
                      i={i}
                      rowIdx={rowIdx}
                      toggleFilter={toggleFilter}
                      updateFilterMin={updateFilterMin}
                      updateFilterMax={updateFilterMax}
                      itemRarity={item.rarity}
                      onRowContextMenu={(i2, x, y, scale) => setRowMenu({ filterIdx: i2, x, y, scale })}
                    />
                    {/* This pseudo needs a Weighted Sum search, which the trade API
                        only allows for logged-in users; it was dropped this search. */}
                    {loginRequiredPseudoIds.includes(f.id) && (
                      <div
                        className="px-3 pt-2 pb-2"
                        // Match the StatFilterRow alternating background (same rowIdx)
                        // so the tip reads as part of its pseudo's row, not a gap.
                        style={{ background: zebraRowBg(rowIdx) }}
                      >
                        <DismissibleTip id={`pseudo-login-${f.id}`} dismissible={false}>
                          <span
                            className="font-bold underline cursor-pointer"
                            onClick={() => {
                              login().then(() => doSearch())
                            }}
                          >
                            Log in
                          </span>{' '}
                          to add this pseudo to your search
                        </DismissibleTip>
                      </div>
                    )}
                    {/* This support searched item-wide instead of on its own skill:
                        the scoped form is a `mercenary` stat group, and anonymous
                        queries only fit one. Shown once, on the first such row. */}
                    {loginRequiredMercenaryIds[0] === f.id && (
                      <div className="px-3 pt-2 pb-2" style={{ background: zebraRowBg(rowIdx) }}>
                        <DismissibleTip id="mercenary-support-login" dismissible={false}>
                          This trade is too complicated for the API unless you are logged in. Blame Greg.{' '}
                          <span
                            className="font-bold underline cursor-pointer"
                            onClick={() => {
                              login().then(() => doSearch())
                            }}
                          >
                            Log in.
                          </span>
                        </DismissibleTip>
                      </div>
                    )}
                  </Fragment>
                ))}

                {/* Show more / hide toggle when collapsed after search */}
                {filtersCollapsed && hiddenCount > 0 && (
                  <div
                    onClick={() => {
                      setFiltersCollapsed(false)
                      setCollapsedVisibleIndices(null)
                    }}
                    className="flex items-center gap-[6px] px-3 py-[6px] cursor-pointer select-none"
                  >
                    <span className="text-[10px] text-text-dim">&#9654;</span>
                    <span className="text-[11px] text-text-dim">
                      {hiddenCount} more filter{hiddenCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}

                {/* Collapse toggle when expanded and has disabled */}
                {!filtersCollapsed && searched && hiddenCount > 0 && (
                  <div
                    onClick={() => {
                      setFiltersCollapsed(true)
                      setCollapsedVisibleIndices(
                        new Set(filters.map((f, i) => (f.enabled ? i : -1)).filter((i) => i >= 0)),
                      )
                    }}
                    className="flex items-center gap-[6px] px-3 py-[6px] cursor-pointer select-none"
                  >
                    <span className="text-[10px] text-text-dim">&#9650;</span>
                    <span className="text-[11px] text-text-dim">Hide unused filters</span>
                  </div>
                )}
              </div>
            )
          })()}

        {/* Per-search settings row (Listed / Buyout currency / Trade listings) */}
        {showSettings && !isBulk && (
          <div className="grid grid-cols-3 gap-[6px]">
            <SearchSettingDropdown value={listedTime} options={LISTED_TIME_OPTIONS} onChange={setListedTime} />
            <SearchSettingDropdown
              value={priceOption}
              options={getPriceOptions(poeVersion)}
              onChange={setPriceOption}
            />
            <SearchSettingDropdown value={statusOption} options={STATUS_OPTIONS} onChange={setStatusOption} />
          </div>
        )}

        {/* Search buttons. With the dashboard up this whole row is gone: there is
            nothing to search from here, and "Open in Trade" moves down next to
            the listings it belongs with. An empty row would still count as a
            flex child of the parent's gap-[10px] stack and leave dead space. */}
        {!showExchangePanel && (
          <div className="flex gap-[6px]">
            <button
              onClick={() => (isBulk ? doBulkSearch() : doSearch())}
              onMouseEnter={() => {
                if (searchDirty) void doSearch()
              }}
              disabled={searching}
              className="flex-1 px-4 py-2 text-xs font-semibold border-none rounded"
              style={{
                background: searching ? 'rgba(255,255,255,0.1)' : 'var(--accent)',
                color: searching ? 'var(--text-dim)' : '#171821',
                cursor: searching ? 'default' : 'pointer',
                boxShadow: searchDirty ? '0 0 4px 0 var(--accent)' : undefined,
              }}
            >
              {searching ? 'Searching...' : searched ? 'Search Again' : 'Search Trade'}
            </button>
            {searched && !searching && queryId !== null && (
              <button
                onClick={() =>
                  window.api.openExternal(
                    isBulk === true ? tradeUrls.webExchange(league, queryId) : tradeUrls.webSearch(league, queryId),
                  )
                }
                className="px-3 py-2 text-[11px] font-semibold bg-white/[0.08] text-text border-none rounded cursor-pointer whitespace-nowrap"
              >
                Open in Trade
              </button>
            )}
          </div>
        )}

        {showExchangePanel ? (
          <ExchangePanel
            key={item.baseType}
            details={exchange!}
            vendor={features.bulkExchangeBanner === 'ange' ? 'Ange' : 'Faustus'}
            stackSize={item.stackSize}
            onOpenNinja={onOpenNinja}
          />
        ) : features.bulkExchangeBanner === 'ange' ? (
          <AngeBanner item={item} priceInfo={priceInfo} chaosPerDivine={chaosPerDivine} divineGraph={divineGraph} />
        ) : (
          <FaustusBanner item={item} priceInfo={priceInfo} chaosPerDivine={chaosPerDivine} divineGraph={divineGraph} />
        )}

        {/* Trade-API penalty wins over the raw error text: same information,
         *  but with Greg's face on it and a real countdown the user can plan
         *  around. The raw error still shows for non-rate-limit failures. */}
        {penaltyUntil != null ? (
          <TradeTimeoutBanner
            key={penaltyUntil}
            until={penaltyUntil}
            showLogin={auth?.loggedIn === false}
            onLogin={login}
          />
        ) : (
          error && <div className="text-[10px] text-[#ef5350] px-1">{error}</div>
        )}

        {/* Searching placeholder rows so the results area isn't empty while the trade
            API is in flight (can take several seconds under rate limit). */}
        {searching && <ListingRowsSkeleton />}

        {/* Bulk Exchange Results. With the dashboard up these are opt-in: the
            search only runs on the first expand. If the expand search failed
            (rate limit is the common case), no listings ever appear and the
            button stays hidden -- re-show it as a retry affordance so the user
            isn't stuck re-checking the item to try again. */}
        {(() => {
          if (!isBulk || !showExchangePanel) return null
          const showToggle = !listingsOpen || (error != null && bulkListings.length === 0)
          // "Open in Trade" lives here rather than in the top button row: with the
          // dashboard up it is only meaningful once listings are open, so it
          // belongs in the same slot the expand button occupied.
          const showOpenInTrade = listingsOpen && searched && !searching && queryId !== null
          if (!showToggle && !showOpenInTrade) return null
          return (
            <div className="flex gap-[6px] items-center">
              {showToggle && (
                <button
                  onClick={() => {
                    if (!listingsOpen) setListingsOpen(true)
                    void doBulkSearch()
                  }}
                  className="px-3 py-[6px] text-[11px] text-text-dim bg-white/[0.04] border-none rounded cursor-pointer whitespace-nowrap"
                >
                  {listingsOpen ? <>&#8635; Retry trade listings</> : <>&#9660; Trade listings</>}
                </button>
              )}
              {showOpenInTrade && (
                <button
                  onClick={() => window.api.openExternal(tradeUrls.webExchange(league, queryId))}
                  className="px-3 py-[6px] text-[11px] font-semibold bg-white/[0.08] text-text border-none rounded cursor-pointer whitespace-nowrap"
                >
                  Open in Trade
                </button>
              )}
            </div>
          )
        })()}

        {isBulk && searched && !searching && bulkListings.length > 0 && (
          <BulkListings bulkListings={bulkListings} total={total} />
        )}

        {isBulk && searched && !searching && bulkListings.length === 0 && !error && (
          <div className="text-[11px] text-text-dim text-center p-2">No sellers found</div>
        )}

        {/* Regular Trade Results */}
        {!isBulk && searched && !searching && listings.length > 0 && (
          <TradeListings
            listings={listings}
            total={total}
            itemClass={item.itemClass}
            itemName={item.name}
            itemRarity={item.rarity}
            expandedListing={expandedListing}
            setExpandedListing={setExpandedListing}
            priceChipMinWidth={priceChipMinWidth}
            loggedIn={loggedIn}
            actionStatus={actionStatus}
            setActionStatus={setActionStatus}
            queryId={queryId}
            league={league}
            onLoadMore={remainingIds.length > 0 ? loadMore : undefined}
            loadingMore={loadingMore}
            resultsView={resultsView}
          />
        )}

        {!isBulk && searched && !searching && listings.length === 0 && !error && (
          <div className="text-[11px] text-text-dim text-center p-2">No listings found</div>
        )}
      </div>
      {searched && !searching && <RateLimitBar rateLimitTiers={rateLimitTiers} />}
      {rowMenu &&
        (() => {
          const f = filters[rowMenu.filterIdx]
          if (!f) return null
          const entries = learnedMenuEntries(f, learnedDecisions ?? {}, sessionPrefs)
          if (entries.length === 0) return null
          const items: ContextMenuEntry[] = entries.map((en) => ({
            label: en.label,
            onClick: () =>
              en.kind === 'set' ? setLearnedPreference(rowMenu.filterIdx) : unsetLearnedPreference(rowMenu.filterIdx),
          }))
          // The panel wrapper always carries a CSS transform, which would hijack
          // position:fixed - portal to body escapes it (same reason as HoverTooltip).
          return createPortal(
            <ContextMenu
              positioning="fixed"
              x={rowMenu.x}
              y={rowMenu.y}
              scale={rowMenu.scale}
              items={items}
              onClose={() => setRowMenu(null)}
            />,
            document.body,
          )
        })()}
    </div>
  )
}
