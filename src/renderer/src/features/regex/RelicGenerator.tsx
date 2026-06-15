import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Search, CloseSmall } from '@icon-park/react'
import {
  TAB_COLORS,
  formatModText,
  useRegexKey,
  usePersistedSet,
  usePersistedString,
  usePersistedJSON,
} from './mapmods-helpers'
import { FilterChip } from '../../components/primitives/FilterChip'
import { ModList } from './ModList'
import { RELIC_MODS } from '@shared/data/regex/relic-mods'
import { buildRelicRegex, type RelicMatchType, type RelicSelections } from './relic-engine'
import { generateRelicPresetTags } from './relic-preset-tags'
import type { RegexPreset } from '@shared/types'
import type { GeneratorHandle, GeneratorProps } from './generator-types'

const PREFIX_MODS = RELIC_MODS.filter((m) => m.affix === 'PREFIX')
const SUFFIX_MODS = RELIC_MODS.filter((m) => m.affix === 'SUFFIX')

/** "min-max" hint for a ranged mod's value input, or undefined for the two
 *  unranged relic mods (which then show no input). Pure over RELIC_MODS. */
function relicRangeHint(id: string | number): string | undefined {
  const mod = RELIC_MODS.find((m) => m.id === Number(id))
  if (!mod || mod.ranges[0]?.length !== 2) return undefined
  return `${mod.ranges[0][0]}-${mod.ranges[0][1]}`
}

export const RelicGenerator = forwardRef<GeneratorHandle, GeneratorProps>(function RelicGenerator(
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
  const [want, setWant] = usePersistedSet<number>(key('relic-want'))
  const [wantValues, setWantValues] = usePersistedJSON<Record<number, number>>(key('relic-want-values'), {})
  const [matchType, setMatchType] = usePersistedString<RelicMatchType>(key('relic-match-type'), 'any')

  // ---- Ephemeral UI state ---------------------------------------------------
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // ---- Derived regex --------------------------------------------------------
  const selections: RelicSelections = { want, wantValues, matchType }
  const regex = buildRelicRegex({ mods: RELIC_MODS, selections })

  useEffect(() => {
    onRegexChange(regex)
  }, [regex, onRegexChange])

  const tagState = useMemo(() => ({ want, wantValues, matchType }), [want, wantValues, matchType])

  // Push auto-tags up via a ref so we re-emit only on real state change.
  const onAutoTagsChangeRef = useRef(onAutoTagsChange)
  useEffect(() => {
    onAutoTagsChangeRef.current = onAutoTagsChange
  }, [onAutoTagsChange])
  useEffect(() => {
    onAutoTagsChangeRef.current(generateRelicPresetTags(tagState))
  }, [tagState])

  // ---- Save/load handle -----------------------------------------------------
  useImperativeHandle(
    ref,
    () => ({
      closePanels: () => {
        setSearchOpen(false)
        setSearch('')
      },
      getPresetPayload: () => ({
        want: [...want],
        wantMode: 'any',
        wantValues,
        // Relic has no avoid; matchType is the only scalar, stashed in qualifiers.
        qualifiers: { matchType: matchType === 'both' ? 1 : 0 } as Record<string, number>,
      }),
      applyPreset: (preset: RegexPreset) => {
        setWant(new Set(preset.want))
        setWantValues(preset.wantValues ?? {})
        setMatchType(preset.qualifiers?.matchType ? 'both' : 'any')
      },
      matchesPreset: (preset: RegexPreset) => {
        if ((preset.generator ?? 'maps') !== 'relic') return false
        const fresh = generateRelicPresetTags(tagState)
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
    [tagState],
  )

  // ---- Mod row helpers ------------------------------------------------------
  const visible = (m: { id: number; text: string }): boolean =>
    !search || formatModText(m.text).toLowerCase().includes(search.toLowerCase())
  const filteredPrefixes = PREFIX_MODS.filter(visible)
  const filteredSuffixes = SUFFIX_MODS.filter(visible)

  const modGroups = [
    {
      label: 'Prefixes',
      key: 'prefixes',
      color: TAB_COLORS.want,
      mods: filteredPrefixes.map((m) => ({ id: m.id, text: m.text })),
    },
    {
      label: 'Suffixes',
      key: 'suffixes',
      color: TAB_COLORS.want,
      mods: filteredSuffixes.map((m) => ({ id: m.id, text: m.text })),
    },
  ].filter((g) => g.mods.length > 0)

  const toggleCollapse = (k: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const toggle = (id: string | number): void => {
    const numId = typeof id === 'string' ? Number(id) : id
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

  return (
    <>
      {/* Chip-header row (New + Search + shared Save/Load). */}
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
                onPanelOpen?.()
              }
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

      {/* Match-mode row */}
      <div
        className="flex items-center gap-[6px] px-3 py-[6px] border-b border-border"
        style={{ background: 'var(--bg-solid)' }}
      >
        <span className="text-[11px] flex-1 text-text-dim">Match</span>
        <FilterChip
          label="Any"
          active={matchType === 'any'}
          onClick={() => setMatchType('any')}
          color={TAB_COLORS.want}
        />
        <FilterChip
          label="Both"
          active={matchType === 'both'}
          onClick={() => setMatchType('both')}
          color={TAB_COLORS.want}
        />
      </div>

      <ModList
        grouped={modGroups}
        selected={want as Set<string | number>}
        collapsed={collapsed}
        tabColor={TAB_COLORS.want}
        selectedTint="rgba(129,199,132,0.08)"
        toggle={toggle}
        toggleCollapse={toggleCollapse}
        values={wantValues}
        rangeHint={relicRangeHint}
        onValueChange={onValueChange}
      />
    </>
  )
})
