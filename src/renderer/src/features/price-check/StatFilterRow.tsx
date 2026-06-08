import { useState } from 'react'
import { SortFour, Star } from '@icon-park/react'
import { ScrubInput } from '../../components/primitives/ScrubInput'
import { scrubAccumulate, snapToStep } from '../../components/primitives/scrub-math'
import { LearnedIcon } from './LearnedIcon'
import { divCardArtMap, RARITY_COLORS } from '../../shared/constants'
import { getModColor, MOD_BOLD_TYPES, uniqueToBase } from './constants'
import type { StatFilter } from './types'
import { zebraRowBg } from '../../shared/utils'
import { valueToTier } from '../../../../shared/data/tiers/resolve'

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

/** How many digits follow the decimal point in a finite number. Returns 0 for
 *  integers, null/undefined, or exponential-notation values we can't read off. */
function decimalPlaces(n: number | null | undefined): number {
  if (n == null || !Number.isFinite(n) || Number.isInteger(n)) return 0
  const s = String(n)
  const dot = s.indexOf('.')
  return dot === -1 ? 0 : s.length - dot - 1
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
  // Match the slider's precision to the affix's own value: a fractional roll
  // (APS 1.45, crit 8.5%, "12.5% increased ...") scrubs at that many decimals,
  // integer rolls stay integer-only. Derived from the value/min/max so it works
  // for any stat in either game without a per-id allowlist. Pseudo totals (summed
  // across mods) and aggregated values (averaged/computed from multiple numbers,
  // e.g. "Adds # to #" or weapon DPS) stay integer regardless of their components.
  const decimals =
    f.type === 'pseudo' || f.aggregated
      ? 0
      : Math.max(decimalPlaces(f.value), decimalPlaces(f.min), decimalPlaces(f.max))
  // Per-filter scrub cap. Most stats top out under 99999, but Facetor's Lens
  // stored experience can hit ~1.95B (max gem level XP); without a higher cap
  // both the slider and the field would clip at 99999. Add new entries here
  // when more large-value stats appear.
  const MAX_VALUE = f.id === 'misc.stored_experience' ? 2_000_000_000 : 99999
  const [hovered, setHovered] = useState(false)
  const hasTier = f.modTier != null && f.modTier > 0
  const hasRange = !!f.modRange
  const ladder = f.tierLadder && f.tierLadder.length > 0 ? f.tierLadder : null
  const mult = f.tierQualityMult && f.tierQualityMult > 0 ? f.tierQualityMult : 1
  const ladderMin = ladder ? ladder[0].range.min * mult : 0
  const ladderMax = ladder ? ladder[ladder.length - 1].range.max * mult : 0
  const step = decimals > 0 ? 1 / 10 ** decimals : 1

  // Live chip text: when a ladder is present, reflect the tier the current min sits in.
  // Divide by mult to map the current modified min back to the unmodified ladder space.
  const liveTier = ladder ? valueToTier(ladder, (f.min ?? ladderMin) / mult) : null
  const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(decimals || 1))
  // Split the chip into the tier token (bolded) and the range (normal weight).
  const tierLabel = ladder ? `T${liveTier!.tier}` : hasTier ? `T${f.modTier}` : ''
  const rangeLabel = ladder
    ? `(${fmt(liveTier!.range.min)}-${fmt(liveTier!.range.max)})`
    : hasRange
      ? `(${formatRange(f.modRange!)})`
      : ''
  // Brighten the accent badge for better tiers: the worst tier in the ladder gets
  // 50% opacity, the best (lowest tier number) gets 100%, linear in between.
  const tierNums = ladder ? ladder.map((t) => t.tier) : []
  const bestNum = tierNums.length ? Math.min(...tierNums) : 0
  const worstNum = tierNums.length ? Math.max(...tierNums) : 0
  const tierOpacity =
    ladder && liveTier && worstNum > bestNum ? 0.5 + (0.5 * (worstNum - liveTier.tier)) / (worstNum - bestNum) : 1
  const showChip = (hovered || !!ladder) && (hasTier || hasRange || !!ladder)

  const startTierScrub = (e: React.MouseEvent): void => {
    if (!ladder) return
    e.preventDefault()
    e.stopPropagation()
    // Scrubbing a disabled row implies the user wants it - turn it on.
    if (!f.enabled) toggleFilter(i)
    document.body.style.cursor = 'ew-resize'
    document.body.classList.add('scrubbing')
    let lastX = e.clientX
    let acc = f.min ?? ladderMin
    const onMove = (me: MouseEvent): void => {
      const dx = me.clientX - lastX
      lastX = me.clientX
      acc = scrubAccumulate(acc, dx, step)
      const clamped = Math.min(ladderMax, Math.max(ladderMin, acc))
      updateFilterMin(i, String(snapToStep(clamped, step, decimals)))
      updateFilterMax(i, '')
    }
    const onUp = (): void => {
      document.body.style.cursor = ''
      document.body.classList.remove('scrubbing')
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      // The browser fires a click after this press on the common ancestor of the
      // mousedown/mouseup targets - which is the row, whose click toggles it. Drag
      // ends are often off the chip, so a chip-level handler can't catch it. Swallow
      // the next click globally (capture phase) so the scrub never toggles the row.
      const swallowClick = (ce: MouseEvent): void => {
        ce.stopPropagation()
        ce.preventDefault()
        window.removeEventListener('click', swallowClick, true)
      }
      window.addEventListener('click', swallowClick, true)
      // Safety net: if no click is synthesized, drop the listener on the next tick
      // so it never eats an unrelated later click.
      setTimeout(() => window.removeEventListener('click', swallowClick, true), 0)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

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
            onMouseDown={ladder ? startTierScrub : undefined}
            title={ladder ? 'Drag to scrub tier' : undefined}
            className="inline-flex items-center gap-[4px] px-[5px] py-[2px] rounded text-[11px] leading-none bg-black/35 text-text-dim whitespace-nowrap shrink-0 ml-[3px]"
            style={{ cursor: ladder ? 'ew-resize' : 'default' }}
          >
            {/* Tier + range share one inline run so they sit on the same text
                baseline regardless of badge box height or font metrics. */}
            <span>
              {tierLabel && (
                <span
                  className="inline-block rounded-[2px] px-[2px] py-[1px] font-bold leading-none text-[#171821]"
                  style={{ background: 'var(--accent)', opacity: ladder ? tierOpacity : 1 }}
                >
                  {tierLabel}
                </span>
              )}
              {rangeLabel && <span className={`relative -top-[1px]${tierLabel ? ' ml-[4px]' : ''}`}>{rangeLabel}</span>}
            </span>
            {ladder && (
              <SortFour
                size={11}
                theme="outline"
                fill="currentColor"
                style={{ transform: 'rotate(90deg)', opacity: 0.5 }}
              />
            )}
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
