import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import {
  MAP_MODS,
  DANGER_COLORS,
  DANGER_LABELS,
  NIGHTMARE_REGROUPED,
  type Danger,
} from '../../../../shared/data/regex/map-mods'
import { buildMapRegex } from './regex-engine'
import { buildQualifierRegex, QUALIFIERS, QUALIFIER_GROUPS, type QualifierValues } from './Qualifiers'
import {
  AddOne,
  Forbid,
  CheckOne,
  Compass,
  SettingConfig,
  Down,
  Right,
  Buy,
  Search,
  CloseSmall,
} from '@icon-park/react'
import { TAB_COLORS, loadSet, loadStorage } from './mapmods-helpers'
import { FilterChip } from '../price-check/FilterChip'
import { TradeResults } from './TradeResults'
import { MAP_TIER_ICONS, ORIGINATOR_TIER_ICONS, TierPicker } from './TierPicker'
import { ModList } from './ModList'
import { ScrubInput } from './ScrubInput'
import { generatePresetTags } from './preset-tags'
import { InfoChip } from '../../shared/PriceChip'
import type { Listing } from '../price-check/types'
import type { RegexPreset } from '../../../../shared/types'
import type { GeneratorHandle, GeneratorProps } from './generator-types'

const DANGER_ORDER: Danger[] = ['lethal', 'dangerous', 'annoying', 'mild', 'harmless', 'beneficial']

type Tab = 'qualifiers' | 'avoid' | 'want'
type WantMode = 'any' | 'all'

/** Maps-scoped panel state -- mutually exclusive with the container's save/load panels
 *  via the shared-panel plumbing. */
type MapsPanel = 'search' | 'tier' | 'trade' | null

export const MapsGenerator = forwardRef<GeneratorHandle, GeneratorProps>(function MapsGenerator(
  { onRegexChange, onAutoTagsChange, sharedSaveChip, sharedLoadChip, sharedSavePanel, sharedSavedPresets },
  ref,
) {
  // ---- Persisted state -----------------------------------------------------
  const [tab, setTab] = useState<Tab>('qualifiers')
  const [avoid, setAvoid] = useState<Set<number>>(() => loadSet('scalpel:regex:map-avoid'))
  const [want, setWant] = useState<Set<number>>(() => loadSet('scalpel:regex:map-want'))
  const [wantMode, setWantMode] = useState<WantMode>(() =>
    loadStorage('scalpel:regex:map-want-mode', 'any' as WantMode, (s) => s as WantMode),
  )
  const [qualifiers, setQualifiers] = useState<QualifierValues>(() => loadStorage('scalpel:regex:qualifiers', {}))
  const [optimizeNumbers, setOptimizeNumbers] = useState(() =>
    loadStorage('scalpel:regex:optimize', true, (s) => s !== 'false'),
  )
  const [showNightmare, setShowNightmare] = useState(() =>
    loadStorage('scalpel:regex:nightmare', false, (s) => s === 'true'),
  )

  useEffect(() => {
    localStorage.setItem('scalpel:regex:map-avoid', JSON.stringify([...avoid]))
  }, [avoid])
  useEffect(() => {
    localStorage.setItem('scalpel:regex:map-want', JSON.stringify([...want]))
  }, [want])
  useEffect(() => {
    localStorage.setItem('scalpel:regex:map-want-mode', wantMode)
  }, [wantMode])
  useEffect(() => {
    localStorage.setItem('scalpel:regex:qualifiers', JSON.stringify(qualifiers))
  }, [qualifiers])
  useEffect(() => {
    localStorage.setItem('scalpel:regex:nightmare', String(showNightmare))
  }, [showNightmare])
  useEffect(() => {
    localStorage.setItem('scalpel:regex:optimize', String(optimizeNumbers))
  }, [optimizeNumbers])

  // ---- Ephemeral UI state --------------------------------------------------
  const [panel, setPanel] = useState<MapsPanel>(null)
  const searchOpen = panel === 'search'
  const showTierPicker = panel === 'tier'
  const showTradeResults = panel === 'trade'
  const [search, setSearch] = useState('')
  const [showAllTiers, setShowAllTiers] = useState(false)
  const [avoidCollapsed, setAvoidCollapsed] = useState<Set<string>>(
    new Set(['dangerous', 'annoying', 'mild', 'harmless', 'beneficial']),
  )
  const [wantCollapsed, setWantCollapsed] = useState<Set<string>>(
    new Set(['nightmare', 'lethal', 'dangerous', 'annoying', 'mild', 'harmless']),
  )
  const [qualCollapsed, setQualCollapsed] = useState<Set<string>>(
    () => new Set(QUALIFIER_GROUPS.filter((g) => !g.defaultOpen).map((g) => g.label)),
  )

  // ---- Trade state ---------------------------------------------------------
  const [tradeSearching, setTradeSearching] = useState(false)
  const [tradeListings, setTradeListings] = useState<Listing[]>([])
  const [tradeTotal, setTradeTotal] = useState<number | null>(null)
  const [tradeQueryId, setTradeQueryId] = useState<string | null>(null)
  const [tradeLeague, setTradeLeague] = useState<string>('')
  const [tradeError, setTradeError] = useState<string | null>(null)
  const [tradeRemainingIds, setTradeRemainingIds] = useState<string[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [expandedListing, setExpandedListing] = useState<string | null>(null)
  const [actionStatus, setActionStatus] = useState<Record<string, 'pending' | 'success' | 'failed'>>({})
  const [loggedIn, setLoggedIn] = useState(false)
  const [rateLimitTiers, setRateLimitTiers] = useState<
    Array<{ used: number; max: number; window: number; penalty: number }>
  >([])
  const [tradeOriginator, setTradeOriginator] = useState(false)
  const [tradeCorrupted8mod, setTradeCorrupted8mod] = useState(false)

  useEffect(() => {
    window.api.poeCheckAuth().then((r) => setLoggedIn(r.loggedIn))
    const unsub = window.api.onRateLimit((state) => setRateLimitTiers(state.tiers))
    return unsub
  }, [])

  const priceChipMinWidth = useMemo(() => {
    const maxDigits = tradeListings.reduce((max, l) => Math.max(max, l.price ? String(l.price.amount).length : 0), 0)
    return 38 + maxDigits * 9
  }, [tradeListings])

  // ---- Derived values ------------------------------------------------------
  const selected = tab === 'avoid' ? avoid : want
  const setSelected = tab === 'avoid' ? setAvoid : setWant

  const visibleMods = MAP_MODS.filter((m) => {
    if (!showNightmare && m.nightmare) return false
    if (search && !m.text.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const dangerOrder = tab === 'want' ? [...DANGER_ORDER].reverse() : DANGER_ORDER
  const WANT_PRIORITY = new Set([583869527, -683043845, -1647756153]) // magic monsters, rare monsters, rare+modifier

  const nonNightmareMods = visibleMods.filter((m) => !m.nightmare || NIGHTMARE_REGROUPED.has(m.id))
  const nightmareMods = showNightmare ? visibleMods.filter((m) => m.nightmare && !NIGHTMARE_REGROUPED.has(m.id)) : []

  const regularGroups = dangerOrder
    .map((danger) => {
      const mods = nonNightmareMods.filter((m) => m.danger === danger)
      if (tab === 'want') mods.sort((a, b) => (WANT_PRIORITY.has(b.id) ? 1 : 0) - (WANT_PRIORITY.has(a.id) ? 1 : 0))
      return { danger, mods, label: DANGER_LABELS[danger], color: DANGER_COLORS[danger], key: danger }
    })
    .filter((g) => g.mods.length > 0)

  const nightmareGroup =
    nightmareMods.length > 0
      ? [
          {
            danger: 'lethal' as Danger,
            mods: nightmareMods,
            label: 'Nightmare',
            color: TAB_COLORS.nightmare,
            key: 'nightmare',
          },
        ]
      : []

  const grouped = tab === 'want' ? [...regularGroups, ...nightmareGroup] : [...nightmareGroup, ...regularGroups]

  const avoidMods = MAP_MODS.filter((m) => avoid.has(m.id))
  const wantMods = MAP_MODS.filter((m) => want.has(m.id))
  const qualifierRegex = buildQualifierRegex(qualifiers)
  const modRegex = buildMapRegex(avoidMods, wantMods, wantMode)
  const regex = [qualifierRegex, modRegex].filter(Boolean).join(' ')
  const qualifierCount = QUALIFIERS.filter((q) => qualifiers[q.id] != null && qualifiers[q.id]! > 0).length
  const hasMoreQualifier = ['morecurrency', 'morescarabs', 'moremaps'].some(
    (k) => qualifiers[k] != null && qualifiers[k]! > 0,
  )
  const tierIcons = hasMoreQualifier || tradeOriginator ? ORIGINATOR_TIER_ICONS : MAP_TIER_ICONS
  const hasNightmareMod = MAP_MODS.some((m) => m.nightmare && want.has(m.id))

  // ---- Outbound reporting --------------------------------------------------
  useEffect(() => {
    onRegexChange(regex)
  }, [regex, onRegexChange])

  // Stable reference to latest callback so the tag-sync effect only fires on state changes.
  const onAutoTagsChangeRef = useRef(onAutoTagsChange)
  useEffect(() => {
    onAutoTagsChangeRef.current = onAutoTagsChange
  }, [onAutoTagsChange])

  useEffect(() => {
    onAutoTagsChangeRef.current(generatePresetTags({ avoid, want, qualifiers }))
  }, [avoid, want, qualifiers])

  // ---- Trade search --------------------------------------------------------
  const searchMapTrade = async (tier: number, nightmare: boolean): Promise<void> => {
    setTradeSearching(true)
    setTradeError(null)
    setExpandedListing(null)
    setActionStatus({})
    try {
      const avoidTexts = MAP_MODS.filter((m) => avoid.has(m.id)).map((m) => m.text)
      const wantTexts = MAP_MODS.filter((m) => want.has(m.id)).map((m) => m.text)
      const qualObj: Record<string, number> = {}
      for (const [k, v] of Object.entries(qualifiers)) {
        if (v != null && v > 0) qualObj[k] = v
      }
      const result = (await window.api.mapRegexTrade({
        tier,
        avoidTexts,
        wantTexts,
        wantMode,
        qualifiers: qualObj,
        nightmare,
        originator: tradeOriginator,
        corrupted8mod: tradeCorrupted8mod,
      })) as { total: number; listings: Listing[]; queryId: string; league: string; remainingIds: string[] }
      setTradeListings(result.listings)
      setTradeTotal(result.total)
      setTradeQueryId(result.queryId)
      setTradeLeague(result.league)
      setTradeRemainingIds(result.remainingIds)
      setPanel('trade')
    } catch (e) {
      console.error('[regex] Trade search failed:', e)
      setTradeError(e instanceof Error ? e.message : 'Search failed')
      setPanel('trade')
    } finally {
      setTradeSearching(false)
    }
  }

  const tradeLoadMore = async (): Promise<void> => {
    if (!tradeQueryId || tradeRemainingIds.length === 0 || loadingMore) return
    setLoadingMore(true)
    try {
      const result = await window.api.fetchMoreListings(tradeQueryId, tradeRemainingIds)
      setTradeListings((prev) => [...prev, ...result.listings])
      setTradeRemainingIds(result.remainingIds)
    } catch {
      // silently fail
    }
    setLoadingMore(false)
  }

  // ---- Imperative handle ---------------------------------------------------
  useImperativeHandle(
    ref,
    () => ({
      getPresetPayload: () => ({
        avoid: [...avoid],
        want: [...want],
        wantMode,
        qualifiers: Object.fromEntries(Object.entries(qualifiers).filter(([, v]) => v != null)) as Record<
          string,
          number
        >,
        nightmare: showNightmare,
      }),
      applyPreset: (preset: RegexPreset) => {
        setAvoid(new Set(preset.avoid))
        setWant(new Set(preset.want))
        setWantMode(preset.wantMode)
        setQualifiers(preset.qualifiers)
        setShowNightmare(preset.nightmare)
      },
      // Maps presets match on sorted auto-tag text set (ignoring user custom tags).
      matchesPreset: (preset: RegexPreset) => {
        if ((preset.generator ?? 'maps') !== 'maps') return false
        const fresh = generatePresetTags({ avoid, want, qualifiers })
          .map((t) => t.text)
          .sort()
          .join('|')
        const saved = (preset.tags ?? [])
          .filter((t) => !!t.source && t.source !== 'custom')
          .map((t) => t.text)
          .sort()
          .join('|')
        return fresh === saved
      },
    }),
    [avoid, want, wantMode, qualifiers, showNightmare],
  )

  // ---- Collapse helpers ----------------------------------------------------
  const collapsed = tab === 'avoid' ? avoidCollapsed : wantCollapsed
  const setCollapsedForTab = tab === 'avoid' ? setAvoidCollapsed : setWantCollapsed
  const toggleCollapse = (key: string): void => {
    setCollapsedForTab((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const toggle = (id: number): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openPanel = (p: MapsPanel): void => setPanel((cur) => (cur === p ? null : p))

  return (
    <>
      {/* Chip-header row: maps-specific chips + shared Save/Load chips. Save panel and
          SavedPresets (container-owned) get rendered inline below via the shared slots. */}
      <div className="flex flex-col px-3 py-2 border-b border-border bg-bg-card">
        <div className="flex items-center gap-[6px]">
          <FilterChip
            label={
              <>
                <Search size={12} theme="outline" fill="currentColor" /> Search
              </>
            }
            active={searchOpen}
            onClick={() => {
              openPanel('search')
              if (searchOpen) setSearch('')
            }}
          />
          {sharedSaveChip}
          {sharedLoadChip}
          <FilterChip
            label={
              <>
                <Buy size={12} theme="outline" fill="currentColor" /> {tradeSearching ? 'Searching...' : 'Trade'}
              </>
            }
            active={showTierPicker || showTradeResults}
            onClick={() => {
              if (showTradeResults) {
                setPanel(null)
              } else if (tradeQueryId && !showTierPicker) {
                setPanel('trade')
              } else {
                openPanel('tier')
              }
            }}
          />
        </div>

        {/* Search input drawer */}
        <div
          className="overflow-hidden transition-all duration-150"
          style={{ maxHeight: searchOpen ? 40 : 0, marginTop: searchOpen ? 8 : 0, opacity: searchOpen ? 1 : 0 }}
        >
          <div className="relative">
            <input
              type="text"
              placeholder="Search mods..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-[11px] bg-black/30 rounded px-2 py-[5px] border-none pr-6"
            />
            {search && (
              <div
                onClick={() => setSearch('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer text-text-dim hover:text-text"
              >
                <CloseSmall size={14} theme="outline" fill="currentColor" />
              </div>
            )}
          </div>
        </div>

        {/* Shared save panel (collapsible). */}
        {sharedSavePanel}

        <TierPicker
          showTierPicker={showTierPicker}
          showTradeResults={showTradeResults}
          showAllTiers={showAllTiers}
          setShowAllTiers={setShowAllTiers}
          tradeOriginator={tradeOriginator}
          setTradeOriginator={setTradeOriginator}
          tradeCorrupted8mod={tradeCorrupted8mod}
          setTradeCorrupted8mod={setTradeCorrupted8mod}
          hasNightmareMod={hasNightmareMod}
          tradeSearching={tradeSearching}
          regex={regex}
          tierIcons={tierIcons}
          searchMapTrade={searchMapTrade}
        />
      </div>

      {/* Shared SavedPresets strip (container decides visibility via the load chip). */}
      {sharedSavedPresets}

      {/* Body: tab row + lists + trade results */}
      <MapsGeneratorBody
        tab={tab}
        setTab={setTab}
        avoid={avoid}
        want={want}
        qualifierCount={qualifierCount}
        showTradeResults={showTradeResults}
        optimizeNumbers={optimizeNumbers}
        setOptimizeNumbers={setOptimizeNumbers}
        setQualifiers={setQualifiers}
        showNightmare={showNightmare}
        setShowNightmare={setShowNightmare}
        wantMode={wantMode}
        setWantMode={setWantMode}
        qualifiers={qualifiers}
        search={search}
        qualCollapsed={qualCollapsed}
        setQualCollapsed={setQualCollapsed}
        grouped={grouped}
        selected={selected}
        collapsed={collapsed}
        toggle={toggle}
        toggleCollapse={toggleCollapse}
        tradeProps={{
          tradeTotal,
          tradeQueryId,
          tradeLeague,
          tradeError,
          tradeListings,
          tradeRemainingIds,
          tradeLoadMore,
          loadingMore,
          expandedListing,
          setExpandedListing,
          priceChipMinWidth,
          loggedIn,
          actionStatus,
          setActionStatus,
          rateLimitTiers,
        }}
      />
    </>
  )
})

// ============================================================================
// Body section -- the tabs + qualifier list + mod list + trade results. Kept
// inside this file for now; split out further if it grows.
// ============================================================================

interface MapsGeneratorBodyProps {
  tab: Tab
  setTab: React.Dispatch<React.SetStateAction<Tab>>
  avoid: Set<number>
  want: Set<number>
  qualifierCount: number
  showTradeResults: boolean
  optimizeNumbers: boolean
  setOptimizeNumbers: React.Dispatch<React.SetStateAction<boolean>>
  setQualifiers: React.Dispatch<React.SetStateAction<QualifierValues>>
  showNightmare: boolean
  setShowNightmare: React.Dispatch<React.SetStateAction<boolean>>
  wantMode: WantMode
  setWantMode: React.Dispatch<React.SetStateAction<WantMode>>
  qualifiers: QualifierValues
  search: string
  qualCollapsed: Set<string>
  setQualCollapsed: React.Dispatch<React.SetStateAction<Set<string>>>
  grouped: Array<{ mods: typeof MAP_MODS; label: string; color: string; key: string; danger: Danger }>
  selected: Set<number>
  collapsed: Set<string>
  toggle: (id: number) => void
  toggleCollapse: (key: string) => void
  tradeProps: React.ComponentProps<typeof TradeResults>
}

function MapsGeneratorBody({
  tab,
  setTab,
  avoid,
  want,
  qualifierCount,
  showTradeResults,
  optimizeNumbers,
  setOptimizeNumbers,
  setQualifiers,
  showNightmare,
  setShowNightmare,
  wantMode,
  setWantMode,
  qualifiers,
  search,
  qualCollapsed,
  setQualCollapsed,
  grouped,
  selected,
  collapsed,
  toggle,
  toggleCollapse,
  tradeProps,
}: MapsGeneratorBodyProps): JSX.Element {
  return (
    <>
      <div className="flex gap-1 px-2 pt-1 pb-0 bg-bg-card" style={{ display: showTradeResults ? 'none' : undefined }}>
        {(['qualifiers', 'avoid', 'want'] as const).map((t) => {
          const isActive = tab === t && !showTradeResults
          const color = TAB_COLORS[t]
          const count = t === 'avoid' ? avoid.size : t === 'want' ? want.size : qualifierCount
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 flex items-center justify-between px-3 text-[11px] py-[5px] border-none cursor-pointer transition-colors relative ${isActive ? 'regex-tab-active' : ''}`}
              style={{
                background: isActive ? 'var(--bg-solid)' : 'transparent',
                color: isActive ? color : 'var(--text-dim)',
                fontWeight: 600,
                borderRadius: isActive ? '6px 6px 0 0' : '6px',
                padding: isActive ? '5px 12px' : '1px 11px',
                ...(isActive ? {} : { margin: '4px 1px' }),
                minHeight: isActive ? 30 : undefined,
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent'
              }}
            >
              <span className="flex items-center gap-[6px]">
                {t === 'qualifiers' && (
                  <AddOne size={18} theme="two-tone" fill={['currentColor', 'rgba(255,255,255,0.2)']} />
                )}
                {t === 'avoid' && (
                  <Forbid size={18} theme="two-tone" fill={['currentColor', 'rgba(255,255,255,0.2)']} />
                )}
                {t === 'want' && (
                  <CheckOne size={18} theme="two-tone" fill={['currentColor', 'rgba(255,255,255,0.2)']} />
                )}
                {t === 'qualifiers' ? 'Qualifiers' : t === 'avoid' ? 'Avoid' : 'Want'}
              </span>
              {count > 0 && (
                <span style={{ transform: 'translateY(1px)' }}>
                  <InfoChip color={color}>
                    <span className="font-bold">{count}</span>
                  </InfoChip>
                </span>
              )}
            </button>
          )
        })}
      </div>

      {showTradeResults && <TradeResults {...tradeProps} />}

      {!showTradeResults && tab === 'qualifiers' && (
        <div
          className="flex items-center gap-[6px] px-3 py-[6px] border-b border-border"
          style={{ background: 'var(--bg-solid)' }}
        >
          <FilterChip
            label="Regular"
            active={!optimizeNumbers}
            onClick={() => setOptimizeNumbers(false)}
            color={TAB_COLORS.qualifiers}
          />
          <FilterChip
            label="Optimized"
            active={optimizeNumbers}
            onClick={() => {
              setOptimizeNumbers(true)
              // Snap current values to 10s
              setQualifiers((prev) => {
                const snapped: QualifierValues = {}
                for (const [k, v] of Object.entries(prev)) {
                  snapped[k] = v != null && v > 0 ? Math.floor(v / 10) * 10 || v : v
                }
                return snapped
              })
            }}
            color={TAB_COLORS.qualifiers}
          />
        </div>
      )}

      {!showTradeResults && tab === 'avoid' && (
        <div
          className="flex items-center justify-center gap-[6px] px-3 py-[6px] border-b border-border"
          style={{ background: 'var(--bg-solid)' }}
        >
          <FilterChip
            label="Show Nightmare mods"
            active={showNightmare}
            onClick={() => setShowNightmare((v) => !v)}
            color={TAB_COLORS.avoid}
          />
        </div>
      )}

      {!showTradeResults && tab === 'want' && (
        <div
          className="flex items-center gap-[6px] px-3 py-[6px] border-b border-border"
          style={{ background: 'var(--bg-solid)' }}
        >
          <div className="flex-1" />
          <FilterChip
            label="Show Nightmare mods"
            active={showNightmare}
            onClick={() => setShowNightmare((v) => !v)}
            color={TAB_COLORS.avoid}
          />
          <div className="flex-1 flex justify-end gap-[6px]">
            <FilterChip
              label="Any"
              active={wantMode === 'any'}
              onClick={() => setWantMode('any')}
              color={TAB_COLORS.want}
            />
            <FilterChip
              label="All"
              active={wantMode === 'all'}
              onClick={() => setWantMode('all')}
              color={TAB_COLORS.want}
            />
          </div>
        </div>
      )}

      {!showTradeResults && tab === 'qualifiers' && (
        <div className="flex-1 overflow-y-auto bg-bg-card">
          {QUALIFIER_GROUPS.map((group) => {
            const filteredQuals = search
              ? group.qualifiers.filter((q) => q.label.toLowerCase().includes(search.toLowerCase()))
              : group.qualifiers
            if (filteredQuals.length === 0) return null
            const isGroupCollapsed = qualCollapsed.has(group.label)
            const activeInGroup = group.qualifiers.filter(
              (q) => qualifiers[q.id] != null && qualifiers[q.id]! > 0,
            ).length
            return (
              <div key={group.label}>
                <div
                  className="flex items-center gap-2 px-3 py-[8px] sticky-group-header cursor-pointer select-none sticky top-0 z-[1]"
                  style={{ height: 39, boxSizing: 'border-box' }}
                  onClick={() =>
                    setQualCollapsed((prev) => {
                      const next = new Set(prev)
                      if (next.has(group.label)) next.delete(group.label)
                      else next.add(group.label)
                      return next
                    })
                  }
                >
                  {group.icon === 'setting-config' && (
                    <SettingConfig
                      size={14}
                      theme="two-tone"
                      fill={['var(--text)', 'rgba(255,255,255,0.2)']}
                      style={{ marginTop: 1, marginLeft: -2 }}
                    />
                  )}
                  {group.icon === 'compass' && (
                    <Compass
                      size={14}
                      theme="two-tone"
                      fill={['var(--text)', 'rgba(255,255,255,0.2)']}
                      style={{ marginTop: 1, marginLeft: -2 }}
                    />
                  )}
                  <span className="text-[10px] uppercase tracking-wider font-bold flex-1 text-text">{group.label}</span>
                  {activeInGroup > 0 && (
                    <InfoChip color={TAB_COLORS.qualifiers}>
                      <span className="font-bold">{activeInGroup}</span>
                    </InfoChip>
                  )}
                  {isGroupCollapsed ? (
                    <Right
                      size={12}
                      theme="two-tone"
                      fill={['currentColor', 'currentColor']}
                      className="text-text-dim"
                    />
                  ) : (
                    <Down
                      size={12}
                      theme="two-tone"
                      fill={['currentColor', 'currentColor']}
                      className="text-text-dim"
                    />
                  )}
                </div>
                {!isGroupCollapsed &&
                  filteredQuals.map((q, qi) => (
                    <div
                      key={q.id}
                      className="flex items-center gap-2 px-3 py-[6px]"
                      style={{
                        background:
                          qualifiers[q.id] != null && qualifiers[q.id]! > 0
                            ? 'rgba(129,199,132,0.08)'
                            : qi % 2 === 0
                              ? 'rgba(255,255,255,0.02)'
                              : 'transparent',
                      }}
                    >
                      <span
                        className="text-[11px] flex-1"
                        style={{
                          color: qualifiers[q.id] != null && qualifiers[q.id]! > 0 ? 'var(--text)' : 'var(--text-dim)',
                        }}
                      >
                        {q.label}
                      </span>
                      <ScrubInput
                        value={qualifiers[q.id] ?? null}
                        placeholder="--"
                        step={optimizeNumbers ? 10 : 1}
                        onChange={(val) => {
                          const snapped =
                            optimizeNumbers && val != null && val > 0 ? Math.floor(val / 10) * 10 || val : val
                          setQualifiers((prev) => ({ ...prev, [q.id]: snapped }))
                        }}
                      />
                    </div>
                  ))}
              </div>
            )
          })}
        </div>
      )}

      {!showTradeResults && (tab === 'avoid' || tab === 'want') && (
        <ModList
          grouped={grouped}
          selected={selected}
          collapsed={collapsed}
          tab={tab}
          toggle={toggle}
          toggleCollapse={toggleCollapse}
        />
      )}
    </>
  )
}
