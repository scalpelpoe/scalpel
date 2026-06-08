import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { AddOne, Forbid, CheckOne, Search, CloseSmall, Buy, Left } from '@icon-park/react'
import {
  TAB_COLORS,
  formatModText,
  RegexCheckbox,
  useRegexKey,
  usePersistedSet,
  usePersistedString,
  usePersistedNumber,
  usePersistedBool,
  usePersistedJSON,
} from './mapmods-helpers'
import { FilterChip } from '../../components/primitives/FilterChip'
import { ModList } from './ModList'
import { ScrubInput } from '../../components/primitives/ScrubInput'
import { InfoChip } from '../../shared/InfoChip'
import { WAYSTONE_MODS } from '../../../../shared/data/regex/waystone-mods'
import {
  buildWaystoneRegex,
  type WaystoneQualifiers,
  type WaystoneQuantities,
  type WaystoneRarity,
  type WaystoneTier,
} from './waystone-engine'
import { generateWaystonePresetTags } from './waystone-preset-tags'
import { useRegexTrade } from './useRegexTrade'
import { WaystoneTierPicker } from './WaystoneTierPicker'
import { TradeResults } from './TradeResults'
import { useAuth } from '../../shared/use-auth'
import type { RegexPreset } from '../../../../shared/types'
import type { GeneratorHandle, GeneratorProps } from './generator-types'

type Tab = 'qualifiers' | 'avoid' | 'want'
type WantMode = 'any' | 'all'
type TradePanel = 'picker' | 'results' | null

const PREFIX_MODS = WAYSTONE_MODS.filter((m) => m.affix === 'PREFIX')
const SUFFIX_MODS = WAYSTONE_MODS.filter((m) => m.affix === 'SUFFIX')

/** Placeholder hint ("min-max") for a ranged mod's value input, or undefined when the
 *  mod has no numeric range (so unranged mods show no input). Pure over WAYSTONE_MODS,
 *  so it lives at module scope rather than being rebuilt on every render. */
function waystoneRangeHint(id: string | number): string | undefined {
  const mod = WAYSTONE_MODS.find((m) => m.id === Number(id))
  if (!mod || mod.ranges[0]?.length !== 2) return undefined
  return `${mod.ranges[0][0]}-${mod.ranges[0][1]}`
}

export const WaystonesGenerator = forwardRef<GeneratorHandle, GeneratorProps>(function WaystonesGenerator(
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
  const key = useRegexKey()

  // ---- Persisted state ------------------------------------------------------
  const [avoid, setAvoid] = usePersistedSet<number>(key('waystone-avoid'))
  const [want, setWant] = usePersistedSet<number>(key('waystone-want'))
  const [wantMode, setWantMode] = usePersistedString<WantMode>(key('waystone-want-mode'), 'any')

  // Tier range prefilled to the full 1-16 span so users see the bounds at a glance.
  // The engine treats 1/16 the same as 0/0 (no tier constraint), so a default-prefilled
  // tier produces no regex output until the user narrows it.
  const [tierMin, setTierMin] = usePersistedNumber(key('waystone-tier-min'), 1)
  const [tierMax, setTierMax] = usePersistedNumber(key('waystone-tier-max'), 16)

  // Rarity flags. Both checked = no constraint (matches poe2.re behavior).
  const [corrupted, setCorrupted] = usePersistedBool(key('waystone-corrupted'), false)
  const [uncorrupted, setUncorrupted] = usePersistedBool(key('waystone-uncorrupted'), false)

  // Monster-pack qualifier flags.
  const [delirious, setDelirious] = usePersistedBool(key('waystone-delirious'), false)
  const [anyPack, setAnyPack] = usePersistedBool(key('waystone-any-pack'), false)

  // "Quantity & yield" numeric thresholds (0 = no constraint). Each drives both a
  // `"<token>.*<num>%"` regex part and a map_filter min in the trade search.
  const [packSize, setPackSize] = usePersistedNumber(key('waystone-pack-size'), 0)
  const [monsterEffectiveness, setMonsterEffectiveness] = usePersistedNumber(key('waystone-monster-effectiveness'), 0)
  const [monsterRarity, setMonsterRarity] = usePersistedNumber(key('waystone-monster-rarity'), 0)
  const [itemRarity, setItemRarity] = usePersistedNumber(key('waystone-iir'), 0)
  const [dropChance, setDropChance] = usePersistedNumber(key('waystone-drop-chance'), 0)

  // "Round down to nearest 10" and "Match numbers over 100%" output toggles.
  const [round10, setRound10] = usePersistedBool(key('waystone-round10'), false)
  const [over100, setOver100] = usePersistedBool(key('waystone-over100'), false)

  // Per-mod magnitude thresholds keyed by mod id. Values persist when a mod is
  // unchecked (mirrors poe2.re) and only affect output while the mod is selected.
  const [wantValues, setWantValues] = usePersistedJSON<Record<number, number>>(key('waystone-want-values'), {})
  const [avoidValues, setAvoidValues] = usePersistedJSON<Record<number, number>>(key('waystone-avoid-values'), {})

  // ---- Ephemeral UI state ---------------------------------------------------
  const [tab, setTab] = useState<Tab>('qualifiers')
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [avoidCollapsed, setAvoidCollapsed] = useState<Set<string>>(new Set())
  const [wantCollapsed, setWantCollapsed] = useState<Set<string>>(new Set())

  // ---- Trade state ----------------------------------------------------------
  const trade = useRegexTrade()
  const [expandedListing, setExpandedListing] = useState<string | null>(null)
  const [actionStatus, setActionStatus] = useState<Record<string, 'pending' | 'success' | 'failed'>>({})
  const { loggedIn } = useAuth()
  const [tradePanel, setTradePanel] = useState<TradePanel>(null)

  const priceChipMinWidth = useMemo(() => {
    const maxDigits = trade.listings.reduce((max, l) => Math.max(max, l.price ? String(l.price.amount).length : 0), 0)
    return 38 + maxDigits * 9
  }, [trade.listings])

  // Build derived regex
  const tier: WaystoneTier = { min: tierMin, max: tierMax }
  const rarity: WaystoneRarity = { corrupted, uncorrupted }
  const qualifiers: WaystoneQualifiers = { delirious, anyPack }
  const quantities: WaystoneQuantities = {
    packSize: packSize || null,
    monsterEffectiveness: monsterEffectiveness || null,
    monsterRarity: monsterRarity || null,
    itemRarity: itemRarity || null,
    dropChance: dropChance || null,
  }
  const regex = buildWaystoneRegex({
    mods: WAYSTONE_MODS,
    tier,
    rarity,
    qualifiers,
    quantities,
    selections: { want, avoid, wantMode, wantValues, avoidValues },
    round10,
    over100,
  })

  useEffect(() => {
    onRegexChange(regex)
  }, [regex, onRegexChange])

  // Snapshot of all tag-affecting state in one place. Used both to drive the
  // auto-tag emit effect and the matchesPreset comparison below; keeping the
  // shape co-located avoids two slightly-different copies drifting apart.
  const tagState = useMemo(
    () => ({
      want,
      avoid,
      tier: { min: tierMin, max: tierMax },
      rarity: { corrupted, uncorrupted },
      delirious,
      anyPack,
      quantities: { packSize, monsterEffectiveness, monsterRarity, itemRarity, dropChance },
      wantValues,
      avoidValues,
    }),
    [
      want,
      avoid,
      tierMin,
      tierMax,
      corrupted,
      uncorrupted,
      delirious,
      anyPack,
      packSize,
      monsterEffectiveness,
      monsterRarity,
      itemRarity,
      dropChance,
      wantValues,
      avoidValues,
    ],
  )

  // Push auto-tags up to the container whenever a tag-relevant input changes.
  // Use a ref to keep the callback identity out of the dep list -- we only want
  // to re-emit on actual state changes, not when the parent re-renders.
  const onAutoTagsChangeRef = useRef(onAutoTagsChange)
  useEffect(() => {
    onAutoTagsChangeRef.current = onAutoTagsChange
  }, [onAutoTagsChange])
  useEffect(() => {
    onAutoTagsChangeRef.current(generateWaystonePresetTags(tagState))
  }, [tagState])

  // ---- Trade search ---------------------------------------------------------
  const handlePick = async (pickedTier: number): Promise<void> => {
    const avoidTexts = WAYSTONE_MODS.filter((m) => avoid.has(m.id)).map((m) => m.text)
    const wantTexts = WAYSTONE_MODS.filter((m) => want.has(m.id)).map((m) => m.text)
    await trade.runSearch(() =>
      window.api.waystoneRegexTrade({
        tier: pickedTier,
        avoidTexts,
        wantTexts,
        wantMode,
        wantValues,
        avoidValues,
        qualifiers: { corrupted, uncorrupted, delirious, anyPack },
        quantities: { packSize, monsterEffectiveness, monsterRarity, itemRarity, dropChance },
      }),
    )
    setTradePanel('results')
  }

  // Imperative handle for save/load.
  useImperativeHandle(
    ref,
    () => ({
      closePanels: () => {
        setSearchOpen(false)
        setSearch('')
        setTradePanel(null)
      },
      getPresetPayload: () => ({
        avoid: [...avoid],
        want: [...want],
        wantMode,
        wantValues,
        avoidValues,
        // Stash waystone scalar/boolean qualifiers in `qualifiers`; wantValues/avoidValues
        // are real RegexPreset fields because they're mod-id-keyed maps, not flat scalars.
        qualifiers: {
          tierMin,
          tierMax,
          corrupted: corrupted ? 1 : 0,
          uncorrupted: uncorrupted ? 1 : 0,
          delirious: delirious ? 1 : 0,
          anyPack: anyPack ? 1 : 0,
          packSize,
          monsterEffectiveness,
          monsterRarity,
          itemRarity,
          dropChance,
          round10: round10 ? 1 : 0,
          over100: over100 ? 1 : 0,
        } as Record<string, number>,
      }),
      applyPreset: (preset: RegexPreset) => {
        setAvoid(new Set(preset.avoid))
        setWant(new Set(preset.want))
        setWantMode(preset.wantMode)
        const q = preset.qualifiers ?? {}
        setTierMin(q.tierMin && q.tierMin > 0 ? q.tierMin : 1)
        setTierMax(q.tierMax && q.tierMax > 0 ? q.tierMax : 16)
        setCorrupted(!!q.corrupted)
        setUncorrupted(!!q.uncorrupted)
        setDelirious(!!q.delirious)
        setAnyPack(!!q.anyPack)
        setPackSize(q.packSize ?? 0)
        setMonsterEffectiveness(q.monsterEffectiveness ?? 0)
        setMonsterRarity(q.monsterRarity ?? 0)
        setItemRarity(q.itemRarity ?? 0)
        setDropChance(q.dropChance ?? 0)
        setRound10(!!q.round10)
        setOver100(!!q.over100)
        setWantValues(preset.wantValues ?? {})
        setAvoidValues(preset.avoidValues ?? {})
      },
      // Match by sorted auto-tag set (ignoring user-added custom tags), so a "save"
      // becomes an "update" when the current state already corresponds to a saved
      // preset. Same shape as MapsGenerator's matchesPreset.
      matchesPreset: (preset: RegexPreset) => {
        if ((preset.generator ?? 'maps') !== 'waystones') return false
        const fresh = generateWaystonePresetTags(tagState)
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
    // tagState collapses everything getPresetPayload + matchesPreset read EXCEPT
    // wantMode, round10, and over100 (which feed the engine/payload but not the
    // auto-tag set), so we list those explicitly alongside tagState.
    [tagState, wantMode, round10, over100],
  )

  // Mod row helpers
  // ModList runs `formatModText` on every row's text, so we pass `mod.text` through
  // verbatim and let the canonical formatter handle both the number-collapse and
  // the `|` -> ` - ` separator. The search filter uses the same formatter so
  // typed substrings match the rendered text.
  //
  // A mod already selected in the opposite column is hidden here: a token can't be
  // both wanted (positive match) and avoided (negated) at once, so once it's picked
  // on one side it drops out of the other side's list. `tab === 'qualifiers'` falls
  // through to hiding `want`, but that branch never renders a ModList so it's moot.
  const oppositeSet = tab === 'avoid' ? want : avoid
  const visible = (m: { id: number; text: string }): boolean =>
    !oppositeSet.has(m.id) && (!search || formatModText(m.text).toLowerCase().includes(search.toLowerCase()))
  const filteredPrefixes = PREFIX_MODS.filter(visible)
  const filteredSuffixes = SUFFIX_MODS.filter(visible)

  const tabColor = tab === 'avoid' ? TAB_COLORS.avoid : TAB_COLORS.want
  const prefixesGroup = {
    label: 'Prefixes',
    key: 'prefixes',
    mods: filteredPrefixes.map((m) => ({ id: m.id, text: m.text })),
    color: tabColor,
  }
  const suffixesGroup = {
    label: 'Suffixes',
    key: 'suffixes',
    mods: filteredSuffixes.map((m) => ({ id: m.id, text: m.text })),
    color: tabColor,
  }
  const modGroups = [prefixesGroup, suffixesGroup].filter((g) => g.mods.length > 0)

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

  const selected = tab === 'avoid' ? avoid : want
  const setSelected = tab === 'avoid' ? setAvoid : setWant
  const toggle = (id: string | number): void => {
    const numId = typeof id === 'string' ? Number(id) : id
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(numId)) next.delete(numId)
      else next.add(numId)
      return next
    })
  }

  const values = tab === 'avoid' ? avoidValues : wantValues
  const setValues = tab === 'avoid' ? setAvoidValues : setWantValues
  const onValueChange = (id: string | number, v: number | null): void => {
    const numId = Number(id)
    setValues((prev) => {
      const next = { ...prev }
      if (v == null) delete next[numId]
      else next[numId] = v
      return next
    })
  }

  // Only count tier as "active" when the user has narrowed it beyond the full 1-16
  // span. Defaults of 1/16 produce no tier regex, so they shouldn't show as active.
  const tierActive = tierMin > 1 || tierMax < 16
  const quantityActiveCount = [packSize, monsterEffectiveness, monsterRarity, itemRarity, dropChance].filter(
    (v) => v > 0,
  ).length
  const qualifierActiveCount =
    (tierActive ? 1 : 0) +
    (corrupted || uncorrupted ? 1 : 0) +
    quantityActiveCount +
    (delirious ? 1 : 0) +
    (anyPack ? 1 : 0) +
    (round10 ? 1 : 0) +
    (over100 ? 1 : 0)

  const showTradeResults = tradePanel === 'results'

  // "Quantity & yield" rows: label + current value + setter. 0 = no constraint.
  const quantityRows: Array<[string, number, (n: number) => void]> = [
    ['Pack Size', packSize, setPackSize],
    ['Monster Effectiveness', monsterEffectiveness, setMonsterEffectiveness],
    ['Monster Rarity', monsterRarity, setMonsterRarity],
    ['Waystone IIR', itemRarity, setItemRarity],
    ['Waystone Drop Chance', dropChance, setDropChance],
  ]

  return (
    <>
      {/* Chip-header row (Search + shared Save/Load + Trade). */}
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
              if (searchOpen) {
                setSearchOpen(false)
                setSearch('')
              } else {
                setSearchOpen(true)
                setTradePanel(null)
                onPanelOpen?.()
              }
            }}
          />
          {sharedSaveChip}
          {sharedLoadChip}
          <FilterChip
            label={
              showTradeResults ? (
                <>
                  <Left size={12} theme="outline" fill="currentColor" /> Go Back
                </>
              ) : (
                <>
                  <Buy size={12} theme="outline" fill="currentColor" /> Trade
                </>
              )
            }
            active={tradePanel !== null}
            solidInactive={tradePanel === null && regex.trim().length > 0}
            onClick={() => {
              // From any open panel (picker or results) the chip is "Go Back" -- just
              // close, never re-run. Otherwise always re-open the tier picker so the
              // next pick runs a FRESH search reflecting the current selections, rather
              // than reopening stale cached results.
              if (tradePanel !== null) {
                setTradePanel(null)
              } else {
                setSearchOpen(false)
                setSearch('')
                setTradePanel('picker')
                onPanelOpen?.()
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

        {sharedSavePanel}
      </div>

      {sharedSavedPresets}

      {/* Trade picker panel */}
      {tradePanel === 'picker' && <WaystoneTierPicker onPick={handlePick} searching={trade.searching} />}

      {/* Trade results panel - replaces tab strip + body */}
      {showTradeResults && (
        <TradeResults
          tradeTotal={trade.total}
          tradeQueryId={trade.queryId}
          tradeLeague={trade.league}
          tradeError={trade.error}
          tradeListings={trade.listings}
          tradeRemainingIds={trade.remainingIds}
          tradeLoadMore={trade.loadMore}
          loadingMore={trade.loadingMore}
          expandedListing={expandedListing}
          setExpandedListing={setExpandedListing}
          priceChipMinWidth={priceChipMinWidth}
          loggedIn={loggedIn}
          actionStatus={actionStatus}
          setActionStatus={setActionStatus}
          rateLimitTiers={trade.rateLimitTiers}
          itemClass="Waystones"
        />
      )}

      {/* Normal body: tab strip + qualifiers/mod list. Hidden when trade results are shown. */}
      {!showTradeResults && (
        <>
          {/* Tab strip */}
          <div className="flex gap-1 px-2 pt-1 pb-0 bg-bg-card">
            {(['qualifiers', 'avoid', 'want'] as const).map((t) => {
              const isActive = tab === t
              const color = TAB_COLORS[t]
              const count = t === 'avoid' ? avoid.size : t === 'want' ? want.size : qualifierActiveCount
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

          {tab === 'want' && (
            <div
              className="flex items-center gap-[6px] px-3 py-[6px] border-b border-border"
              style={{ background: 'var(--bg-solid)' }}
            >
              <div className="flex-1" />
              <div className="flex justify-end gap-[6px]">
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

          {tab === 'qualifiers' && (
            <div className="flex-1 overflow-y-auto bg-bg-card">
              <QualifierSection label="QUANTITY & YIELD (Regex only: broken on trade currently)">
                {quantityRows.map(([label, value, setValue], i) => (
                  <div
                    key={label}
                    className="flex items-center gap-2 px-3 py-[6px]"
                    style={{ background: i % 2 ? 'rgba(255,255,255,0.02)' : 'transparent' }}
                  >
                    <span className="text-[11px] flex-1 text-text">{label}</span>
                    <ScrubInput
                      value={value > 0 ? value : null}
                      placeholder="--"
                      step={1}
                      suffix="%"
                      onChange={(v) => setValue(v == null ? 0 : Math.max(0, v))}
                    />
                  </div>
                ))}
              </QualifierSection>

              <QualifierSection label="TIER">
                <div className="flex items-center gap-2 px-3 py-[6px]">
                  <span className="text-[11px] flex-1 text-text">Min tier</span>
                  <ScrubInput
                    value={tierMin}
                    placeholder="1"
                    step={1}
                    onChange={(v) => setTierMin(v == null ? 1 : Math.max(1, Math.min(16, v)))}
                  />
                </div>
                <div className="flex items-center gap-2 px-3 py-[6px]" style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <span className="text-[11px] flex-1 text-text">Max tier</span>
                  <ScrubInput
                    value={tierMax}
                    placeholder="16"
                    step={1}
                    onChange={(v) => setTierMax(v == null ? 16 : Math.max(1, Math.min(16, v)))}
                  />
                </div>
              </QualifierSection>

              <QualifierSection label="RARITY">
                <ToggleRow label="Corrupted" checked={corrupted} onChange={setCorrupted} />
                <ToggleRow label="Uncorrupted" checked={uncorrupted} onChange={setUncorrupted} alt />
              </QualifierSection>

              <QualifierSection label="EXTRA">
                <ToggleRow label="Players in area are #% delirious" checked={delirious} onChange={setDelirious} />
                <ToggleRow
                  label="Area contains # of any additional packs"
                  checked={anyPack}
                  onChange={setAnyPack}
                  alt
                />
              </QualifierSection>

              <QualifierSection label="OUTPUT">
                <ToggleRow
                  label="Round down to nearest 10 (saves a lot of space)"
                  checked={round10}
                  onChange={setRound10}
                />
                <ToggleRow
                  label="Match numbers over 100% (takes more space)"
                  checked={over100}
                  onChange={setOver100}
                  alt
                />
              </QualifierSection>
            </div>
          )}

          {(tab === 'avoid' || tab === 'want') && (
            <ModList
              grouped={modGroups}
              selected={selected as Set<string | number>}
              collapsed={collapsed}
              tabColor={tabColor}
              selectedTint={tab === 'avoid' ? 'rgba(239,83,80,0.08)' : 'rgba(129,199,132,0.08)'}
              toggle={toggle}
              toggleCollapse={toggleCollapse}
              values={values}
              rangeHint={waystoneRangeHint}
              onValueChange={onValueChange}
            />
          )}
        </>
      )}
    </>
  )
})

// ============================================================================
// Local UI helpers -- small structural pieces specific to the qualifiers panel.
// ============================================================================

function QualifierSection({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div>
      <div
        className="flex items-center gap-2 px-3 py-[8px] sticky-group-header sticky top-0 z-[1]"
        style={{ height: 39, boxSizing: 'border-box' }}
      >
        <span className="text-[10px] uppercase tracking-wider font-bold flex-1 text-text">{label}</span>
      </div>
      {children}
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
  alt = false,
}: {
  label: string
  checked: boolean
  onChange: (b: boolean) => void
  alt?: boolean
}): JSX.Element {
  return (
    <div
      className="flex items-center gap-2 px-3 py-[6px] cursor-pointer select-none"
      style={{ background: alt ? 'rgba(255,255,255,0.02)' : 'transparent' }}
      onClick={() => onChange(!checked)}
    >
      <RegexCheckbox checked={checked} color={TAB_COLORS.qualifiers} />
      <span className="text-[11px] flex-1" style={{ color: checked ? 'var(--text)' : 'var(--text-dim)' }}>
        {label}
      </span>
    </div>
  )
}
