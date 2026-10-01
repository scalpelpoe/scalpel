import { ScrubInput } from '@renderer/components/primitives/ScrubInput'
import type { StatFilter } from '@renderer/features/price-check/types'

/**
 * A trimmed copy of the renderer's StatFilterRow for the viewer. The renderer row drags in
 * the div-card art table, the learned-preference icon and tier-ladder scrubbing, which
 * added ~280 KB gzipped to each viewer bundle; none of that applies to a read-only snapshot.
 * Keeps the checkbox, tier/range chip, colour by mod type and the min/max scrub boxes.
 */

/** Row text colour by stat type: the subset of MOD_COLORS in
 *  src/renderer/src/shared/trade-results/constants.ts that snapshot rows use. Keep in sync. */
const MOD_COLORS: Record<string, string> = {
  pseudo: '#88ccff',
  defence: '#88ccff',
  weapon: '#88ccff',
  implicit: '#af8aff',
  crafted: '#B8DAF1',
  fractured: 'var(--accent)',
  desecrated: '#9ccc65',
  enchant: '#a8e6cf',
  rune: '#a8e6cf',
  skill: '#a8e6cf',
  mercenary: '#a8e6cf',
  explicit: '#8787FE',
}
const BOLD_TYPES = new Set(['pseudo', 'defence'])

const MAX_VALUE = 99999

const decimalPlaces = (n: number | null): number => {
  if (n == null || !Number.isFinite(n) || Number.isInteger(n)) return 0
  const s = String(n)
  return s.length - s.indexOf('.') - 1
}

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1))

export function StatRow({
  f,
  i,
  toggleFilter,
  updateFilterMin,
  updateFilterMax,
  canEditMin = true,
  canEditMax = true,
}: {
  f: StatFilter
  i: number
  toggleFilter: (i: number) => void
  updateFilterMin: (i: number, val: string) => void
  updateFilterMax: (i: number, val: string) => void
  /** False when the query has no min/max bound to write, so the box is hidden. */
  canEditMin?: boolean
  canEditMax?: boolean
}): JSX.Element {
  // Fractional rolls scrub at their own precision; pseudo totals stay whole numbers.
  const decimals =
    f.type === 'pseudo' ? 0 : Math.max(decimalPlaces(f.value), decimalPlaces(f.min), decimalPlaces(f.max))
  const chip = [f.modTier ? `T${f.modTier}` : '', f.modRange ? `(${fmt(f.modRange.min)}-${fmt(f.modRange.max)})` : '']
    .filter(Boolean)
    .join(' ')
  return (
    <div
      className="flex items-center gap-2 px-3 py-[2px] text-xs"
      style={{ opacity: f.enabled ? 1 : 0.4, background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}
    >
      <input
        type="checkbox"
        checked={f.enabled}
        onChange={() => toggleFilter(i)}
        aria-label={f.text}
        className="w-4 h-4 shrink-0 accent-[var(--accent)] cursor-pointer"
      />
      <span
        onClick={() => toggleFilter(i)}
        className="flex-1 min-w-0 text-[11px] cursor-pointer select-none"
        style={{ color: MOD_COLORS[f.type] ?? 'var(--text)', fontWeight: BOLD_TYPES.has(f.type) ? 600 : 400 }}
      >
        {f.text}
        {chip && (
          <span className="inline-block ml-[5px] px-[5px] py-[2px] rounded text-[10px] leading-none bg-black/35 text-text-dim whitespace-nowrap align-middle">
            {chip}
          </span>
        )}
      </span>
      {(f.min !== null || f.max !== null || f.value !== null) && (canEditMin || canEditMax) ? (
        <>
          {canEditMin && (
          <ScrubInput
            value={f.min}
            placeholder="min"
            min={-MAX_VALUE}
            max={MAX_VALUE}
            defaultValue={f.max != null ? Math.floor(f.max * 0.8) || f.max : f.value}
            onChange={(val) => updateFilterMin(i, val == null ? '' : String(val))}
            decimals={decimals}
          />
          )}
          {canEditMax && (
          <ScrubInput
            value={f.max}
            placeholder="max"
            min={-MAX_VALUE}
            max={MAX_VALUE}
            defaultValue={f.min != null ? Math.ceil(f.min * 1.2) || f.min : f.value}
            onChange={(val) => updateFilterMax(i, val == null ? '' : String(val))}
            decimals={decimals}
          />
          )}
        </>
      ) : null}
    </div>
  )
}
