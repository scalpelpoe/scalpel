import { isDeepStrictEqual } from 'node:util'
import {
  type ChipState,
  type JsonPath,
  type PriceCheck,
  type PriceCheckChip,
  type PriceCheckRow,
  PriceCheckSchema,
  type QueryOp,
} from '@scalpel/stream-contract'
import { MINMAX_CHIP_IDS, TERNARY_CHIP_IDS } from '@shared/price-check-chips'
import type { PoeItem } from '@shared/types'
import { defensesFromPoeItem, itemInfoFromPoeItem, tradeItemFromPoeItem } from '../trade/item-info'
import { matchItemMods } from '../trade/stat-matcher'
import { buildTradeQuery, type StatFilter } from '../trade/trade'
import { debugWarn } from './debug-warn'
import { diffOps, removalOps, SENTINEL_MAX, SENTINEL_MIN, sentinelPath } from './query-ops'

const MAX_ROWS = 40
/**
 * A weapon carries six DPS/damage rows plus quality, sockets, runes and its mods, so a
 * real rare weapon lands at 8.5-9.6 KB with nothing redundant in it. fitSnapshot
 * still keeps the whole snapshot under its budget by dropping the largest checks.
 */
export const MAX_PRICE_CHECK_BYTES = 12288
const MAX_ITERATIONS = 3
/** PriceCheckRowSchema caps offOps; a row needing more is locked rather than failing the item. */
const MAX_OPS = 16

/**
 * poe.ninja reports SSF leagues literally ('SSF Runes of Aldur', 'HC SSF Runes of Aldur');
 * trade2 has no SSF leagues, so they search the matching trade league.
 */
export function tradeLeague(league: string): string {
  const m = /^(?:(HC|Hardcore) )?SSF (.+)$/.exec(league.trim())
  if (!m) return league
  return m[1] ? `${m[1]} ${m[2]}` : m[2]
}

/**
 * League a stream price check searches: the streamer's own Scalpel trade league, else the
 * character's league.
 */
export function priceCheckLeague(settingLeague: string | null | undefined, characterLeague: string): string {
  return settingLeague?.trim() ? settingLeague : characterLeague
}

/** Effective state of a locked chip row, appended to its text so the checked row says what it filters. */
export function lockedSuffix(f: StatFilter): string {
  if (f.option !== undefined) {
    const label = String(f.displayValue ?? f.option)
    return f.text.includes(label) ? '' : `: ${label}`
  }
  if (f.chipState === 'yes') return /:\s*yes$/i.test(f.text) ? '' : ': Yes'
  if (f.chipState === 'no') return /:\s*no$/i.test(f.text) ? '' : ': No'
  if (f.chipState === 'min') return ' (min)'
  if (f.chipState === 'max') return ' (max)'
  // A minmax row bounded on both ends has no chip state; spell the bounds out.
  if (MINMAX_CHIP_IDS.has(f.id) && f.enabled && f.min !== null && f.max !== null) return ` (${f.min} to ${f.max})`
  return ''
}

type ChipMode = PriceCheckChip['mode']

/** FilterChip cycle order: yesno is Any -> Yes -> No, minmax is Off -> Min -> Max. */
const CHIP_STATES: Record<ChipMode, ChipState[]> = {
  yesno: ['none', 'yes', 'no'],
  minmax: ['none', 'min', 'max'],
}

function chipMode(f: StatFilter): ChipMode | null {
  if (TERNARY_CHIP_IDS.has(f.id)) return 'yesno'
  if (MINMAX_CHIP_IDS.has(f.id)) return 'minmax'
  return null
}

/**
 * The state a chip row starts in, read from the filter as matchItemMods produced it.
 * Null when no chip state reproduces it (an enabled minmax row bounded on both ends,
 * or on neither); the caller locks that row.
 */
function chipDefault(f: StatFilter, mode: ChipMode): ChipState | null {
  if (mode === 'yesno') return f.chipState === 'yes' || f.chipState === 'no' ? f.chipState : 'none'
  if (!f.enabled) return 'none'
  if ((f.min === null) === (f.max === null)) return null
  return f.min === null ? 'max' : 'min'
}

/** `f` moved to chip state `state`, as Scalpel's PriceCheck.tsx chip handlers set it. */
export function chipVariant(f: StatFilter, state: ChipState): StatFilter {
  if (TERNARY_CHIP_IDS.has(f.id)) return { ...f, chipState: state === 'yes' || state === 'no' ? state : undefined }
  if (state === 'min') return { ...f, chipState: 'min', enabled: true, min: f.value, max: null }
  if (state === 'max') return { ...f, chipState: 'max', enabled: true, min: null, max: f.value }
  return { ...f, chipState: undefined, enabled: false }
}

/** True when one path equals the other or is an ancestor of it. */
function overlaps(a: JsonPath, b: JsonPath): boolean {
  const n = Math.min(a.length, b.length)
  for (let k = 0; k < n; k++) if (a[k] !== b[k]) return false
  return true
}

/**
 * Rows whose offOps touch a path an earlier row's offOps already touch. removalOps
 * matches array subsequences greedily, so two rows that each drop a deep-equal
 * element both point at the same index; turning both off would then disable only
 * one element. An ancestor path (one row deletes a whole group another row edits
 * inside) doesn't commute either. The later row of each such pair is returned so
 * the caller can lock it.
 */
export function duplicateOpLocks(opsByRow: Map<number, QueryOp[]>): number[] {
  const seen: JsonPath[] = []
  const locks: number[] = []
  for (const [i, ops] of [...opsByRow].sort((a, b) => a[0] - b[0])) {
    if (ops.some((o) => seen.some((p) => overlaps(p, o.path)))) {
      locks.push(i)
      continue
    }
    for (const o of ops) seen.push(o.path)
  }
  return locks
}

/**
 * Precompute a guest trade2 query for `item` plus per-row edit operations, so a
 * stream viewer can toggle rows and edit bounds without Scalpel's query builder.
 * Synchronous; the caller must have awaited ensureStatsLoaded(). Null when the item
 * has no rows, the result is over MAX_PRICE_CHECK_BYTES, or anything throws.
 */
export function buildPriceCheck(item: PoeItem, league: string): PriceCheck | null {
  const label = [item.name, item.baseType].filter(Boolean).join(' / ') || 'unknown item'
  const fail = (reason: string): null => {
    debugWarn(`price check skipped for ${label}: ${reason}`)
    return null
  }
  try {
    const filters = matchItemMods(
      item.explicits,
      item.implicits,
      defensesFromPoeItem(item),
      itemInfoFromPoeItem(item),
      item.advancedMods,
      90,
    ).slice(0, MAX_ROWS)
    if (filters.length === 0) return fail('no matched rows')

    const tradeItem = tradeItemFromPoeItem(item)
    const build = (fs: StatFilter[]) =>
      buildTradeQuery(tradeItem, fs, { loggedIn: false, tradeStatus: 'securable' }).body

    // Chip rows (Yes/No/Any, Min/Max/Off) stay at their default state in `on` and ship
    // ops for every other state; other chip-state/option rows are locked.
    const chipModes = new Map<number, ChipMode>()
    const locked = new Set<number>()
    filters.forEach((f, i) => {
      const mode = chipMode(f)
      if (mode) chipModes.set(i, mode)
      else if (f.chipState !== undefined || f.option !== undefined || f.id === 'misc.identified') locked.add(i)
    })

    let onFilters: StatFilter[] = []
    let on: ReturnType<typeof build> | null = null
    let opsByRow = new Map<number, QueryOp[]>()
    let chips = new Map<number, PriceCheckChip>()
    let converged = false
    for (let iter = 0; iter < MAX_ITERATIONS && !converged; iter++) {
      onFilters = filters.map((f, i) => (locked.has(i) || chipModes.has(i) ? f : { ...f, enabled: true }))
      on = build(onFilters)
      opsByRow = new Map()
      chips = new Map()
      let changed = false
      for (let i = 0; i < filters.length; i++) {
        if (locked.has(i) || chipModes.has(i)) continue
        const off = build(onFilters.map((f, j) => (j === i ? { ...f, enabled: false } : f)))
        const ops = removalOps(on, off)
        if (ops === null || ops.length === 0 || ops.length > MAX_OPS) {
          locked.add(i)
          changed = true
        } else opsByRow.set(i, ops)
      }
      for (const [i, mode] of chipModes) {
        if (locked.has(i)) continue
        // Chip rows sit in `on` at their default either way, so locking one never
        // changes `on` and doesn't count as a change.
        const def = chipDefault(filters[i], mode)
        if (def === null) {
          locked.add(i)
          continue
        }
        const states: PriceCheckChip['states'] = { [def]: [] }
        for (const s of CHIP_STATES[mode]) {
          if (s === def) continue
          const ops = diffOps(on, build(onFilters.map((f, j) => (j === i ? chipVariant(f, s) : f))))
          // An empty diff means the state filters exactly like the default: nothing to offer.
          if (ops !== null && ops.length > 0 && ops.length <= MAX_OPS) states[s] = ops
        }
        // Only the default survives: fall back to a locked row showing its effective state.
        if (Object.keys(states).length === 1) locked.add(i)
        else chips.set(i, { mode, default: def, states })
      }
      // Duplicate paths only matter between rows that stay editable, and locking a
      // toggleable row changes `on`, so this waits for a pass with no other new locks.
      // Every chip state's ops count as that chip row's paths.
      if (!changed) {
        const pathsByRow = new Map(opsByRow)
        for (const [i, chip] of chips) pathsByRow.set(i, Object.values(chip.states).flat())
        for (const i of duplicateOpLocks(pathsByRow)) {
          locked.add(i)
          if (chips.delete(i)) continue
          changed = true
        }
      }
      converged = !changed
    }
    if (!converged || on === null) return fail('row locking did not converge')
    const body = on

    const probePath = (i: number, key: 'min' | 'max', sentinel: number) => {
      const probe = build(onFilters.map((f, j) => (j === i ? { ...f, [key]: sentinel } : f)))
      return sentinelPath(body, probe, sentinel)
    }

    const rows: PriceCheckRow[] = []
    filters.forEach((f, i) => {
      const isLocked = locked.has(i)
      const chip = isLocked ? undefined : chips.get(i)
      let text = f.text
      if (isLocked) {
        const without = build(
          onFilters.map((g, j) =>
            j === i
              ? {
                  ...g,
                  enabled: false,
                  chipState: undefined,
                  option: undefined,
                }
              : g,
          ),
        )
        // Chip and option rows apply regardless of `enabled`, so clear those too. Disabling it changes nothing: the row has no effect on this query, so hide it.
        if (isDeepStrictEqual(without, body)) return
        text += lockedSuffix(f)
      }
      rows.push({
        id: f.id,
        text,
        type: f.type,
        value: f.value,
        min: f.min,
        max: f.max,
        ...(f.modTier !== undefined ? { modTier: f.modTier } : {}),
        ...(f.modRange !== undefined ? { modRange: { min: f.modRange.min, max: f.modRange.max } } : {}),
        defaultEnabled: isLocked ? true : chip ? chip.default !== 'none' : f.enabled,
        locked: isLocked,
        offOps: isLocked || chip ? [] : (opsByRow.get(i) ?? []),
        minPath: !isLocked && !chip && f.min !== null ? probePath(i, 'min', SENTINEL_MIN) : null,
        maxPath: !isLocked && !chip && f.max !== null ? probePath(i, 'max', SENTINEL_MAX) : null,
        ...(chip ? { chip } : {}),
      })
    })

    const parsed = PriceCheckSchema.safeParse({
      league: tradeLeague(league),
      body,
      rows,
    })
    if (!parsed.success) return fail(`schema: ${parsed.error.issues[0]?.message ?? 'invalid'}`)
    const bytes = Buffer.byteLength(JSON.stringify(parsed.data), 'utf8')
    if (bytes > MAX_PRICE_CHECK_BYTES) return fail(`${bytes} bytes, over ${MAX_PRICE_CHECK_BYTES}`)
    return parsed.data
  } catch (e) {
    return fail(`threw: ${(e as Error).message}`)
  }
}
