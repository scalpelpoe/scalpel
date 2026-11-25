import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useRegexTrade } from './useRegexTrade'
import { MAP_MODS, DANGER_COLORS, DANGER_LABELS, NIGHTMARE_REGROUPED, type Danger } from '@shared/data/regex/map-mods'
import { DEFAULT_MAP_STATE, sanitizeMapState, type MapStateSettings } from '@shared/data/regex/map-state'
import { buildMapRegex } from './regex-engine'
import { buildMapStateRegex } from './map-state-regex'
import { buildQualifierRegex, QUALIFIERS, QUALIFIER_GROUPS, type QualifierValues } from './Qualifiers'
import { DEFAULT_REWARD_TARGETS, formatRewards, rankMapRewards, rewardTargets } from './map-reward-plan'
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
import { TAB_COLORS, RegexCheckbox, loadSet, loadStorage, useRegexKey } from './mapmods-helpers'
import { FilterChip } from '../../components/primitives/FilterChip'
import { PoeReImportPanel } from './PoeReImportPanel'
import poereIconTight from '../../assets/other/poere-logo-tight.svg'
import { TradeResults } from './TradeResults'
import { MAP_TIER_ICONS, ORIGINATOR_TIER_ICONS, TierPicker } from './TierPicker'
import { ModList } from './ModList'
import { ScrubInput } from '../../components/primitives/ScrubInput'
import { generatePresetTags } from './preset-tags'
import { InfoChip } from '../../shared/InfoChip'
import type { RegexPreset } from '@shared/types'
import type { GeneratorHandle, GeneratorProps } from './generator-types'
import { zebraRowBg } from '../../shared/utils'

const DANGER_ORDER: Danger[] = ['lethal', 'dangerous', 'annoying', 'mild', 'harmless', 'beneficial']

type Tab = 'qualifiers' | 'avoid' | 'want'
type WantMode = 'any' | 'all'

/** Maps-scoped panel state -- mutually exclusive with the container's save/load panels
 *  via the shared-panel plumbing. */
type MapsPanel = 'search' | 'tier' | 'trade' | 'import' | null

export const MapsGenerator = forwardRef<GeneratorHandle, GeneratorProps>(function MapsGenerator(
  {
    onRegexChange,
    onAutoTagsChange,
    sharedSaveChip,
    sharedLoadChip,
    sharedNewChip,
    sharedSavePanel,
    sharedSavedPresets,
    onPanelOpen,
  },
  ref,
) {
  // ---- Persisted state -----------------------------------------------------
  const key = useRegexKey()
  const [tab, setTab] = useState<Tab>('qualifiers')
  const [avoid, setAvoid] = useState<Set<number>>(() => loadSet(key('map-avoid')))
  const [want, setWant] = useState<Set<number>>(() => loadSet(key('map-want')))
  const [wantMode, setWantMode] = useState<WantMode>(() =>
    loadStorage(key('map-want-mode'), 'any' as WantMode, (s) => s as WantMode),
  )
  const [qualifiers, setQualifiers] = useState<QualifierValues>(() => loadStorage(key('qualifiers'), {}))
  const [mapState, setMapState] = useState<MapStateSettings>(() =>
    loadStorage(key('map-state'), DEFAULT_MAP_STATE, (s) => sanitizeMapState(JSON.parse(s))),
  )
  const [optimizeNumbers, setOptimizeNumbers] = useState(() =>
    loadStorage(key('optimize'), false, (s) => s !== 'false'),
  )
  const [showNightmare, setShowNightmare] = useState(() => loadStorage(key('nightmare'), false, (s) => s === 'true'))

  useEffect(() => {
    localStorage.setItem(key('map-avoid'), JSON.stringify([...avoid]))
  }, [avoid, key])
  useEffect(() => {
    localStorage.setItem(key('map-want'), JSON.stringify([...want]))
  }, [want, key])
  useEffect(() => {
    localStorage.setItem(key('map-want-mode'), wantMode)
  }, [wantMode, key])
  useEffect(() => {
    localStorage.setItem(key('qualifiers'), JSON.stringify(qualifiers))
  }, [qualifiers, key])
  useEffect(() => {
    localStorage.setItem(key('map-state'), JSON.stringify(mapState))
  }, [mapState, key])
  useEffect(() => {
    localStorage.setItem(key('nightmare'), String(showNightmare))
  }, [showNightmare, key])
  useEffect(() => {
    localStorage.setItem(key('optimize'), String(optimizeNumbers))
  }, [optimizeNumbers, key])

  // ---- Ephemeral UI state --------------------------------------------------
  const [panel, setPanel] = useState<MapsPanel>(null)
  const searchOpen = panel === 'search'
  const showTierPicker = panel === 'tier'
  const showTradeResults = panel === 'trade'
  const showImport = panel === 'import'
  // Tell the container to collapse Save/Load whenever one of this generator's own
  // panels opens, so only one chip is open at a time across the row. Ref keeps the
  // callback identity out of the effect deps.
  const onPanelOpenRef = useRef(onPanelOpen)
  useEffect(() => {
    onPanelOpenRef.current = onPanelOpen
  }, [onPanelOpen])
  useEffect(() => {
    if (panel !== null) onPanelOpenRef.current?.()
  }, [panel])
  const [search, setSearch] = useState('')
  const [reviewRewards, setReviewRewards] = useState(false)
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
  const trade = useRegexTrade()
  const [expandedListing, setExpandedListing] = useState<string | null>(null)
  const [tradeOriginator, setTradeOriginator] = useState(false)
  const [tradeCorrupted8mod, setTradeCorrupted8mod] = useState(false)

  const priceChipMinWidth = useMemo(() => {
    const maxDigits = trade.listings.reduce((max, l) => Math.max(max, l.price ? String(l.price.amount).length : 0), 0)
    return 38 + maxDigits * 9
  }, [trade.listings])

  // ---- Derived values ------------------------------------------------------
  const selected = tab === 'avoid' ? avoid : want
  const setSelected = tab === 'avoid' ? setAvoid : setWant

  const visibleMods = MAP_MODS.filter((m) => {
    if (!showNightmare && m.nightmare) return false
    if (search && !`${m.text} ${formatRewards(m.rewards)}`.toLowerCase().includes(search.toLowerCase())) return false
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

  const targets = rewardTargets(qualifiers)
  const hasTargets = Object.keys(targets).length > 0
  const reviewing = tab === 'avoid' && reviewRewards && hasTargets
  const grouped = reviewing
    ? rankMapRewards(visibleMods, targets).map((g) => ({ ...g, color: TAB_COLORS.qualifiers }))
    : tab === 'want'
      ? [...regularGroups, ...nightmareGroup]
      : [...nightmareGroup, ...regularGroups]

  const optimize = (): void => {
    if (!hasTargets) setQualifiers((prev) => ({ ...prev, ...DEFAULT_REWARD_TARGETS }))
    setSearch('')
    setPanel(null)
    onPanelOpen?.()
    setShowNightmare(true)
    setReviewRewards(true)
    setAvoidCollapsed((prev) => {
      const next = new Set(prev)
      next.delete('contributors')
      return next
    })
    setTab('avoid')
  }

  const avoidMods = MAP_MODS.filter((m) => avoid.has(m.id))
  const wantMods = MAP_MODS.filter((m) => want.has(m.id))
  const qualifierRegex = buildQualifierRegex(qualifiers)
  const modRegex = buildMapRegex(avoidMods, wantMods, wantMode)
  const mapStateRegex = buildMapStateRegex(mapState)
  const regex = [qualifierRegex, modRegex, mapStateRegex].filter(Boolean).join(' ')
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
    onAutoTagsChangeRef.current(generatePresetTags({ avoid, want, qualifiers, mapState }))
  }, [avoid, want, qualifiers, mapState])

  // ---- Trade search --------------------------------------------------------
  const searchMapTrade = async (tier: number, nightmare: boolean): Promise<void> => {
    setExpandedListing(null)
    const avoidTexts = MAP_MODS.filter((m) => avoid.has(m.id)).map((m) => m.text)
    const wantTexts = MAP_MODS.filter((m) => want.has(m.id)).map((m) => m.text)
    const qualObj: Record<string, number> = {}
    for (const [k, v] of Object.entries(qualifiers)) {
      if (v != null && v > 0) qualObj[k] = v
    }
    await trade.runSearch(() =>
      window.api.mapRegexTrade({
        tier,
        avoidTexts,
        wantTexts,
        wantMode,
        qualifiers: qualObj,
        nightmare,
        originator: tradeOriginator,
        corrupted8mod: tradeCorrupted8mod,
      }),
    )
    setPanel('trade')
  }

  // Hydrate every piece of Maps state a preset carries. Shared by the container's
  // load-a-saved-preset path and the poe.re import, which builds the same shape.
  const hydrate = (preset: RegexPreset): void => {
    setReviewRewards(false)
    setAvoid(new Set(preset.avoid))
    setWant(new Set(preset.want))
    setWantMode(preset.wantMode)
    setQualifiers(preset.qualifiers)
    setShowNightmare(preset.nightmare)
    setMapState(sanitizeMapState(preset.mapState))
  }

  // ---- Imperative handle ---------------------------------------------------
  useImperativeHandle(
    ref,
    () => ({
      closePanels: () => setPanel(null),
      getPresetPayload: () => ({
        avoid: [...avoid],
        want: [...want],
        wantMode,
        qualifiers: Object.fromEntries(Object.entries(qualifiers).filter(([, v]) => v != null)) as Record<
          string,
          number
        >,
        nightmare: showNightmare,
        mapState,
      }),
      applyPreset: hydrate,
      // Maps presets match on sorted auto-tag text set (ignoring user custom tags).
      matchesPreset: (preset: RegexPreset) => {
        if ((preset.generator ?? 'maps') !== 'maps') return false
        const fresh = generatePresetTags({ avoid, want, qualifiers, mapState })
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
    [avoid, want, wantMode, qualifiers, showNightmare, mapState],
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
  const toggle = (id: string | number): void => {
    const numId = typeof id === 'string' ? Number(id) : id
    const opposite = tab === 'avoid' ? want : avoid
    if (!selected.has(numId) && opposite.has(numId)) {
      const next = new Set(opposite)
      next.delete(numId)
      const setOpposite = tab === 'avoid' ? setWant : setAvoid
      setOpposite(next)
    }
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(numId)) next.delete(numId)
      else next.add(numId)
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
          {sharedNewChip}
          <FilterChip
            label={
              <>
                <Search size={12} theme="outline" fill="currentColor" /> Search
              </>
            }
            active={searchOpen}
            solidInactive
            onClick={() => {
              openPanel('search')
              if (searchOpen) setSearch('')
            }}
          />
          {sharedSaveChip}
          {sharedLoadChip}
          <FilterChip
            label="Import"
            icon={poereIconTight}
            active={showImport}
            solidInactive
            onClick={() => openPanel('import')}
          />
          <FilterChip
            label={
              <>
                <Buy size={12} theme="outline" fill="currentColor" /> {trade.searching ? 'Searching...' : 'Trade'}
              </>
            }
            active={showTierPicker || showTradeResults}
            solidInactive={!showTierPicker && !showTradeResults && regex.trim().length > 0}
            onClick={() => {
              if (showTradeResults) {
                setPanel(null)
              } else if (trade.queryId && !showTierPicker) {
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

        {/* poe.re profile import drawer. Applies straight to Maps state rather than
            going through the container's loadPreset, so pasting an export does not
            open an editing session against a preset id that was never saved. */}
        <PoeReImportPanel open={showImport} onImport={hydrate} />

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
          tradeSearching={trade.searching}
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
        targetSummary={formatRewards(hasTargets ? targets : DEFAULT_REWARD_TARGETS, true)}
        hasTargets={hasTargets}
        reviewing={reviewing}
        optimize={optimize}
        endReview={() => setReviewRewards(false)}
        showTradeResults={showTradeResults}
        optimizeNumbers={optimizeNumbers}
        setOptimizeNumbers={setOptimizeNumbers}
        setQualifiers={setQualifiers}
        showNightmare={showNightmare}
        setShowNightmare={setShowNightmare}
        wantMode={wantMode}
        setWantMode={setWantMode}
        qualifiers={qualifiers}
        mapState={mapState}
        setMapState={setMapState}
        search={search}
        qualCollapsed={qualCollapsed}
        setQualCollapsed={setQualCollapsed}
        grouped={grouped}
        selected={selected}
        collapsed={collapsed}
        toggle={toggle}
        toggleCollapse={toggleCollapse}
        tradeProps={{
          tradeTotal: trade.total,
          tradeQueryId: trade.queryId,
          tradeLeague: trade.league,
          tradeError: trade.error,
          tradeListings: trade.listings,
          tradeRemainingIds: trade.remainingIds,
          tradeLoadMore: trade.loadMore,
          loadingMore: trade.loadingMore,
          expandedListing,
          setExpandedListing,
          priceChipMinWidth,
          rateLimitTiers: trade.rateLimitTiers,
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
  targetSummary: string
  hasTargets: boolean
  reviewing: boolean
  optimize: () => void
  endReview: () => void
  showTradeResults: boolean
  optimizeNumbers: boolean
  setOptimizeNumbers: React.Dispatch<React.SetStateAction<boolean>>
  setQualifiers: React.Dispatch<React.SetStateAction<QualifierValues>>
  showNightmare: boolean
  setShowNightmare: React.Dispatch<React.SetStateAction<boolean>>
  wantMode: WantMode
  setWantMode: React.Dispatch<React.SetStateAction<WantMode>>
  qualifiers: QualifierValues
  mapState: MapStateSettings
  setMapState: React.Dispatch<React.SetStateAction<MapStateSettings>>
  search: string
  qualCollapsed: Set<string>
  setQualCollapsed: React.Dispatch<React.SetStateAction<Set<string>>>
  grouped: Array<{ mods: typeof MAP_MODS; label: string; color: string; key: string }>
  selected: Set<number>
  collapsed: Set<string>
  toggle: (id: string | number) => void
  toggleCollapse: (key: string) => void
  tradeProps: React.ComponentProps<typeof TradeResults>
}

function MapsGeneratorBody({
  tab,
  setTab,
  avoid,
  want,
  qualifierCount,
  targetSummary,
  hasTargets,
  reviewing,
  optimize,
  endReview,
  showTradeResults,
  optimizeNumbers,
  setOptimizeNumbers,
  setQualifiers,
  showNightmare,
  setShowNightmare,
  wantMode,
  setWantMode,
  qualifiers,
  mapState,
  setMapState,
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
          className="flex flex-wrap items-center gap-[6px] px-3 py-[6px] border-b border-border"
          style={{ background: 'var(--bg-solid)' }}
        >
          <FilterChip
            label="Exact"
            active={!optimizeNumbers}
            onClick={() => setOptimizeNumbers(false)}
            color={TAB_COLORS.qualifiers}
          />
          <FilterChip
            label="Round down to 10s"
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
          <button
            type="button"
            onClick={optimize}
            aria-describedby="map-optimize-hint"
            className="ml-auto shrink-0 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-accent hover:bg-white/20 focus-visible:ring-1 focus-visible:ring-accent"
          >
            Optimize
          </button>
          <span id="map-optimize-hint" className="w-full text-[11px] text-text-dim">
            {hasTargets
              ? 'Optimize ranks mods by their contribution to your minimums.'
              : `Optimize starts with ${targetSummary}.`}
          </span>
        </div>
      )}

      {!showTradeResults && tab === 'avoid' && (
        <div
          className="flex flex-wrap items-center justify-center gap-[6px] px-3 py-[6px] border-b border-border"
          style={{ background: 'var(--bg-solid)' }}
        >
          {reviewing && (
            <div className="flex-1 min-w-[160px] text-[11px]">
              <div className="font-semibold text-text">{targetSummary}</div>
              <div className="text-text-dim">Check mods you avoid. Maps must meet every minimum.</div>
            </div>
          )}
          {reviewing && (
            <button
              type="button"
              className="text-[11px] text-accent focus-visible:ring-1 focus-visible:ring-accent"
              onClick={endReview}
            >
              Group by danger
            </button>
          )}
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
                          qualifiers[q.id] != null && qualifiers[q.id]! > 0 ? 'rgba(129,199,132,0.08)' : zebraRowBg(qi),
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
                        max={999}
                        suffix={qualifiers[q.id] ? '%' : ''}
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
          <MapStateGroup
            mapState={mapState}
            setMapState={setMapState}
            collapsed={qualCollapsed.has('Map State')}
            setQualCollapsed={setQualCollapsed}
          />
        </div>
      )}

      {!showTradeResults && (tab === 'avoid' || tab === 'want') && (
        <ModList
          grouped={grouped.map(({ mods, label, color, key }) => ({
            label,
            color,
            key,
            mods: mods.map((m) => ({
              id: m.id,
              text: m.text,
              detail: formatRewards(m.rewards),
              badge: m.nightmare ? { label: 'NM', color: TAB_COLORS.avoid } : undefined,
            })),
          }))}
          selected={selected as Set<string | number>}
          collapsed={collapsed}
          tabColor={tab === 'avoid' ? TAB_COLORS.avoid : TAB_COLORS.want}
          selectedTint={tab === 'avoid' ? 'rgba(239,83,80,0.08)' : 'rgba(129,199,132,0.08)'}
          toggle={toggle}
          toggleCollapse={toggleCollapse}
        />
      )}
    </>
  )
}

// ============================================================================
// Map State group -- poe.re's rarity/corrupted/unidentified filters. Small local
// row helpers modeled on WaystonesGenerator.tsx's ToggleRow, using this file's own
// zebraRowBg striping (rather than an `alt` boolean) to match its neighboring
// qualifier rows.
// ============================================================================

interface MapStateGroupProps {
  mapState: MapStateSettings
  setMapState: React.Dispatch<React.SetStateAction<MapStateSettings>>
  collapsed: boolean
  setQualCollapsed: React.Dispatch<React.SetStateAction<Set<string>>>
}

function MapStateGroup({ mapState, setMapState, collapsed, setQualCollapsed }: MapStateGroupProps): JSX.Element {
  const rarityCount = [mapState.rarityNormal, mapState.rarityMagic, mapState.rarityRare].filter(Boolean).length
  const rarityActive = rarityCount > 0 && !(rarityCount === 3 && mapState.rarityInclude)
  const activeCount =
    (mapState.corrupted !== 'off' ? 1 : 0) + (mapState.unidentified !== 'off' ? 1 : 0) + (rarityActive ? 1 : 0)

  return (
    <div>
      <div
        className="flex items-center gap-2 px-3 py-[8px] sticky-group-header cursor-pointer select-none sticky top-0 z-[1]"
        style={{ height: 39, boxSizing: 'border-box' }}
        onClick={() =>
          setQualCollapsed((prev) => {
            const next = new Set(prev)
            if (next.has('Map State')) next.delete('Map State')
            else next.add('Map State')
            return next
          })
        }
      >
        <span className="text-[10px] uppercase tracking-wider font-bold flex-1 text-text">Map State</span>
        {activeCount > 0 && (
          <InfoChip color={TAB_COLORS.qualifiers}>
            <span className="font-bold">{activeCount}</span>
          </InfoChip>
        )}
        {collapsed ? (
          <Right size={12} theme="two-tone" fill={['currentColor', 'currentColor']} className="text-text-dim" />
        ) : (
          <Down size={12} theme="two-tone" fill={['currentColor', 'currentColor']} className="text-text-dim" />
        )}
      </div>
      {!collapsed && (
        <>
          <MapStateFilterRow
            index={0}
            label="Filter corrupted"
            active={mapState.corrupted !== 'off'}
            onToggle={() =>
              setMapState((prev) => ({ ...prev, corrupted: prev.corrupted === 'off' ? 'include' : 'off' }))
            }
            includeActive={mapState.corrupted === 'include'}
            excludeActive={mapState.corrupted === 'exclude'}
            onInclude={() => setMapState((prev) => ({ ...prev, corrupted: 'include' }))}
            onExclude={() => setMapState((prev) => ({ ...prev, corrupted: 'exclude' }))}
          />
          <ToggleRow
            index={1}
            label="Normal Maps"
            checked={mapState.rarityNormal}
            onChange={() => setMapState((prev) => ({ ...prev, rarityNormal: !prev.rarityNormal }))}
          />
          <ToggleRow
            index={2}
            label="Magic Maps"
            checked={mapState.rarityMagic}
            onChange={() => setMapState((prev) => ({ ...prev, rarityMagic: !prev.rarityMagic }))}
          />
          <ToggleRow
            index={3}
            label="Rare Maps"
            checked={mapState.rarityRare}
            onChange={() => setMapState((prev) => ({ ...prev, rarityRare: !prev.rarityRare }))}
          />
          <div className="flex items-center gap-2 px-3 py-[6px]" style={{ background: zebraRowBg(4) }}>
            <span className="text-[11px] flex-1 text-text-dim">Rarity match</span>
            <FilterChip
              label="Include"
              active={mapState.rarityInclude}
              onClick={() => setMapState((prev) => ({ ...prev, rarityInclude: true }))}
              color={TAB_COLORS.qualifiers}
            />
            <FilterChip
              label="Exclude"
              active={!mapState.rarityInclude}
              onClick={() => setMapState((prev) => ({ ...prev, rarityInclude: false }))}
              color={TAB_COLORS.qualifiers}
            />
          </div>
          <MapStateFilterRow
            index={5}
            label="Filter unidentified"
            active={mapState.unidentified !== 'off'}
            onToggle={() =>
              setMapState((prev) => ({ ...prev, unidentified: prev.unidentified === 'off' ? 'exclude' : 'off' }))
            }
            includeActive={mapState.unidentified === 'include'}
            excludeActive={mapState.unidentified === 'exclude'}
            onInclude={() => setMapState((prev) => ({ ...prev, unidentified: 'include' }))}
            onExclude={() => setMapState((prev) => ({ ...prev, unidentified: 'exclude' }))}
          />
        </>
      )}
    </div>
  )
}

function ToggleRow({
  index,
  label,
  checked,
  onChange,
}: {
  index: number
  label: string
  checked: boolean
  onChange: () => void
}): JSX.Element {
  return (
    <div
      className="flex items-center gap-2 px-3 py-[6px] cursor-pointer select-none"
      style={{ background: zebraRowBg(index) }}
      onClick={onChange}
    >
      <RegexCheckbox checked={checked} color={TAB_COLORS.qualifiers} />
      <span className="text-[11px] flex-1" style={{ color: checked ? 'var(--text)' : 'var(--text-dim)' }}>
        {label}
      </span>
    </div>
  )
}

function MapStateFilterRow({
  index,
  label,
  active,
  onToggle,
  includeActive,
  excludeActive,
  onInclude,
  onExclude,
}: {
  index: number
  label: string
  active: boolean
  onToggle: () => void
  includeActive: boolean
  excludeActive: boolean
  onInclude: () => void
  onExclude: () => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 px-3 py-[6px]" style={{ background: zebraRowBg(index) }}>
      <div className="flex items-center gap-2 flex-1 cursor-pointer select-none" onClick={onToggle}>
        <RegexCheckbox checked={active} color={TAB_COLORS.qualifiers} />
        <span className="text-[11px]" style={{ color: active ? 'var(--text)' : 'var(--text-dim)' }}>
          {label}
        </span>
      </div>
      <FilterChip label="Include" active={includeActive} onClick={onInclude} color={TAB_COLORS.qualifiers} />
      <FilterChip label="Exclude" active={excludeActive} onClick={onExclude} color={TAB_COLORS.qualifiers} />
    </div>
  )
}
