import { useState, useEffect, useRef, useMemo, Fragment } from 'react'
import type { PriceCheckProps, StatFilter, Listing, BulkListing } from './types'
import { getTradeUrls } from '../../../../shared/endpoints'
import { getGameFeatures } from '../../../../shared/game-features'
import { getCurrencyIcons } from '../../shared/icons'
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
import { FilterChip } from './FilterChip'
import { FaustusBanner } from './FaustusBanner'
import { AngeBanner } from './AngeBanner'
import { TradeTimeoutBanner } from './TradeTimeoutBanner'
import { ItemHeader } from './ItemHeader'
import { getDustInfo } from '../../shared/dust'
import { StatFilterRow } from './StatFilterRow'
import { TradeListings } from './TradeListings'
import { BulkListings } from './BulkListings'
import { ListingRowsSkeleton } from './PriceCheckSkeleton'
import { RateLimitBar } from './RateLimitBar'
import { DismissibleTip } from '../../shared/DismissibleTip'
import { BASE_DEFAULT_ITEM_CLASSES, applyBaseModeToFilters, shouldIncludeImplicitsInBase } from './base-mode'
import { applyLearnedDecisions } from './learned-decisions'
import type { ListedTime, PriceOption, ResultsView, StatusOption } from './search-settings'
import { LISTED_TIME_OPTIONS, getPriceOptions, primaryCurrencySwap, STATUS_OPTIONS } from './search-settings'
import { SearchSettingDropdown } from './SearchSettingDropdown'
import { zebraRowBg } from '../../shared/utils'
import { useAuth } from '../../shared/use-auth'

export function PriceCheck({
  item,
  priceInfo,
  statFilters: initialFilters,
  league,
  poeVersion,
  chaosPerDivine,
  unidCandidates,
  sessionId,
  learnedDecisions,
  onClose: _onClose,
  onOpenWiki,
  onOpenPoeDb,
  onOpenNinja,
}: PriceCheckProps): JSX.Element {
  const tradeUrls = getTradeUrls(poeVersion)
  const currencyIcons = getCurrencyIcons(poeVersion)
  const features = getGameFeatures(poeVersion)
  const isDivCard = item.itemClass === 'Divination Cards'
  const [selectedUnique, setSelectedUnique] = useState<string | null>(null)
  const color = selectedUnique ? RARITY_COLORS['Unique'] : (RARITY_COLORS[item.rarity] ?? '#c8c8c8')
  const heroIcon = selectedUnique ? (iconMap[selectedUnique] ?? getItemIcon(item)) : getItemIcon(item)
  const heroName = selectedUnique ?? item.name
  const { loggedIn, login } = useAuth()
  // Ids of pseudos the last search dropped because the user is not logged in
  // (Weighted Sum, e.g. added elemental damage on PoE2). Each drives an in-row
  // login tip under the matching filter.
  const [loginRequiredPseudoIds, setLoginRequiredPseudoIds] = useState<string[]>([])
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

  // Auto-clear the penalty once the countdown actually elapses so the search
  // UI re-enables without the user having to dismiss anything manually.
  useEffect(() => {
    if (penaltyUntil == null) return
    const remaining = penaltyUntil - Date.now()
    if (remaining <= 0) {
      setPenaltyUntil(null)
      return
    }
    const id = setTimeout(() => setPenaltyUntil(null), remaining)
    return () => clearTimeout(id)
  }, [penaltyUntil])

  const [filters, setFilters] = useState<StatFilter[]>(initialFilters)
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
  const [isBulk, setIsBulk] = useState<boolean | null>(null)
  const [bulkListings, setBulkListings] = useState<BulkListing[]>([])

  // Per-search settings overrides (exposed via the Settings chip). Defaults come from the
  // user's global settings once they load; left blank for "listed" ("any time").
  const [showSettings, setShowSettings] = useState(false)
  const [listedTime, setListedTime] = useState<ListedTime>('')
  const [priceOption, setPriceOption] = useState<PriceOption>('chaos_divine')
  const [statusOption, setStatusOption] = useState<StatusOption>('available')
  const [resultsView, setResultsView] = useState<ResultsView>('default')

  const includeImplicits = shouldIncludeImplicitsInBase(item.rarity, item.corrupted)
  const applyBaseMode = (): void => {
    setFilters((prev) => applyBaseModeToFilters(prev, item.rarity, item.corrupted))
  }

  // Check if this is a bulk exchange item on mount
  useEffect(() => {
    window.api.checkBulkItem(item.name, item.baseType, item.itemClass, item.rarity).then(setIsBulk)
  }, [item.name, item.baseType, item.itemClass])

  // Auto-apply Base mode:
  //   - Item classes in BASE_DEFAULT_ITEM_CLASSES: always (e.g. Blueprints, Contracts)
  //   - Uniques (for everyone): apply Base but keep the disabled rows visible above the fold
  //   - Setting "Default all items to Base": same as uniques behavior for all items
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
      else if (s.tradePriceOption) setPriceOption(s.tradePriceOption as PriceOption)
      if (s.tradeStatus) setStatusOption(s.tradeStatus as StatusOption)
      if (s.tradeDefaultListedTime !== undefined) setListedTime(s.tradeDefaultListedTime as ListedTime)
      if (s.tradeResultsView) setResultsView(s.tradeResultsView)
      setSettingsLoaded(true)
      const isClassDefault = BASE_DEFAULT_ITEM_CLASSES.has(item.itemClass)
      const isUnique = item.rarity === 'Unique'
      const keepRowsVisible = isUnique || !!s.tradeDefaultToBase
      const useBaseMode = isClassDefault || keepRowsVisible
      if (keepRowsVisible) {
        // Keep rows visible that are enabled pre-Base OR that learning will enable.
        baseModeExpandedIndices.current = new Set(
          filters.map((f, i) => (f.enabled || learnedDecisions?.[f.id] === true ? i : -1)).filter((i) => i >= 0),
        )
      }
      // Learning is the final layer: apply it on top of the (optionally base-moded) defaults.
      setFilters((prev) => {
        const based = useBaseMode ? applyBaseModeToFilters(prev, item.rarity, item.corrupted) : prev
        return applyLearnedDecisions(based, learnedDecisions)
      })
      baseModeApplied.current = true
      defaultsApplied.current = true
    })
  }, [])

  const searchName = selectedUnique ?? item.name

  const doBulkSearch = async (): Promise<void> => {
    setSearching(true)
    setError(null)
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
      const result = await window.api.bulkExchange(item.name, item.baseType, payWith)
      setBulkListings(result.listings)
      setTotal(result.total)
      setQueryId(result.queryId)
      queryIdRef.current = result.queryId
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    }
    setSearching(false)
  }

  const doSearch = async (): Promise<void> => {
    setSearching(true)
    setError(null)
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
      const enabledIndices = new Set(filters.map((f, i) => (f.enabled ? i : -1)).filter((i) => i >= 0))
      if (baseModeExpandedIndices.current) {
        for (const i of baseModeExpandedIndices.current) enabledIndices.add(i)
      }
      setCollapsedVisibleIndices(enabledIndices)
    }
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
        filters,
        { listedTime, priceOption, statusOption },
      )
      setListings(result.listings)
      setTotal(result.total)
      setQueryId(result.queryId)
      queryIdRef.current = result.queryId
      setRemainingIds(result.remainingIds ?? [])
      setLoginRequiredPseudoIds(result.loginRequiredPseudoIds ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
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
    if (!autoSearched.current && (!unidCandidates || selectedUnique)) {
      autoSearched.current = true
      if (isBulk) {
        doBulkSearch()
      } else {
        doSearch()
      }
    }
  }, [selectedUnique, isBulk, settingsLoaded])

  const toggleFilter = (idx: number): void => {
    setFilters((prev) => {
      const target = prev[idx]
      // Ternary and minmax chips are driven via chipState through the FilterChip's onChange path;
      // toggling them via this binary path would silently desync state.
      if (TERNARY_CHIP_IDS.has(target.id) || MINMAX_CHIP_IDS.has(target.id)) return prev
      const toggling = !target.enabled
      return prev.map((f, i) => {
        if (i === idx) {
          if (toggling && f.type === 'timeless') return { ...f, enabled: true }
          return { ...f, enabled: toggling }
        }
        // Timeless chips are mutually exclusive: enabling one disables the other
        if (f.type === 'timeless' && target.type === 'timeless' && toggling) {
          return { ...f, enabled: false }
        }
        // Auto-flip the Fractured chip to "yes" when a fractured-mod row is toggled on
        if (f.id === 'misc.fractured' && target.type === 'fractured' && toggling) {
          return { ...f, chipState: 'yes' }
        }
        return f
      })
    })
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
        stackSize={item.stackSize > 1 ? item.stackSize : undefined}
        maxStackSize={item.maxStackSize}
        dustInfo={getDustInfo(item)}
        areaLevel={item.monsterLevel}
        heistJob={item.heistJob}
        onOpenWiki={onOpenWiki}
        onOpenPoeDb={onOpenPoeDb}
        onOpenNinja={onOpenNinja}
      />

      <div className="flex-1 overflow-y-auto px-[14px] py-[10px] flex flex-col gap-[10px]">
        {/* Unidentified unique: show candidate selection */}
        {unidCandidates && (
          <div
            className="flex gap-[6px] flex-wrap overflow-x-hidden"
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
                  {c.chaosValue > 0 && (
                    <span className="relative flex items-center gap-[2px] text-[9px] font-[inherit] text-text-dim">
                      {formatPrice(c.chaosValue)}
                      <img src={currencyIcons.baseline} alt="" className="w-[10px] h-[10px]" />
                    </span>
                  )}
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
              {/* Base chip -- non-mirrored */}
              {(() => {
                if (filters.some((f) => f.id === 'misc.mirrored' && f.chipState === 'yes')) return null

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
                      !f.foulborn &&
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

        {/* Search buttons */}
        <div className="flex gap-[6px]">
          <button
            onClick={() => (isBulk ? doBulkSearch() : doSearch())}
            disabled={searching}
            className="flex-1 px-4 py-2 text-xs font-semibold border-none rounded"
            style={{
              background: searching ? 'rgba(255,255,255,0.1)' : 'var(--accent)',
              color: searching ? 'var(--text-dim)' : '#171821',
              cursor: searching ? 'default' : 'pointer',
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

        {features.bulkExchangeBanner === 'ange' ? (
          <AngeBanner item={item} priceInfo={priceInfo} chaosPerDivine={chaosPerDivine} />
        ) : (
          <FaustusBanner item={item} priceInfo={priceInfo} chaosPerDivine={chaosPerDivine} />
        )}

        {/* Trade-API penalty wins over the raw error text: same information,
         *  but with Greg's face on it and a real countdown the user can plan
         *  around. The raw error still shows for non-rate-limit failures. */}
        {penaltyUntil != null ? (
          <TradeTimeoutBanner until={penaltyUntil} />
        ) : (
          error && <div className="text-[10px] text-[#ef5350] px-1">{error}</div>
        )}

        {/* Searching placeholder rows so the results area isn't empty while the trade
            API is in flight (can take several seconds under rate limit). */}
        {searching && <ListingRowsSkeleton />}

        {/* Bulk Exchange Results */}
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
    </div>
  )
}
