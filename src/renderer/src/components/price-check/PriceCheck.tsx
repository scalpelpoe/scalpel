import { useState, useEffect, useRef, useMemo } from 'react'
import type { PriceCheckProps, StatFilter, Listing, BulkListing } from './types'
import { RARITY_COLORS, INFLUENCE_ICONS, iconMap, chaosIcon, getItemIcon, formatPrice, getItemSize } from './constants'
import { ItemHeader } from './ItemHeader'
import { StatFilterRow } from './StatFilterRow'
import { TradeListings } from './TradeListings'
import { BulkListings } from './BulkListings'

export function PriceCheck({
  item,
  priceInfo,
  statFilters: initialFilters,
  league,
  chaosPerDivine,
  unidCandidates,
  onClose: _onClose,
}: PriceCheckProps): JSX.Element {
  const isDivCard = item.itemClass === 'Divination Cards'
  const [selectedUnique, setSelectedUnique] = useState<string | null>(null)
  const color = selectedUnique ? RARITY_COLORS['Unique'] : (RARITY_COLORS[item.rarity] ?? '#c8c8c8')
  const heroIcon = selectedUnique ? (iconMap[selectedUnique] ?? getItemIcon(item)) : getItemIcon(item)
  const heroName = selectedUnique ?? item.name
  const [loggedIn, setLoggedIn] = useState(false)
  const [rateLimitTiers, setRateLimitTiers] = useState<
    Array<{ used: number; max: number; window: number; penalty: number }>
  >([])
  const rateLimitDecay = useRef<{
    peak: number
    max: number
    windowMs: number
    startTime: number
    timer: ReturnType<typeof setTimeout> | null
  }>({ peak: 0, max: 12, windowMs: 10000, startTime: 0, timer: null })

  useEffect(() => {
    window.api.poeCheckAuth().then((r) => setLoggedIn(r.loggedIn))
    const unsub = window.api.onRateLimit((state) => {
      const first = state.tiers[0]
      if (!first) return
      const d = rateLimitDecay.current

      if (first.used >= d.peak) {
        d.peak = first.used
        d.max = first.max
        d.windowMs = first.window * 1000
        d.startTime = Date.now()
      }

      // Update tiers with current values
      setRateLimitTiers(state.tiers)

      // Schedule step-down ticks
      if (d.timer) clearTimeout(d.timer)
      const scheduleStep = (): void => {
        const elapsed = Date.now() - d.startTime
        const stepsRemaining = Math.max(0, Math.ceil(d.peak * (1 - elapsed / d.windowMs)))
        const stepInterval = d.windowMs / d.peak

        setRateLimitTiers((prev) => prev.map((t, i) => (i === 0 ? { ...t, used: stepsRemaining } : t)))

        if (stepsRemaining > 0) {
          const nextStepIn = stepInterval - (elapsed % stepInterval)
          d.timer = setTimeout(scheduleStep, nextStepIn)
        } else {
          d.peak = 0
          d.timer = null
        }
      }
      const firstStepIn = d.windowMs / d.peak
      d.timer = setTimeout(scheduleStep, firstStepIn)
    })
    return () => {
      unsub()
      if (rateLimitDecay.current.timer) clearTimeout(rateLimitDecay.current.timer)
    }
  }, [])

  const [filters, setFilters] = useState<StatFilter[]>(initialFilters)
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
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const autoSearched = useRef(false)
  const [isBulk, setIsBulk] = useState<boolean | null>(null)
  const [bulkListings, setBulkListings] = useState<BulkListing[]>([])

  // Check if this is a bulk exchange item on mount
  useEffect(() => {
    window.api.checkBulkItem(item.name, item.baseType, item.itemClass, item.rarity).then(setIsBulk)
  }, [item.name, item.baseType, item.itemClass])

  const searchName = selectedUnique ?? item.name

  const doBulkSearch = async (): Promise<void> => {
    setSearching(true)
    setError(null)
    setSearched(true)
    try {
      const payWith = priceInfo?.divineValue != null && priceInfo.divineValue >= 1 ? 'divine' : 'chaos'
      const result = await window.api.bulkExchange(item.name, item.baseType, payWith)
      setBulkListings(result.listings)
      setTotal(result.total)
      setQueryId(result.queryId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    }
    setSearching(false)
  }

  const doSearch = async (): Promise<void> => {
    setSearching(true)
    setError(null)
    setSearched(true)
    setFiltersCollapsed(true)
    // Snapshot which filters are currently enabled -- these stay visible when collapsed
    const enabledIndices = new Set(filters.map((f, i) => (f.enabled ? i : -1)).filter((i) => i >= 0))
    setCollapsedVisibleIndices(enabledIndices)
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
        },
        filters,
      )
      setListings(result.listings)
      setTotal(result.total)
      setQueryId(result.queryId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    }
    setSearching(false)
  }

  // Auto-search on first mount (wait for bulk check to complete first)
  useEffect(() => {
    if (isBulk === null) return // still checking
    if (!autoSearched.current && (!unidCandidates || selectedUnique)) {
      autoSearched.current = true
      if (isBulk) {
        doBulkSearch()
      } else {
        doSearch()
      }
    }
  }, [selectedUnique, isBulk])

  const toggleFilter = (idx: number): void => {
    setFilters((prev) => {
      const target = prev[idx]
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
        // Auto-enable "Include Fractured" chip when a fractured mod is toggled on
        if (f.id === 'misc.fractured' && target.type === 'fractured' && toggling) {
          return { ...f, enabled: true }
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
                      <img src={chaosIcon} alt="" className="w-[10px] h-[10px]" />
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
                  <div
                    onClick={() =>
                      setFilters((prev) =>
                        prev.map((f) => {
                          if (f.type === 'socket' || f.type === 'misc' || f.type === 'timeless') return f
                          if (f.value == null) return f
                          return { ...f, min: f.value }
                        }),
                      )
                    }
                    className="flex items-center gap-1 px-[10px] py-1 rounded-full cursor-pointer text-[11px] font-semibold select-none"
                    style={{
                      background: isFullValues ? 'rgba(200,169,110,0.13)' : 'rgba(0,0,0,0.25)',
                      border: isFullValues ? '1px solid rgba(200,169,110,0.4)' : '1px solid var(--border)',
                      opacity: isFullValues ? 1 : 0.5,
                      color: isFullValues ? 'var(--accent)' : 'var(--text-dim)',
                    }}
                  >
                    Exact Values
                  </div>
                )
              })()}
              {filters.map((f, i) => {
                if (f.type !== 'socket' && f.type !== 'misc') return null
                const isOpenAffix = f.id.startsWith('pseudo.pseudo_number_of_empty_')
                const isInfluence = f.id.startsWith('misc.influence_')
                const chipColor = isOpenAffix
                  ? '#4caf50'
                  : f.id === 'misc.corrupted'
                    ? '#ef5350'
                    : f.id === 'misc.mirrored'
                      ? '#8787FE'
                      : f.id === 'misc.identified'
                        ? '#ffb74d'
                        : isInfluence
                          ? '#c8a2c8'
                          : 'var(--accent)'
                const influenceIcon = isInfluence ? INFLUENCE_ICONS[f.id] : null
                return (
                  <div
                    key={i}
                    onClick={() => toggleFilter(i)}
                    className="flex items-center gap-1 px-[10px] py-1 rounded-full cursor-pointer text-[11px] font-semibold select-none relative overflow-hidden"
                    style={{
                      background: f.enabled
                        ? chipColor === 'var(--accent)'
                          ? 'rgba(200,169,110,0.13)'
                          : `${chipColor}22`
                        : 'rgba(0,0,0,0.25)',
                      border: f.enabled
                        ? chipColor === 'var(--accent)'
                          ? '1px solid rgba(200,169,110,0.4)'
                          : `1px solid ${chipColor}66`
                        : '1px solid var(--border)',
                      opacity: f.enabled ? 1 : 0.5,
                      color: f.enabled ? chipColor : 'var(--text-dim)',
                    }}
                  >
                    {influenceIcon && f.enabled && (
                      <img
                        src={influenceIcon}
                        alt=""
                        className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{
                          width: 28,
                          height: 28,
                          objectFit: 'contain',
                          filter: 'blur(6px) saturate(3)',
                          opacity: 0.5,
                        }}
                      />
                    )}
                    {influenceIcon && (
                      <img
                        src={influenceIcon}
                        alt=""
                        className="relative -ml-[3px]"
                        style={{ width: 14, height: 14 }}
                      />
                    )}
                    <span className="relative">{f.text}</span>
                  </div>
                )
              })}
              {/* Timeless jewel chips */}
              {filters.map((f, i) => {
                if (f.type !== 'timeless') return null
                return (
                  <div
                    key={i}
                    onClick={() => toggleFilter(i)}
                    className="flex items-center gap-1 px-[10px] py-1 rounded-full cursor-pointer text-[11px] font-semibold select-none"
                    style={{
                      background: f.enabled ? 'rgba(200,169,110,0.13)' : 'rgba(0,0,0,0.25)',
                      border: f.enabled ? '1px solid rgba(200,169,110,0.4)' : '1px solid var(--border)',
                      opacity: f.enabled ? 1 : 0.5,
                      color: f.enabled ? 'var(--accent)' : 'var(--text-dim)',
                    }}
                  >
                    {f.text}
                  </div>
                )
              })}
            </div>
          )}

        {/* Stat filters (defence, pseudo, explicit, implicit, crafted) -- hide for bulk items */}
        {!isBulk &&
          (() => {
            const statFilters = filters
              .map((f, i) => ({ f, i }))
              .filter(({ f }) => f.type !== 'socket' && f.type !== 'misc' && f.type !== 'timeless')
            const disabledCount = statFilters.filter(({ f }) => !f.enabled).length

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
                  <StatFilterRow
                    key={i}
                    f={f}
                    i={i}
                    rowIdx={rowIdx}
                    toggleFilter={toggleFilter}
                    updateFilterMin={updateFilterMin}
                    updateFilterMax={updateFilterMax}
                  />
                ))}

                {/* Show more / hide toggle when collapsed after search */}
                {filtersCollapsed && disabledCount > 0 && (
                  <div
                    onClick={() => {
                      setFiltersCollapsed(false)
                      setCollapsedVisibleIndices(null)
                    }}
                    className="flex items-center gap-[6px] px-3 py-[6px] cursor-pointer select-none"
                  >
                    <span className="text-[10px] text-text-dim">&#9654;</span>
                    <span className="text-[11px] text-text-dim">
                      {disabledCount} more filter{disabledCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}

                {/* Collapse toggle when expanded and has disabled */}
                {!filtersCollapsed && searched && disabledCount > 0 && (
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
                  isBulk === true
                    ? `https://www.pathofexile.com/trade/exchange/${encodeURIComponent(league)}/${queryId}`
                    : `https://www.pathofexile.com/trade/search/${encodeURIComponent(league)}/${queryId}`,
                )
              }
              className="px-3 py-2 text-[11px] font-semibold bg-white/[0.08] text-text border-none rounded cursor-pointer whitespace-nowrap"
            >
              Open in Trade
            </button>
          )}
        </div>

        {/* Error */}
        {error && <div className="text-[10px] text-[#ef5350] px-1">{error}</div>}

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
          />
        )}

        {!isBulk && searched && !searching && listings.length === 0 && !error && (
          <div className="text-[11px] text-text-dim text-center p-2">No listings found</div>
        )}
      </div>
      {/* Rate limit bar */}
      {searched &&
        !searching &&
        (() => {
          const first = rateLimitTiers[0]
          const pct = first ? first.used / first.max : 0
          const hasPenalty = rateLimitTiers.some((t) => t.penalty > 0)
          const barColor = hasPenalty
            ? '#c44'
            : pct > 0.8
              ? '#c44'
              : pct > 0.5
                ? '#b8943a'
                : pct > 0
                  ? '#3a7a3a'
                  : 'rgba(255,255,255,0.06)'
          return (
            <div
              className="rate-limit-bar px-[14px] py-1 flex items-center gap-2 border-t border-border relative"
              onMouseMove={(e) => {
                const tip = e.currentTarget.querySelector('.rate-limit-tooltip') as HTMLElement
                if (tip) {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const tipWidth = tip.offsetWidth
                  const x = e.clientX - rect.left
                  const minX = tipWidth / 2
                  const maxX = rect.width - tipWidth / 2
                  tip.style.left = `${Math.max(minX, Math.min(x, maxX))}px`
                }
              }}
            >
              <div className="flex-1 h-[3px] rounded-sm bg-white/[0.08] overflow-hidden">
                <div
                  className="h-full rounded-sm transition-[width] duration-[400ms] ease-[ease]"
                  style={{
                    width: `${Math.min(100, pct * 100)}%`,
                    background: barColor,
                    ...(hasPenalty ? { animation: 'pulse-red 1s ease-in-out infinite' } : {}),
                  }}
                />
              </div>
              {hasPenalty && (
                <span className="text-[9px] text-[#ef5350] font-semibold">
                  {rateLimitTiers.find((t) => t.penalty > 0)!.penalty}s
                </span>
              )}
              <div className="rate-limit-tooltip absolute bottom-full mb-[6px] -translate-x-1/2 px-[10px] py-[6px] bg-bg-card border border-border rounded text-[10px] text-text-dim whitespace-nowrap pointer-events-none opacity-0 transition-opacity duration-150 flex flex-col gap-[2px]">
                <div className="font-semibold text-text mb-[2px]">Trade API Rate Limit</div>
                {rateLimitTiers.map((t, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <span>
                      {t.used}/{t.max}
                    </span>
                    <span className="text-text-dim">per {t.window}s</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
    </div>
  )
}
