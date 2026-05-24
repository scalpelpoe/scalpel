import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Search, CloseSmall } from '@icon-park/react'
import { FLASK_PREFIX, FLASK_SUFFIX } from '../../../../shared/data/regex/flask-mods'
import { generateFlaskOutput, minItemLevel } from './flask-engine'
import { getFlaskModTag, getFlaskTagColor } from './flask-preset-tags'
import { loadSet, loadStorage, useRegexKey } from './mapmods-helpers'
import { FilterChip } from '../price-check/FilterChip'
import { ModList } from './ModList'
import { ScrubInput } from './ScrubInput'
import { Toggle } from '../Toggle'
import { ErrorBanner } from '../ErrorBanner'
import { InfoChip } from '../../shared/InfoChip'
import type { RegexPreset, RegexPresetTag } from '../../../../shared/types'
import type { GeneratorHandle, GeneratorProps } from './generator-types'
import type { ModGroup } from './ModList'

// Accent color used for flask selection tinting.
const FLASK_ACCENT = '#c8a96e'
const FLASK_SELECTED_TINT = 'rgba(200,169,110,0.13)'

// Build grouped mod lists for prefix or suffix tabs. Pure function - safe to memoize.
function buildFlaskGroups(
  mods: (typeof FLASK_PREFIX)[number][],
  search: string,
  flaskHighestOnly: boolean,
  resolvedIlevel: number,
): ModGroup[] {
  const tagMap = new Map<string, { sort: number; color: string; groups: typeof mods }>()
  for (const group of mods) {
    const tagName = group.tag.name
    if (!tagMap.has(tagName)) {
      tagMap.set(tagName, { sort: group.tag.sort, color: group.tag.color, groups: [] })
    }
    tagMap.get(tagName)!.groups.push(group)
  }

  const result: ModGroup[] = []
  const sortedTags = [...tagMap.entries()].sort((a, b) => a[1].sort - b[1].sort)

  for (const [tagName, { color, groups }] of sortedTags) {
    const sortedGroups = [...groups].sort((a, b) => b.minLevel - a.minLevel)

    const filteredGroups = search
      ? sortedGroups.filter(
          (g) =>
            g.description.toLowerCase().includes(search.toLowerCase()) ||
            g.mods.some((m) => m.name.toLowerCase().includes(search.toLowerCase())),
        )
      : sortedGroups

    if (filteredGroups.length === 0) continue

    const modListMods = filteredGroups
      .map((g) => {
        if (flaskHighestOnly) {
          const possibleMods = g.mods.filter((m) => m.level <= resolvedIlevel)
          if (possibleMods.length === 0) return null
          const best = possibleMods.reduce((a, b) => (a.level > b.level ? a : b))
          return { id: g.description, text: best.value }
        } else {
          if (g.minLevel > resolvedIlevel) return null
          return { id: g.description, text: g.description }
        }
      })
      .filter((m): m is { id: string; text: string } => m !== null)

    if (modListMods.length === 0) continue

    const displayLabel = tagName.charAt(0).toUpperCase() + tagName.slice(1)
    result.push({ mods: modListMods, label: displayLabel, color, key: tagName })
  }

  return result
}

type FlaskTab = 'qualifiers' | 'prefix' | 'suffix'

/** Toggle-membership in a Set-valued state. Used by both prefix/suffix selection
 *  and the prefix/suffix collapse-key state - same shape, two callers each. */
function toggleInSet<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, value: T): void {
  setter((prev) => {
    const next = new Set(prev)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return next
  })
}

export const FlaskGenerator = forwardRef<GeneratorHandle, GeneratorProps>(function FlaskGenerator(
  { onRegexChange, onAutoTagsChange, sharedSaveChip, sharedLoadChip, sharedSavePanel, sharedSavedPresets },
  ref,
) {
  // ---- Persisted state -------------------------------------------------------
  const key = useRegexKey()
  const [tab, setTab] = useState<FlaskTab>(() =>
    loadStorage(key('flask-tab'), 'qualifiers' as FlaskTab, (s) => s as FlaskTab),
  )
  const [selectedPrefix, setSelectedPrefix] = useState<Set<string>>(() => loadSet<string>(key('flask-prefix')))
  const [selectedSuffix, setSelectedSuffix] = useState<Set<string>>(() => loadSet<string>(key('flask-suffix')))
  const [ilevel, setIlevel] = useState<number | null>(() =>
    loadStorage(key('flask-ilevel'), 85, (s) => {
      const n = parseInt(s, 10)
      return Number.isNaN(n) ? 85 : n
    }),
  )
  const [flaskHighestOnly, setFlaskHighestOnly] = useState(() =>
    loadStorage(key('flask-highest'), false, (s) => s === 'true'),
  )
  const [matchBoth, setMatchBoth] = useState(() => loadStorage(key('flask-matchboth'), false, (s) => s === 'true'))
  const [matchOpen, setMatchOpen] = useState(() => loadStorage(key('flask-matchopen'), false, (s) => s === 'true'))
  const [ignoreEffectTiers, setIgnoreEffectTiers] = useState(() =>
    loadStorage(key('flask-ignoretiers'), false, (s) => s === 'true'),
  )

  useEffect(() => {
    localStorage.setItem(key('flask-tab'), tab)
  }, [tab, key])
  useEffect(() => {
    localStorage.setItem(key('flask-prefix'), JSON.stringify([...selectedPrefix]))
  }, [selectedPrefix, key])
  useEffect(() => {
    localStorage.setItem(key('flask-suffix'), JSON.stringify([...selectedSuffix]))
  }, [selectedSuffix, key])
  useEffect(() => {
    localStorage.setItem(key('flask-ilevel'), String(ilevel ?? 85))
  }, [ilevel, key])
  useEffect(() => {
    localStorage.setItem(key('flask-highest'), String(flaskHighestOnly))
  }, [flaskHighestOnly, key])
  useEffect(() => {
    localStorage.setItem(key('flask-matchboth'), String(matchBoth))
  }, [matchBoth, key])
  useEffect(() => {
    localStorage.setItem(key('flask-matchopen'), String(matchOpen))
  }, [matchOpen, key])
  useEffect(() => {
    localStorage.setItem(key('flask-ignoretiers'), String(ignoreEffectTiers))
  }, [ignoreEffectTiers, key])

  // ---- Ephemeral UI state ----------------------------------------------------
  const [panel, setPanel] = useState<'search' | null>(null)
  const [search, setSearch] = useState('')
  const [prefixCollapsed, setPrefixCollapsed] = useState<Set<string>>(new Set())
  const [suffixCollapsed, setSuffixCollapsed] = useState<Set<string>>(new Set())

  const searchOpen = panel === 'search'

  // ---- Derived values --------------------------------------------------------
  const resolvedIlevel = ilevel ?? 85

  const settings = useMemo(
    () => ({
      selectedPrefix: [...selectedPrefix],
      selectedSuffix: [...selectedSuffix],
      ilevel: resolvedIlevel,
      flaskHighestOnly,
      matchBothPrefixAndSuffix: matchBoth,
      ignoreEffectTiers,
      matchOpenPrefixSuffix: matchOpen,
    }),
    [selectedPrefix, selectedSuffix, resolvedIlevel, flaskHighestOnly, matchBoth, ignoreEffectTiers, matchOpen],
  )

  // Pass module-level constants directly; flask-engine doesn't mutate the array.
  const regex = useMemo(() => generateFlaskOutput([...FLASK_PREFIX, ...FLASK_SUFFIX], settings), [settings])

  const ilevelWarning = useMemo(
    () => (flaskHighestOnly ? minItemLevel([...FLASK_PREFIX, ...FLASK_SUFFIX], settings) : undefined),
    [flaskHighestOnly, settings],
  )

  const prefixGroups = useMemo(
    () => buildFlaskGroups(FLASK_PREFIX, search, flaskHighestOnly, resolvedIlevel),
    [search, flaskHighestOnly, resolvedIlevel],
  )
  const suffixGroups = useMemo(
    () => buildFlaskGroups(FLASK_SUFFIX, search, flaskHighestOnly, resolvedIlevel),
    [search, flaskHighestOnly, resolvedIlevel],
  )

  // ---- Outbound reporting ----------------------------------------------------
  useEffect(() => {
    onRegexChange(regex)
  }, [regex, onRegexChange])

  const onAutoTagsChangeRef = useRef(onAutoTagsChange)
  useEffect(() => {
    onAutoTagsChangeRef.current = onAutoTagsChange
  }, [onAutoTagsChange])

  useEffect(() => {
    const tags: RegexPresetTag[] = []

    for (const desc of selectedPrefix) {
      const group = FLASK_PREFIX.find((g) => g.description === desc)
      if (!group) continue
      const color = getFlaskTagColor(group.tag.name, group.tag.color)
      tags.push({ text: getFlaskModTag(desc), color, source: 'flask', sourceId: desc })
    }
    for (const desc of selectedSuffix) {
      const group = FLASK_SUFFIX.find((g) => g.description === desc)
      if (!group) continue
      const color = getFlaskTagColor(group.tag.name, group.tag.color)
      tags.push({ text: getFlaskModTag(desc), color, source: 'flask', sourceId: desc })
    }

    if (flaskHighestOnly) tags.push({ text: 'highest level', color: FLASK_ACCENT })
    if (matchBoth) tags.push({ text: 'both required', color: FLASK_ACCENT })
    if (matchOpen) tags.push({ text: 'open affixes', color: FLASK_ACCENT })
    if (ignoreEffectTiers) tags.push({ text: 'ignore-eff-tiers', color: FLASK_ACCENT })

    onAutoTagsChangeRef.current(tags)
  }, [selectedPrefix, selectedSuffix, flaskHighestOnly, matchBoth, matchOpen, ignoreEffectTiers])

  // ---- Toggle helpers --------------------------------------------------------
  // ModList passes `id: string | number` for generality; flask ids are strings.
  const togglePrefix = (id: string | number): void => toggleInSet(setSelectedPrefix, String(id))
  const toggleSuffix = (id: string | number): void => toggleInSet(setSelectedSuffix, String(id))

  // ---- Imperative handle -----------------------------------------------------
  useImperativeHandle(
    ref,
    () => ({
      getPresetPayload: () => ({
        selectedPrefix: [...selectedPrefix],
        selectedSuffix: [...selectedSuffix],
        flaskIlevel: resolvedIlevel,
        flaskHighestOnly,
        flaskMatchBoth: matchBoth,
        flaskMatchOpen: matchOpen,
        flaskIgnoreEffectTiers: ignoreEffectTiers,
      }),
      applyPreset: (preset: RegexPreset) => {
        setSelectedPrefix(new Set(preset.selectedPrefix ?? []))
        setSelectedSuffix(new Set(preset.selectedSuffix ?? []))
        setIlevel(preset.flaskIlevel ?? 85)
        setFlaskHighestOnly(preset.flaskHighestOnly ?? false)
        setMatchBoth(preset.flaskMatchBoth ?? false)
        setMatchOpen(preset.flaskMatchOpen ?? false)
        setIgnoreEffectTiers(preset.flaskIgnoreEffectTiers ?? false)
      },
      matchesPreset: (preset: RegexPreset) => {
        if ((preset.generator ?? 'maps') !== 'flasks') return false
        const prefixMatch =
          selectedPrefix.size === (preset.selectedPrefix ?? []).length &&
          (preset.selectedPrefix ?? []).every((d) => selectedPrefix.has(d))
        const suffixMatch =
          selectedSuffix.size === (preset.selectedSuffix ?? []).length &&
          (preset.selectedSuffix ?? []).every((d) => selectedSuffix.has(d))
        return (
          prefixMatch &&
          suffixMatch &&
          resolvedIlevel === (preset.flaskIlevel ?? 85) &&
          flaskHighestOnly === (preset.flaskHighestOnly ?? false) &&
          matchBoth === (preset.flaskMatchBoth ?? false) &&
          matchOpen === (preset.flaskMatchOpen ?? false) &&
          ignoreEffectTiers === (preset.flaskIgnoreEffectTiers ?? false)
        )
      },
    }),
    [selectedPrefix, selectedSuffix, resolvedIlevel, flaskHighestOnly, matchBoth, matchOpen, ignoreEffectTiers],
  )

  // ---- Render ----------------------------------------------------------------
  return (
    <>
      {/* Chip header row */}
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
              setPanel(searchOpen ? null : 'search')
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

        {/* Shared save panel */}
        {sharedSavePanel}
      </div>

      {/* Min-ilevel warning banner */}
      <ErrorBanner message={ilevelWarning ?? null} tone="warn" inline />

      {/* Saved presets strip */}
      {sharedSavedPresets}

      {/* Tab strip */}
      <div className="flex gap-1 px-2 pt-1 pb-0 bg-bg-card">
        {(['qualifiers', 'prefix', 'suffix'] as const).map((t) => {
          const isActive = tab === t
          const count = t === 'prefix' ? selectedPrefix.size : t === 'suffix' ? selectedSuffix.size : 0
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 flex items-center justify-between px-3 text-[11px] py-[5px] border-none cursor-pointer transition-colors relative ${isActive ? 'regex-tab-active' : ''}`}
              style={{
                background: isActive ? 'var(--bg-solid)' : 'transparent',
                color: isActive ? FLASK_ACCENT : 'var(--text-dim)',
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
              <span>{t === 'qualifiers' ? 'Qualifiers' : t === 'prefix' ? 'Prefix' : 'Suffix'}</span>
              {count > 0 && (
                <span style={{ transform: 'translateY(1px)' }}>
                  <InfoChip color={FLASK_ACCENT}>
                    <span className="font-bold">{count}</span>
                  </InfoChip>
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* List header row: Highest Level Only chip on prefix/suffix; an empty placeholder
          on qualifiers so all three tabs render the same vertical strip and switching
          tabs doesn't jump the layout. Lives ABOVE the tab body so qualifiers' flex-1
          body doesn't push it to the bottom of the panel. */}
      <div
        className="flex items-center gap-[6px] px-3 py-[6px] border-b border-border"
        style={{ background: 'var(--bg-solid)', minHeight: 40 }}
      >
        {(tab === 'prefix' || tab === 'suffix') && (
          <FilterChip
            label="Highest Level Only"
            active={flaskHighestOnly}
            onClick={() => setFlaskHighestOnly((v) => !v)}
          />
        )}
      </div>

      {/* Tab body: Qualifiers */}
      {tab === 'qualifiers' && (
        <div className="flex-1 overflow-y-auto bg-bg-card px-3 py-3 flex flex-col gap-3">
          {/* ilevel scrub */}
          <div
            className="flex items-center gap-2 px-3 py-[6px] rounded min-h-[40px]"
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            <span className="text-[11px] flex-1" style={{ color: 'var(--text-dim)' }}>
              Flask item level
            </span>
            <ScrubInput value={ilevel} onChange={(val) => setIlevel(val ?? 85)} min={1} max={86} defaultValue={85} />
          </div>

          {/* Toggle rows -- gold switch in a rounded box, matching the ilevel row above */}
          <div
            className="flex items-center gap-2 px-3 py-[6px] rounded min-h-[40px] cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.02)' }}
            onClick={() => setMatchBoth((v) => !v)}
          >
            <span className="text-[11px] flex-1" style={{ color: 'var(--text-dim)' }}>
              Require that both prefix and suffix match
            </span>
            <div onClick={(e) => e.stopPropagation()}>
              <Toggle checked={matchBoth} onChange={setMatchBoth} />
            </div>
          </div>
          <div
            className="flex items-center gap-2 px-3 py-[6px] rounded min-h-[40px] cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.02)' }}
            onClick={() => setMatchOpen((v) => !v)}
          >
            <span className="text-[11px] flex-1" style={{ color: 'var(--text-dim)' }}>
              Match open prefix or open suffix
            </span>
            <div onClick={(e) => e.stopPropagation()}>
              <Toggle checked={matchOpen} onChange={setMatchOpen} />
            </div>
          </div>
          <div
            className="flex items-center gap-2 px-3 py-[6px] rounded min-h-[40px] cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.02)' }}
            onClick={() => setIgnoreEffectTiers((v) => !v)}
          >
            <span className="text-[11px] flex-1" style={{ color: 'var(--text-dim)' }}>
              Ignore tier for increased effect flasks (useful when rolling flasks for Mageblood)
            </span>
            <div onClick={(e) => e.stopPropagation()}>
              <Toggle checked={ignoreEffectTiers} onChange={setIgnoreEffectTiers} />
            </div>
          </div>
        </div>
      )}

      {/* Tab body: Prefix */}
      {tab === 'prefix' && (
        <ModList
          grouped={prefixGroups}
          selected={selectedPrefix as Set<string | number>}
          collapsed={prefixCollapsed}
          tabColor={FLASK_ACCENT}
          selectedTint={FLASK_SELECTED_TINT}
          toggle={togglePrefix}
          toggleCollapse={(key) => toggleInSet(setPrefixCollapsed, key)}
        />
      )}

      {/* Tab body: Suffix */}
      {tab === 'suffix' && (
        <ModList
          grouped={suffixGroups}
          selected={selectedSuffix as Set<string | number>}
          collapsed={suffixCollapsed}
          tabColor={FLASK_ACCENT}
          selectedTint={FLASK_SELECTED_TINT}
          toggle={toggleSuffix}
          toggleCollapse={(key) => toggleInSet(setSuffixCollapsed, key)}
        />
      )}
    </>
  )
})
