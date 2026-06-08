import { Fragment, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Components, AddOne, Search, CloseSmall, Buy, Left } from '@icon-park/react'
import {
  TAB_COLORS,
  RegexCheckbox,
  TabSeparator,
  formatModText,
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
import { TABLET_MODS } from '../../../../shared/data/regex/tablet-mods'
import { buildTabletRegex } from './tablet-engine'
import { generateTabletPresetTags, TYPE_LABELS, type TabletTagState } from './tablet-preset-tags'
import { useRegexTrade } from './useRegexTrade'
import { TradeResults } from './TradeResults'
import { useAuth } from '../../shared/use-auth'
import type { RegexPreset } from '../../../../shared/types'
import type { GeneratorHandle, GeneratorProps } from './generator-types'

type CategoryTab = 'affixes' | 'qualifiers'
type WantMode = 'any' | 'all'

/** Tag -> section label + order for the Affixes list. Mods carry raw tags from the
 *  generated data; we render a section per tag a mod belongs to. */
const TAG_SECTIONS: Array<[string, string]> = [
  ['default', 'General'],
  ['breach', 'Breach'],
  ['delirium', 'Delirium'],
  ['expedition', 'Expedition'],
  ['ritual', 'Ritual'],
  ['abyss', 'Abyss'],
  ['incursion', 'Incursion'],
  ['map_boss', 'Map Boss'],
]

function tabletRangeHint(id: string | number): string | undefined {
  const mod = TABLET_MODS.find((m) => m.id === Number(id))
  if (!mod || mod.ranges[0]?.length !== 2) return undefined
  return `${mod.ranges[0][0]}-${mod.ranges[0][1]}`
}

export const TabletGenerator = forwardRef<GeneratorHandle, GeneratorProps>(function TabletGenerator(
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

  const [want, setWant] = usePersistedSet<number>(key('tablet-want'))
  const [wantMode, setWantMode] = usePersistedString<WantMode>(key('tablet-want-mode'), 'any')
  const [wantValues, setWantValues] = usePersistedJSON<Record<number, number>>(key('tablet-want-values'), {})
  const [collapsed, setCollapsed] = usePersistedJSON<string[]>(key('tablet-collapsed'), [])

  const [normal, setNormal] = usePersistedBool(key('tablet-normal'), false)
  const [magic, setMagic] = usePersistedBool(key('tablet-magic'), false)
  const [typeFlags, setTypeFlags] = usePersistedJSON<Record<string, boolean>>(key('tablet-type'), {})
  const [usesEnabled, setUsesEnabled] = usePersistedBool(key('tablet-uses-enabled'), false)
  const [usesValue, setUsesValue] = usePersistedNumber(key('tablet-uses-value'), 1)
  const [round10, setRound10] = usePersistedBool(key('tablet-round10'), false)

  const [tab, setTab] = useState<CategoryTab>('qualifiers')
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [showTradeResults, setShowTradeResults] = useState(false)

  // ---- Trade state -----------------------------------------------------------
  const trade = useRegexTrade()
  const [expandedListing, setExpandedListing] = useState<string | null>(null)
  const [actionStatus, setActionStatus] = useState<Record<string, 'pending' | 'success' | 'failed'>>({})
  const { loggedIn } = useAuth()

  const priceChipMinWidth = useMemo(() => {
    const maxDigits = trade.listings.reduce((max, l) => Math.max(max, l.price ? String(l.price.amount).length : 0), 0)
    return 38 + maxDigits * 9
  }, [trade.listings])

  const type = {
    breach: !!typeFlags.breach,
    delirium: !!typeFlags.delirium,
    irradiated: !!typeFlags.irradiated,
    expedition: !!typeFlags.expedition,
    ritual: !!typeFlags.ritual,
    overseer: !!typeFlags.overseer,
  }

  const regex = buildTabletRegex({
    mods: TABLET_MODS,
    rarity: { normal, magic },
    type,
    uses: { enabled: usesEnabled, value: usesValue },
    selections: { want, wantMode, wantValues },
    round10,
  })

  useEffect(() => {
    onRegexChange(regex)
  }, [regex, onRegexChange])

  const tagState: TabletTagState = useMemo(
    () => ({ want, rarity: { normal, magic }, type, uses: { enabled: usesEnabled, value: usesValue } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [want, normal, magic, typeFlags, usesEnabled, usesValue],
  )

  const onAutoTagsChangeRef = useRef(onAutoTagsChange)
  useEffect(() => {
    onAutoTagsChangeRef.current = onAutoTagsChange
  }, [onAutoTagsChange])
  useEffect(() => {
    onAutoTagsChangeRef.current(generateTabletPresetTags(tagState, TABLET_MODS))
  }, [tagState])

  useImperativeHandle(
    ref,
    () => ({
      closePanels: () => {
        setSearchOpen(false)
        setSearch('')
        setShowTradeResults(false)
      },
      getPresetPayload: () => ({
        avoid: [],
        want: [...want],
        wantMode,
        wantValues,
        qualifiers: {
          normal: normal ? 1 : 0,
          magic: magic ? 1 : 0,
          breach: type.breach ? 1 : 0,
          delirium: type.delirium ? 1 : 0,
          irradiated: type.irradiated ? 1 : 0,
          expedition: type.expedition ? 1 : 0,
          ritual: type.ritual ? 1 : 0,
          overseer: type.overseer ? 1 : 0,
          usesEnabled: usesEnabled ? 1 : 0,
          usesValue,
          round10: round10 ? 1 : 0,
        } as Record<string, number>,
      }),
      applyPreset: (preset: RegexPreset) => {
        setWant(new Set(preset.want))
        setWantMode((preset.wantMode as WantMode) ?? 'any')
        setWantValues(preset.wantValues ?? {})
        const q = preset.qualifiers ?? {}
        setNormal(!!q.normal)
        setMagic(!!q.magic)
        setTypeFlags({
          breach: !!q.breach,
          delirium: !!q.delirium,
          irradiated: !!q.irradiated,
          expedition: !!q.expedition,
          ritual: !!q.ritual,
          overseer: !!q.overseer,
        })
        setUsesEnabled(!!q.usesEnabled)
        setUsesValue(q.usesValue && q.usesValue > 0 ? q.usesValue : 1)
        setRound10(!!q.round10)
      },
      matchesPreset: (preset: RegexPreset) => {
        if ((preset.generator ?? 'maps') !== 'tablet') return false
        const fresh = generateTabletPresetTags(tagState, TABLET_MODS)
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
    [tagState, wantMode, wantValues, round10],
  )

  const toggle = (id: string | number): void => {
    const numId = Number(id)
    setWant((prev) => {
      const next = new Set(prev)
      if (next.has(numId)) next.delete(numId)
      else next.add(numId)
      return next
    })
  }
  const onValueChange = (id: string | number, v: number | null): void => {
    const numId = Number(id)
    setWantValues((prev) => {
      const next = { ...prev }
      if (v == null) delete next[numId]
      else next[numId] = v
      return next
    })
  }
  const toggleCollapse = (k: string): void => {
    setCollapsed((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
  }
  const setType = (k: string, v: boolean): void => setTypeFlags((prev) => ({ ...prev, [k]: v }))

  // Build tag-grouped affix sections (a mod appears under each tag it carries),
  // filtered by search on the rendered text.
  const matches = (text: string): boolean => !search || formatModText(text).toLowerCase().includes(search.toLowerCase())
  // Tag sections whose tag matches a selected Type qualifier (e.g. Breach) float to
  // the top so the relevant affixes lead the list. Stable sort keeps the original
  // TAG_SECTIONS order within the promoted and non-promoted groups.
  const promotedTags = new Set(TYPE_LABELS.filter(([k]) => type[k]).map(([k]) => k as string))
  const grouped = TAG_SECTIONS.map(([tagKey, label]) => ({
    label,
    key: tagKey,
    color: TAB_COLORS.want,
    mods: TABLET_MODS.filter((m) => m.tags.includes(tagKey) && matches(m.text)).map((m) => ({
      id: m.id,
      text: m.text,
    })),
  }))
    .filter((g) => g.mods.length > 0)
    .sort((a, b) => (promotedTags.has(a.key) ? 0 : 1) - (promotedTags.has(b.key) ? 0 : 1))

  const qualifierCount =
    (normal || magic ? 1 : 0) +
    TYPE_LABELS.reduce((n, [k]) => n + (type[k] ? 1 : 0), 0) +
    (usesEnabled ? 1 : 0) +
    (round10 ? 1 : 0)

  return (
    <>
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
                setShowTradeResults(false)
                setSearchOpen(true)
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
            active={showTradeResults}
            solidInactive={!showTradeResults && regex.trim().length > 0}
            onClick={async () => {
              if (showTradeResults) {
                setShowTradeResults(false)
                return
              }
              setSearchOpen(false)
              setSearch('')
              const wantTexts = TABLET_MODS.filter((m) => want.has(m.id)).map((m) => m.text)
              setExpandedListing(null)
              setActionStatus({})
              await trade.runSearch(() =>
                window.api.tabletRegexTrade({
                  wantTexts,
                  wantMode,
                  wantValues,
                  rarity: { normal, magic },
                  typeFlags,
                  uses: { enabled: usesEnabled, value: usesValue },
                }),
              )
              setShowTradeResults(true)
            }}
          />
        </div>
        <div
          className="overflow-hidden transition-all duration-150"
          style={{ maxHeight: searchOpen ? 40 : 0, marginTop: searchOpen ? 8 : 0, opacity: searchOpen ? 1 : 0 }}
        >
          <div className="relative">
            <input
              type="text"
              placeholder="Search affixes..."
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
          itemClass="Tablet"
        />
      )}

      {/* Category tab strip */}
      {!showTradeResults && (
        <div className="flex gap-1 px-2 pt-1 pb-0 bg-bg-card">
          {(
            [
              ['qualifiers', 'Qualifiers', AddOne, qualifierCount],
              ['affixes', 'Affixes', Components, want.size],
            ] as const
          ).map(([k, label, Icon, count], i, arr) => {
            const isActive = tab === k
            const showSep = i > 0 && !isActive && tab !== arr[i - 1][0]
            return (
              <Fragment key={k}>
                {showSep && <TabSeparator />}
                <button
                  onClick={() => setTab(k)}
                  className={`flex-1 flex items-center justify-between px-3 text-[11px] py-[5px] border-none cursor-pointer transition-colors relative ${isActive ? 'regex-tab-active' : ''}`}
                  style={{
                    background: isActive ? 'var(--bg-solid)' : 'transparent',
                    color: isActive ? TAB_COLORS.qualifiers : 'var(--text-dim)',
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
                    <Icon size={15} theme="two-tone" fill={['currentColor', 'rgba(255,255,255,0.2)']} />
                    {label}
                  </span>
                  {count > 0 && (
                    <span style={{ transform: 'translateY(1px)' }}>
                      <InfoChip color={TAB_COLORS.qualifiers}>
                        <span className="font-bold">{count}</span>
                      </InfoChip>
                    </span>
                  )}
                </button>
              </Fragment>
            )
          })}
        </div>
      )}

      {!showTradeResults && tab === 'affixes' && (
        <div
          className="flex items-center justify-end gap-[6px] px-3 py-[6px] border-b border-border"
          style={{ background: 'var(--bg-solid)' }}
        >
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
      )}

      {!showTradeResults && tab === 'affixes' && (
        <ModList
          grouped={grouped}
          selected={want as Set<string | number>}
          collapsed={new Set(collapsed)}
          tabColor={TAB_COLORS.want}
          selectedTint="rgba(129,199,132,0.08)"
          toggle={toggle}
          toggleCollapse={toggleCollapse}
          values={wantValues}
          rangeHint={tabletRangeHint}
          onValueChange={onValueChange}
        />
      )}

      {!showTradeResults && tab === 'qualifiers' && (
        <div className="flex-1 overflow-y-auto bg-bg-card">
          <QualifierSection label="RARITY">
            <ToggleRow label="Normal" checked={normal} onChange={setNormal} />
            <ToggleRow label="Magic" checked={magic} onChange={setMagic} alt />
          </QualifierSection>
          <QualifierSection label="TYPE">
            {TYPE_LABELS.map(([k, label], i) => (
              <ToggleRow key={k} label={label} checked={type[k]} onChange={(v) => setType(k, v)} alt={i % 2 === 1} />
            ))}
          </QualifierSection>
          <QualifierSection label="USES REMAINING">
            <div className="flex items-center gap-2 px-3 py-[6px]">
              <div
                className="flex items-center gap-2 flex-1 cursor-pointer select-none"
                onClick={() => setUsesEnabled(!usesEnabled)}
              >
                <RegexCheckbox checked={usesEnabled} color={TAB_COLORS.qualifiers} />
                <span className="text-[11px]" style={{ color: usesEnabled ? 'var(--text)' : 'var(--text-dim)' }}>
                  Minimum uses remaining
                </span>
              </div>
              <ScrubInput
                value={usesValue}
                placeholder="1"
                step={1}
                min={1}
                max={18}
                onChange={(v) => setUsesValue(v == null ? 1 : Math.max(1, Math.min(18, v)))}
              />
            </div>
          </QualifierSection>
          <QualifierSection label="OUTPUT">
            <ToggleRow label="Round down to nearest 10 (saves space)" checked={round10} onChange={setRound10} />
          </QualifierSection>
        </div>
      )}
    </>
  )
})

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
