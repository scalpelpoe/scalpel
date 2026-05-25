import { useState } from 'react'
import { Star } from '@icon-park/react'
import { ScrubInput } from '../regex-tool/ScrubInput'
import { LearnedIcon } from './LearnedIcon'
import { divCardArtMap, RARITY_COLORS } from '../../shared/constants'
import { getModColor, MOD_BOLD_TYPES, uniqueToBase } from './constants'
import type { StatFilter } from './types'
import { zebraRowBg } from '../../shared/utils'

/** Tint static-box text by the value's item type. Used by Ultimatum chips
 *  whose value is a literal item name - unique flasks for Sacrifice, unique
 *  names or div card names for Specific Reward. Falls back to default text
 *  color for category labels (Currency / Mirrored Rare / etc.) and challenge
 *  names that aren't items. */
function getStaticValueColor(value: string): string | undefined {
  if (uniqueToBase[value]) return RARITY_COLORS.Unique
  if (divCardArtMap.has(value)) return RARITY_COLORS.Divination
  return undefined
}

/** Read-only value box styled to match ScrubInput but without the scrubber.
 *  Used for non-numeric stat filters (Ultimatum challenge/reward/input/output)
 *  where the value is a string id baked at parse time. The user can't change
 *  it without an actual text input - that's a bigger UI investment we don't
 *  need right now since these filters are always pre-filled from the item. */
function StaticValueBox({ value }: { value: string }): JSX.Element {
  const tint = getStaticValueColor(value)
  return (
    <div
      className="h-7 flex items-center px-2 rounded-[3px] text-[13px] select-none"
      style={{
        width: 170,
        background: 'rgba(0,0,0,0.3)',
        color: tint ?? 'var(--text)',
        cursor: 'default',
      }}
      title={value}
    >
      <span className="truncate">{value}</span>
    </div>
  )
}

function formatRange(range: { min: number; max: number }): string {
  const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1))
  return `${fmt(range.min)}-${fmt(range.max)}`
}

/**
 * Determine the text tint when the search criteria (min/max scrubber values)
 * exceed what a unique mod can legitimately roll.
 *   - Outside roll range → orange (possibly findable via Volatile Vaal Orb)
 *   - Outside [round(0.78*min), round(1.22*max)] → red (impossible even with vaal)
 */
function getSearchTint(
  searchMin: number | null,
  searchMax: number | null,
  range: { min: number; max: number } | undefined,
  itemRarity: string,
  type: string,
): string | null {
  if (!range) return null
  if (itemRarity !== 'Unique') return null
  if (type !== 'explicit' && type !== 'fractured' && type !== 'crafted') return null
  const exceeds = (v: number | null): boolean => v != null && (v > range.max || v < range.min)
  const exceedsVaal = (v: number | null): boolean => {
    if (v == null) return false
    const vaalMin = Math.round(range.min * 0.78)
    const vaalMax = Math.round(range.max * 1.22)
    return v > vaalMax || v < vaalMin
  }
  if (!exceeds(searchMin) && !exceeds(searchMax)) return null
  if (exceedsVaal(searchMin) || exceedsVaal(searchMax)) return '#ef5350'
  return '#ff9800'
}

export function StatFilterRow({
  f,
  i,
  rowIdx,
  toggleFilter,
  updateFilterMin,
  updateFilterMax,
  itemRarity,
}: {
  f: StatFilter
  i: number
  rowIdx: number
  toggleFilter: (i: number) => void
  updateFilterMin: (i: number, val: string) => void
  updateFilterMax: (i: number, val: string) => void
  itemRarity: string
}): JSX.Element {
  const minTint = getSearchTint(f.min, null, f.modRange, itemRarity, f.type)
  const maxTint = getSearchTint(null, f.max, f.modRange, itemRarity, f.type)
  // Filters whose values are inherently fractional (APS, crit %) need decimal
  // input; everything else stays integer-only.
  const decimals = f.id === 'weapon.aps' || f.id === 'weapon.crit' ? 1 : 0
  // Per-filter scrub cap. Most stats top out under 99999, but Facetor's Lens
  // stored experience can hit ~1.95B (max gem level XP); without a higher cap
  // both the slider and the field would clip at 99999. Add new entries here
  // when more large-value stats appear.
  const MAX_VALUE = f.id === 'misc.stored_experience' ? 2_000_000_000 : 99999
  const [hovered, setHovered] = useState(false)
  const hasTier = f.modTier != null && f.modTier > 0
  const hasRange = !!f.modRange
  const showChip = hovered && (hasTier || hasRange)
  const chipText =
    hasTier && hasRange
      ? `T${f.modTier}: (${formatRange(f.modRange!)})`
      : hasRange
        ? `(${formatRange(f.modRange!)})`
        : hasTier
          ? `T${f.modTier}`
          : ''

  return (
    <div
      className="flex items-center gap-2 px-3 py-[2px] text-xs"
      style={{
        opacity: f.enabled ? 1 : 0.4,
        background: zebraRowBg(rowIdx),
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        onClick={(e) => {
          e.stopPropagation()
          toggleFilter(i)
        }}
        className="w-4 h-4 shrink-0 rounded-[3px] cursor-pointer flex items-center justify-center transition-[background] duration-100"
        style={{
          background: f.enabled ? 'var(--accent)' : 'rgba(255,255,255,0.14)',
        }}
      >
        {f.enabled && <span className="text-[11px] text-[#171821] font-bold leading-none">&#10003;</span>}
      </div>
      <span
        onClick={() => toggleFilter(i)}
        className="flex-1 text-[11px] cursor-pointer select-none flex items-center gap-1"
        style={{
          color: getModColor(f.type, f.foulborn),
          fontWeight: MOD_BOLD_TYPES.has(f.type) ? 600 : 400,
        }}
      >
        {f.type === 'temple-key' && <Star size={12} theme="filled" fill="#ffd700" />}
        {f.learned && (
          <span
            title="Learned Preference"
            className="inline-flex items-center shrink-0"
            style={{ color: 'var(--accent)' }}
          >
            <LearnedIcon size={12} />
          </span>
        )}
        {f.text}
        {showChip && (
          <span
            className="inline-flex items-center px-[5px] py-[1px] rounded text-[9px] font-semibold bg-black/35 text-text-dim whitespace-nowrap shrink-0 ml-[2px]"
            style={{ lineHeight: 1.2 }}
          >
            {chipText}
          </span>
        )}
      </span>
      {f.type === 'ultimatum' ? (
        // Ultimatum filters are string-valued (challenge id, sacrifice item
        // name, etc). Show the human-readable clipboard text from `displayValue`
        // (e.g. "Defeat waves of enemies"); the trade query uses `option` (the
        // API id like "Exterminate") directly via the query builder.
        <StaticValueBox value={f.displayValue ?? (typeof f.option === 'string' ? f.option : '')} />
      ) : (
        <>
          <ScrubInput
            value={f.min}
            placeholder="min"
            min={-MAX_VALUE}
            max={MAX_VALUE}
            defaultValue={f.max != null ? Math.floor(f.max * 0.8) || f.max : f.value}
            onChange={(val) => updateFilterMin(i, val == null ? '' : String(val))}
            color={minTint ?? undefined}
            decimals={decimals}
          />
          <ScrubInput
            value={f.max}
            placeholder="max"
            min={-MAX_VALUE}
            max={MAX_VALUE}
            defaultValue={f.min != null ? Math.ceil(f.min * 1.2) || f.min : f.value}
            onChange={(val) => updateFilterMax(i, val == null ? '' : String(val))}
            color={maxTint ?? undefined}
            decimals={decimals}
          />
        </>
      )}
    </div>
  )
}
