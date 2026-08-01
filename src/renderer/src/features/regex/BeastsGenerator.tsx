import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { CloseSmall, Refresh, Search } from '@icon-park/react'
import {
  DEFAULT_BEAST_STATE,
  beastStateEquals,
  sanitizeBeastState,
  type BeastState,
} from '@shared/data/regex/beast-state'
import { beastRegex } from '@shared/data/regex/vendor/beast/GeneratedBeastRegex'
import {
  beastBudget,
  buildBeastRegex,
  buildBeastRows,
  type BeastPriceLine,
  type PricedBeast,
} from '@shared/data/regex/beast-engine'
import { generateBeastPresetTags } from './beast-preset-tags'
import { TAB_COLORS, usePersistedJSON, useRegexKey } from './mapmods-helpers'
import { FilterChip } from '../../components/primitives/FilterChip'
import { ScrubInput } from '../../components/primitives/ScrubInput'
import { ErrorBanner } from '../../components/ErrorBanner'
import { DismissibleTip } from '../../shared/DismissibleTip'
import { HoverTooltip } from '../../shared/HoverTooltip'
import { InfoChip } from '../../shared/InfoChip'
import { PriceChip } from '../../shared/PriceChip'
import type { RegexPreset } from '@shared/types'
import type { GeneratorHandle, GeneratorProps } from './generator-types'

type RowMode = 'auto' | 'pin' | 'mute'

/** Tri-state row box. Same 14px rounded square as RegexCheckbox so the Beasts
 *  rows read as the same component family as the Vendor/Flask toggles, with a
 *  third state layered on: green check = pinned, red bar = muted, empty = the
 *  price-driven auto-pack decides. */
function BeastStateBox({ mode }: { mode: RowMode }): JSX.Element {
  const background = mode === 'pin' ? TAB_COLORS.want : mode === 'mute' ? TAB_COLORS.avoid : 'rgba(255,255,255,0.1)'
  return (
    <div
      className="w-[14px] h-[14px] shrink-0 rounded-[3px] flex items-center justify-center transition-[background] duration-100"
      style={{ background }}
    >
      {mode === 'pin' && <span className="text-[10px] text-[#171821] font-bold leading-none">&#10003;</span>}
      {mode === 'mute' && <span className="text-[10px] text-[#171821] font-bold leading-none">&#8722;</span>}
    </div>
  )
}

/** Recipes arrive as a "; "-separated list, up to 511 characters across as many
 *  as eight entries. A row shows the first one and a "+N" marker; the whole list
 *  is the hover tooltip. */
function splitRecipes(recipe: string): string[] {
  return recipe
    .split(';')
    .map((r) => r.trim())
    .filter((r) => r.length > 0)
}

function RecipeLine({ recipe }: { recipe: string }): JSX.Element | null {
  const parts = splitRecipes(recipe)
  if (parts.length === 0) return null
  const line = (
    <div className="flex items-center gap-1 pl-[22px] min-w-0">
      <span className="text-[10px] text-text-dim leading-snug truncate">{parts[0]}</span>
      {parts.length > 1 && <span className="text-[9px] text-text-dim opacity-70 shrink-0">+{parts.length - 1}</span>}
    </div>
  )
  if (parts.length === 1) return line
  return (
    <HoverTooltip text={parts.join('\n')} className="min-w-0">
      {line}
    </HoverTooltip>
  )
}

function relativeAge(updatedAt: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - updatedAt) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes === 1) return '1 min ago'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`
}

function BeastRow({
  row,
  mode,
  alt,
  onClick,
}: {
  row: PricedBeast
  mode: RowMode
  alt: boolean
  onClick: () => void
}): JSX.Element {
  const dim = mode === 'mute'
  return (
    <div
      className="flex flex-col gap-[2px] px-3 py-[6px] cursor-pointer select-none"
      style={{
        background: alt ? 'rgba(255,255,255,0.02)' : 'transparent',
        opacity: dim ? 0.45 : 1,
      }}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <BeastStateBox mode={mode} />
        {/* Every name reads at full brightness. Whether a beast is in the regex
            is conveyed by the "N in regex" chip, not per-row styling. */}
        <span className="text-[11px] flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>
          {row.name}
        </span>
        {row.chaosValue > 0 ? (
          <PriceChip chaosValue={row.chaosValue} divineValue={row.divineValue} graph={row.graph} showNinja size="sm" />
        ) : (
          <span className="text-[10px] text-text-dim">-</span>
        )}
      </div>
      <RecipeLine recipe={row.recipe} />
    </div>
  )
}

export const BeastsGenerator = forwardRef<GeneratorHandle, GeneratorProps>(function BeastsGenerator(
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
  const [state, setState] = usePersistedJSON<BeastState>(key('beast-state'), DEFAULT_BEAST_STATE, sanitizeBeastState)

  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [prices, setPrices] = useState<BeastPriceLine[]>([])
  const [league, setLeague] = useState('')
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => Date.now())

  // ---- Price loading ---------------------------------------------------------
  // Bumped on every load and on unmount. A resolve whose generation is stale
  // (tab switched away, or a Refresh overtook an in-flight initial load) drops
  // its result instead of setting state on a dead or newer instance.
  const loadGeneration = useRef(0)
  useEffect(() => {
    return () => {
      loadGeneration.current += 1
    }
  }, [])

  const load = useCallback((force: boolean): void => {
    const generation = ++loadGeneration.current
    setLoading(true)
    window.api
      .getBeastPrices(force)
      .then((r) => {
        if (loadGeneration.current !== generation) return
        setPrices(r.lines)
        setLeague(r.league)
        setUpdatedAt(r.updatedAt)
        setFetchError(r.error ?? null)
        setNow(Date.now())
      })
      .catch(() => {
        if (loadGeneration.current !== generation) return
        setFetchError('Could not reach poe.ninja.')
      })
      .finally(() => {
        if (loadGeneration.current !== generation) return
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    load(false)
  }, [load])

  // Keep the "updated N min ago" line honest while the tab stays open.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])

  // ---- Derived ---------------------------------------------------------------
  const rows = useMemo(() => buildBeastRows(beastRegex, prices), [prices])
  const result = useMemo(() => buildBeastRegex(rows, state), [rows, state])

  useEffect(() => {
    onRegexChange(result.regex)
  }, [result.regex, onRegexChange])

  const onAutoTagsChangeRef = useRef(onAutoTagsChange)
  useEffect(() => {
    onAutoTagsChangeRef.current = onAutoTagsChange
  }, [onAutoTagsChange])
  useEffect(() => {
    onAutoTagsChangeRef.current(generateBeastPresetTags(state))
  }, [state])

  const pinnedSet = useMemo(() => new Set(state.pinned), [state.pinned])
  const mutedSet = useMemo(() => new Set(state.muted), [state.muted])

  // Upstream narrowed the dataset to craftable beasts, so today every row is
  // red and the Red only chip could never filter anything. Hide it rather than
  // ship a control that provably does nothing; it comes back automatically if
  // upstream widens the dataset again. The engine keeps its redOnly branch
  // either way (poe.re parity, covered by the parity sweep).
  const hasNonRed = useMemo(() => rows.some((r) => !r.red), [rows])

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.recipe.toLowerCase().includes(q))
  }, [rows, search])

  const warning = useMemo(() => {
    if (result.droppedPins.length > 0) {
      const n = result.droppedPins.length
      return `${n} pinned ${n === 1 ? 'beast' : 'beasts'} did not fit the ${beastBudget(state)} character limit.`
    }
    if (fetchError) return 'Could not reach poe.ninja. Pinned beasts still generate.'
    if (!loading && prices.length === 0) return `poe.ninja has no beast prices for ${league || 'this league'}.`
    return null
  }, [result.droppedPins, fetchError, loading, prices.length, league, state])

  const leagueLabel = league ? ` - ${league}` : ''
  const priceSourceLine = loading
    ? `Prices from poe.ninja${leagueLabel} - loading`
    : updatedAt == null
      ? `Prices from poe.ninja${leagueLabel} - unavailable`
      : `Prices from poe.ninja${leagueLabel} - updated ${relativeAge(updatedAt, now)}`

  // ---- State updates ---------------------------------------------------------
  const patch = (over: Partial<BeastState>): void => setState((prev) => ({ ...prev, ...over }))

  /** Click cycles auto -> pin -> mute -> auto. The two lists stay disjoint. */
  const cycleRow = (name: string): void =>
    setState((prev) => {
      const isPinned = prev.pinned.includes(name)
      const isMuted = prev.muted.includes(name)
      if (isPinned) {
        return { ...prev, pinned: prev.pinned.filter((n) => n !== name), muted: [...prev.muted, name] }
      }
      if (isMuted) {
        return { ...prev, muted: prev.muted.filter((n) => n !== name) }
      }
      return { ...prev, pinned: [...prev.pinned, name] }
    })

  useImperativeHandle(
    ref,
    () => ({
      closePanels: () => {
        setSearchOpen(false)
        setSearch('')
      },
      getPresetPayload: () => ({
        avoid: [],
        want: [],
        wantMode: 'any',
        qualifiers: {},
        beast: structuredClone(state),
      }),
      applyPreset: (preset: RegexPreset) => {
        setState(sanitizeBeastState(preset.beast))
      },
      matchesPreset: (preset: RegexPreset) => {
        if ((preset.generator ?? 'maps') !== 'beasts') return false
        return beastStateEquals(sanitizeBeastState(preset.beast), state)
      },
    }),
    [state, setState],
  )

  return (
    <>
      {/* Chip header row */}
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
          <FilterChip
            label={
              <>
                <Refresh size={12} theme="outline" fill="currentColor" spin={loading} /> Refresh
              </>
            }
            solidInactive
            disabled={loading}
            onClick={() => load(true)}
          />
          {sharedSaveChip}
          {sharedLoadChip}
        </div>

        <div
          className="overflow-hidden transition-all duration-150"
          style={{ maxHeight: searchOpen ? 40 : 0, marginTop: searchOpen ? 8 : 0, opacity: searchOpen ? 1 : 0 }}
        >
          <div className="relative">
            <input
              type="text"
              placeholder="Search beasts or recipes..."
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

      <ErrorBanner message={warning} tone="warn" inline />

      {sharedSavedPresets}

      {/* Filters strip */}
      <div
        className="flex flex-wrap items-center gap-[6px] px-3 py-[6px] border-b border-border"
        style={{ background: 'var(--bg-solid)', minHeight: 40 }}
      >
        <span className="text-[10px] text-text-dim">Min</span>
        <ScrubInput
          value={state.minChaos}
          onChange={(v) => patch({ minChaos: v })}
          min={0}
          max={999999}
          placeholder="any"
          suffix="c"
        />
        <span className="text-[10px] text-text-dim">Max</span>
        <ScrubInput
          value={state.maxChaos}
          onChange={(v) => patch({ maxChaos: v })}
          min={0}
          max={999999}
          placeholder="any"
          suffix="c"
        />
        <FilterChip
          label="Harvest"
          active={state.includeHarvest}
          onClick={() => patch({ includeHarvest: !state.includeHarvest })}
        />
        <FilterChip
          label="Menagerie (100)"
          active={state.menagerieLimit}
          onClick={() => patch({ menagerieLimit: !state.menagerieLimit })}
        />
        {hasNonRed && (
          <FilterChip label="Red only" active={state.redOnly} onClick={() => patch({ redOnly: !state.redOnly })} />
        )}
      </div>

      {/* Price source + row-interaction tip */}
      <div className="flex flex-col gap-1 px-3 py-[6px] bg-bg-card border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-text-dim">{priceSourceLine}</span>
          <InfoChip size="sm">
            <span className="text-text-dim">{result.included.size} in regex</span>
          </InfoChip>
        </div>
        <DismissibleTip id="regex-tool.beast-pin">
          Click a beast to pin it (always included), click again to mute it (never included).
        </DismissibleTip>
      </div>

      {/* Beast list */}
      <div className="flex-1 overflow-y-auto bg-bg-card">
        {visibleRows.length === 0 ? (
          <div className="px-3 py-4 text-[11px] text-text-dim text-center">
            {loading ? 'Loading beast prices...' : 'No beasts match your search.'}
          </div>
        ) : (
          visibleRows.map((row, i) => (
            <BeastRow
              key={row.name}
              row={row}
              mode={pinnedSet.has(row.name) ? 'pin' : mutedSet.has(row.name) ? 'mute' : 'auto'}
              alt={i % 2 === 1}
              onClick={() => cycleRow(row.name)}
            />
          ))
        )}
      </div>
    </>
  )
})
