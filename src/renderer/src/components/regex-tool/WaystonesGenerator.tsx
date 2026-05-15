import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { AddOne, Forbid, CheckOne, Search, CloseSmall } from '@icon-park/react'
import {
  TAB_COLORS,
  formatModText,
  useRegexKey,
  usePersistedSet,
  usePersistedString,
  usePersistedNumber,
  usePersistedBool,
} from './mapmods-helpers'
import { FilterChip } from '../price-check/FilterChip'
import { ModList } from './ModList'
import { ScrubInput } from './ScrubInput'
import { InfoChip } from '../../shared/InfoChip'
import { WAYSTONE_MODS } from '../../../../shared/data/regex/waystone-mods'
import { buildWaystoneRegex, type WaystoneQualifiers, type WaystoneRarity, type WaystoneTier } from './waystone-engine'
import { generateWaystonePresetTags } from './waystone-preset-tags'
import type { RegexPreset } from '../../../../shared/types'
import type { GeneratorHandle, GeneratorProps } from './generator-types'

type Tab = 'qualifiers' | 'avoid' | 'want'
type WantMode = 'any' | 'all'

const PREFIX_MODS = WAYSTONE_MODS.filter((m) => m.affix === 'PREFIX')
const SUFFIX_MODS = WAYSTONE_MODS.filter((m) => m.affix === 'SUFFIX')

export const WaystonesGenerator = forwardRef<GeneratorHandle, GeneratorProps>(function WaystonesGenerator(
  { onRegexChange, onAutoTagsChange, sharedSaveChip, sharedLoadChip, sharedSavePanel, sharedSavedPresets },
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

  // Drop-chance / monster-pack qualifier flags.
  const [dropOverEnabled, setDropOverEnabled] = usePersistedBool(key('waystone-drop-over-enabled'), false)
  const [dropOverValue, setDropOverValue] = usePersistedNumber(key('waystone-drop-over-value'), 100)
  const [delirious, setDelirious] = usePersistedBool(key('waystone-delirious'), false)
  const [anyPack, setAnyPack] = usePersistedBool(key('waystone-any-pack'), false)

  // ---- Ephemeral UI state ---------------------------------------------------
  const [tab, setTab] = useState<Tab>('qualifiers')
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  // Build derived regex
  const tier: WaystoneTier = { min: tierMin, max: tierMax }
  const rarity: WaystoneRarity = { corrupted, uncorrupted }
  const qualifiers: WaystoneQualifiers = {
    dropOverEnabled,
    dropOverValue,
    delirious,
    anyPack,
  }
  const regex = buildWaystoneRegex({
    mods: WAYSTONE_MODS,
    tier,
    rarity,
    qualifiers,
    selections: { want, avoid, wantMode },
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
      dropOverEnabled,
      dropOverValue,
      delirious,
      anyPack,
    }),
    [want, avoid, tierMin, tierMax, corrupted, uncorrupted, dropOverEnabled, dropOverValue, delirious, anyPack],
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

  // Imperative handle for save/load.
  useImperativeHandle(
    ref,
    () => ({
      getPresetPayload: () => ({
        avoid: [...avoid],
        want: [...want],
        wantMode,
        // Stash waystone qualifiers in `qualifiers` so we don't widen RegexPreset.
        // Numeric fields only -- corrupted/uncorrupted/delirious/etc. round-trip via
        // 0/1 ints. The applyPreset side reads them back into booleans.
        qualifiers: {
          tierMin,
          tierMax,
          corrupted: corrupted ? 1 : 0,
          uncorrupted: uncorrupted ? 1 : 0,
          dropOverEnabled: dropOverEnabled ? 1 : 0,
          dropOverValue,
          delirious: delirious ? 1 : 0,
          anyPack: anyPack ? 1 : 0,
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
        setDropOverEnabled(!!q.dropOverEnabled)
        setDropOverValue(q.dropOverValue ?? 100)
        setDelirious(!!q.delirious)
        setAnyPack(!!q.anyPack)
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
    // wantMode (which feeds the engine but not the auto-tag set), so we list both.
    [tagState, wantMode],
  )

  // Mod row helpers
  // ModList runs `formatModText` on every row's text, so we pass `mod.text` through
  // verbatim and let the canonical formatter handle both the number-collapse and
  // the `|` -> ` - ` separator. The search filter uses the same formatter so
  // typed substrings match the rendered text.
  const filteredPrefixes = search
    ? PREFIX_MODS.filter((m) => formatModText(m.text).toLowerCase().includes(search.toLowerCase()))
    : PREFIX_MODS
  const filteredSuffixes = search
    ? SUFFIX_MODS.filter((m) => formatModText(m.text).toLowerCase().includes(search.toLowerCase()))
    : SUFFIX_MODS

  const wantGroup = [
    {
      label: 'Prefixes',
      color: TAB_COLORS.want,
      key: 'prefixes',
      mods: filteredPrefixes.map((m) => ({ id: m.id, text: m.text })),
    },
  ].filter((g) => g.mods.length > 0)
  const avoidGroup = [
    {
      label: 'Suffixes',
      color: TAB_COLORS.avoid,
      key: 'suffixes',
      mods: filteredSuffixes.map((m) => ({ id: m.id, text: m.text })),
    },
  ].filter((g) => g.mods.length > 0)

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

  // Only count tier as "active" when the user has narrowed it beyond the full 1-16
  // span. Defaults of 1/16 produce no tier regex, so they shouldn't show as active.
  const tierActive = tierMin > 1 || tierMax < 16
  const qualifierActiveCount =
    (tierActive ? 1 : 0) +
    (corrupted || uncorrupted ? 1 : 0) +
    (dropOverEnabled ? 1 : 0) +
    (delirious ? 1 : 0) +
    (anyPack ? 1 : 0)

  return (
    <>
      {/* Chip-header row (Search + shared Save/Load). No Trade chip in v1. */}
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
              setSearchOpen((v) => !v)
              if (searchOpen) setSearch('')
            }}
          />
          {sharedSaveChip}
          {sharedLoadChip}
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
            <div className="flex items-center gap-2 px-3 py-[6px]">
              <input
                type="checkbox"
                id="ws-drop-over"
                checked={dropOverEnabled}
                onChange={(e) => setDropOverEnabled(e.target.checked)}
              />
              <label
                htmlFor="ws-drop-over"
                className="text-[11px] flex-1 cursor-pointer"
                style={{ color: dropOverEnabled ? 'var(--text)' : 'var(--text-dim)' }}
              >
                Waystone drop chance over
              </label>
              <select
                value={dropOverValue}
                onChange={(e) => setDropOverValue(parseInt(e.target.value))}
                disabled={!dropOverEnabled}
                className="text-[11px] bg-black/30 rounded px-1 py-[2px] border-none"
              >
                {[100, 200, 300, 400, 500, 600, 700].map((v) => (
                  <option key={v} value={v}>
                    {v}%
                  </option>
                ))}
              </select>
            </div>
            <ToggleRow label="Players in area are #% delirious" checked={delirious} onChange={setDelirious} alt />
            <ToggleRow label="Area contains # of any additional packs" checked={anyPack} onChange={setAnyPack} />
          </QualifierSection>
        </div>
      )}

      {(tab === 'avoid' || tab === 'want') && (
        <ModList
          grouped={tab === 'avoid' ? avoidGroup : wantGroup}
          selected={selected as Set<string | number>}
          collapsed={new Set()}
          tabColor={tab === 'avoid' ? TAB_COLORS.avoid : TAB_COLORS.want}
          selectedTint={tab === 'avoid' ? 'rgba(239,83,80,0.08)' : 'rgba(129,199,132,0.08)'}
          toggle={toggle}
          toggleCollapse={() => {
            // Single group per tab -- collapsing is a no-op for waystones.
          }}
        />
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
  const id = `ws-toggle-${label.replace(/\s+/g, '-').toLowerCase()}`
  return (
    <div
      className="flex items-center gap-2 px-3 py-[6px]"
      style={{ background: alt ? 'rgba(255,255,255,0.02)' : 'transparent' }}
    >
      <input type="checkbox" id={id} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label
        htmlFor={id}
        className="text-[11px] flex-1 cursor-pointer"
        style={{ color: checked ? 'var(--text)' : 'var(--text-dim)' }}
      >
        {label}
      </label>
    </div>
  )
}
