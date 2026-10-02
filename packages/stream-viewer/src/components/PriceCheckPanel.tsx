import type { ChipState, PriceCheck, PriceCheckRow, SnapshotItem } from '@scalpel/stream-contract'
import { buttonClassName, Button } from '@renderer/components/primitives/Button'
import { FilterChip } from '@renderer/components/primitives/FilterChip'
import type { StatFilter } from '@renderer/features/price-check/types'
import { useState } from 'react'
import { StatRow } from './StatRow'
import { initialEdits, type RowEdit, tradeSearchUrl } from '../data/trade-link'

interface Props {
  item: SnapshotItem & { priceCheck: PriceCheck }
  onBack: () => void
  /** Width in px of the item card this panel replaces; unset fills the container (up to 460px). */
  width?: number
}

/** Chip colours: the subset of CHIP_COLORS (and getChipColor's default) in
 *  src/renderer/src/features/price-check/constants.ts that snapshot rows use. That module
 *  pulls in the icon and currency art tables, so only the colours are copied. Keep in sync. */
const CHIP_COLORS: Record<string, string> = {
  'misc.corrupted': '#ef5350',
  'misc.mirrored': '#8787FE',
  'misc.sanctified': '#e7b356',
}
const chipColor = (id: string): string => CHIP_COLORS[id] ?? 'var(--accent)'

/** FilterChip cycle order; 'none' is Any (yesno) or Off (minmax). */
const CYCLE: Record<'yesno' | 'minmax', ChipState[]> = {
  yesno: ['none', 'yes', 'no'],
  minmax: ['none', 'min', 'max'],
}

/** The next state in the chip's cycle that the row has ops for. */
export function nextChipState(chip: NonNullable<PriceCheckRow['chip']>, current: ChipState): ChipState {
  const order = CYCLE[chip.mode]
  const at = order.indexOf(current)
  for (let step = 1; step <= order.length; step++) {
    const s = order[(at + step) % order.length]
    if (chip.states[s] !== undefined) return s
  }
  return current
}

/** Misc and socket rows render as chips in the strip (locked ones disabled); everything else is a stat row. */
const isChipRow = (row: PriceCheckRow): boolean => row.chip !== undefined || row.type === 'misc' || row.type === 'socket'

/** "" -> null, NaN -> undefined (ignore the keystroke). */
export function parseBound(raw: string): number | null | undefined {
  if (raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

/** The pinned item's stat filters as Scalpel's own rows. Edits only ever change the
 *  trade link; nothing is sent anywhere until the viewer follows it. */
export function PriceCheckPanel({ item, onBack, width }: Props): JSX.Element {
  const pc = item.priceCheck
  const [edits, setEdits] = useState<RowEdit[]>(() => initialEdits(pc.rows))
  // Same rule as ItemTooltip: only rares and uniques print the base under the name.
  const showBase = (item.rarity === 'unique' || item.rarity === 'rare') && item.name !== null && item.name !== item.baseType

  const patch = (i: number, change: Partial<RowEdit>): void =>
    setEdits((prev) => prev.map((e, j) => (j === i ? { ...e, ...change } : e)))
  const setBound = (i: number, key: 'min' | 'max', raw: string): void => {
    const row = pc.rows[i]
    if (row.locked || (key === 'min' ? row.minPath : row.maxPath) === null) return
    const value = parseBound(raw)
    if (value !== undefined) patch(i, { [key]: value })
  }

  const renderChip = (row: PriceCheckRow, i: number): JSX.Element => {
    const edit = edits[i]
    const color = chipColor(row.id)
    let chip: JSX.Element
    if (row.locked) {
      // Locked rows are applied to the query as shown: render them active, just not clickable.
      const spec = row.chip
      chip = spec ? (
        <FilterChip
          label={row.text}
          mode={spec.mode}
          color={color}
          state={spec.default === 'none' ? undefined : (spec.default as 'yes' | 'no' | 'min' | 'max')}
          onChange={() => {}}
          readOnly
        />
      ) : (
        <FilterChip label={row.text} active readOnly color={color} />
      )
    }
    else if (row.chip) {
      const spec = row.chip
      const current = edit.chip ?? spec.default
      chip = (
        <FilterChip
          label={row.text}
          mode={spec.mode}
          color={color}
          state={current === 'none' ? undefined : (current as 'yes' | 'no' | 'min' | 'max')}
          onChange={() => patch(i, { chip: nextChipState(spec, current) })}
        />
      )
    } else chip = <FilterChip label={row.text} active={edit.enabled} color={color} onClick={() => patch(i, { enabled: !edit.enabled })} />
    return (
      <span
        key={`${row.id}-${i}`}
        title={row.locked ? 'Fixed for this search' : undefined}
      >
        {chip}
      </span>
    )
  }

  return (
    <div
      className="ssv-pc border border-border text-left shadow-lg"
      style={{ width: width ?? '100%' }}
      role="region"
      aria-label="Price check"
    >
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border">
        <Button iconOnly size="sm" variant="ghost" aria-label="Back to item" onClick={onBack}>
          <span aria-hidden="true">←</span>
        </Button>
        <div className="min-w-0 text-center flex-1">
          <div className={`ssv-r-${item.rarity} font-bold text-[13px] leading-tight truncate`}>{item.name ?? item.baseType}</div>
          {showBase && <div className={`ssv-r-${item.rarity} font-bold text-[13px] leading-tight truncate`}>{item.baseType}</div>}
        </div>
        <div className="w-5 shrink-0" />
      </div>
      {pc.rows.some(isChipRow) && (
        <div data-chip-strip className="flex flex-wrap gap-1 px-2 pt-2 pb-1">
          {pc.rows.map((row, i) => (isChipRow(row) ? renderChip(row, i) : null))}
        </div>
      )}
      <div className="py-1">
        {pc.rows.map((row, i) => {
          if (isChipRow(row)) return null
          const edit = edits[i]
          const filter: StatFilter = {
            id: row.id,
            text: row.text,
            type: row.type,
            value: row.value,
            min: edit.min,
            max: edit.max,
            enabled: edit.enabled,
            modTier: row.modTier,
            modRange: row.modRange,
          }
          return (
            <div
              key={`${row.id}-${i}`}
              className={row.locked ? 'opacity-60 pointer-events-none' : undefined}
              title={row.locked ? 'Fixed for this search' : undefined}
            >
              <StatRow
                f={filter}
                i={i}
                toggleFilter={(idx) => {
                  if (!pc.rows[idx].locked) patch(idx, { enabled: !edits[idx].enabled })
                }}
                updateFilterMin={(idx, val) => setBound(idx, 'min', val)}
                updateFilterMax={(idx, val) => setBound(idx, 'max', val)}
                canEditMin={row.minPath !== null}
                canEditMax={row.maxPath !== null}
              />
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between gap-2 px-2 py-2 border-t border-border">
        <Button size="sm" onClick={() => setEdits(initialEdits(pc.rows))}>
          Reset
        </Button>
        <a
          className={buttonClassName({ size: 'sm', variant: 'primary' })}
          href={tradeSearchUrl(pc, edits)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Search on trade ↗
        </a>
      </div>
    </div>
  )
}
