import type { ChipState, PriceCheck, PriceCheckRow, QueryOp } from '@scalpel/stream-contract'

export interface RowEdit {
  enabled: boolean
  min: number | null
  max: number | null
  /** Chip rows only: the chip's current state. */
  chip?: ChipState
}

/**
 * Initial viewer state from the snapshot rows.
 */
export function initialEdits(rows: PriceCheckRow[]): RowEdit[] {
  return rows.map((r) => ({
    enabled: r.defaultEnabled,
    min: r.min,
    max: r.max,
    ...(r.chip ? { chip: r.chip.default } : {}),
  }))
}

type Node = Record<string | number, unknown>

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** Paths come from a published snapshot (untrusted): never walk through prototype keys. */
const unsafePath = (path: Array<string | number>): boolean => path.some((k) => UNSAFE_KEYS.has(String(k)))

function parentOf(root: unknown, path: Array<string | number>): Node | null {
  if (unsafePath(path)) return null
  let cur: unknown = root
  for (const k of path.slice(0, -1)) {
    if (typeof cur !== 'object' || cur === null) return null
    cur = (cur as Node)[k]
  }
  return typeof cur === 'object' && cur !== null ? (cur as Node) : null
}

function applyOp(root: unknown, op: QueryOp): void {
  if (unsafePath(op.path)) return
  if (op.op === 'set') {
    // Unlike delete/disable, a set may add keys: create missing (or non-object) parents on the way.
    let cur = root as Node
    for (const k of op.path.slice(0, -1)) {
      if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {}
      cur = cur[k] as Node
    }
    cur[op.path[op.path.length - 1]] = structuredClone(op.value)
    return
  }
  const parent = parentOf(root, op.path)
  const key = op.path[op.path.length - 1]
  if (!parent || !(key in parent)) return
  if (op.op === 'delete') delete parent[key]
  else {
    const target = parent[key]
    if (typeof target === 'object' && target !== null) (target as Node).disabled = true
  }
}

function setLeaf(root: unknown, path: Array<string | number>, value: number | null): void {
  const parent = parentOf(root, path)
  const key = path[path.length - 1]
  if (parent && key in parent) parent[key] = value
}

/**
 * Drop empty filter groups from body.query.filters. Delete a group key G when
 * query.filters[G].filters is an empty object. Never deletes query or query.filters.
 */
function prune(body: unknown): void {
  const b = body as Node
  const query = b.query as Node | undefined
  if (!query) return
  const filters = query.filters as Node | undefined
  if (!filters) return
  for (const groupKey of Object.keys(filters)) {
    const group = filters[groupKey] as Node | undefined
    if (group && typeof group === 'object' && !Array.isArray(group)) {
      const groupFilters = group.filters as Node | undefined
      if (groupFilters && typeof groupFilters === 'object' && !Array.isArray(groupFilters) && Object.keys(groupFilters).length === 0) {
        delete filters[groupKey]
      }
    }
  }
}

/**
 * A new search body with the viewer's edits applied; never mutates `pc.body`.
 */
export function applyEdits(pc: PriceCheck, edits: Array<RowEdit | undefined>): Record<string, unknown> {
  const body = structuredClone(pc.body)
  // Chip states first: some replace whole filter groups, which later rows' ops must see.
  pc.rows.forEach((row, i) => {
    const e = edits[i]
    if (row.locked || !e || !row.chip || e.chip === undefined || e.chip === row.chip.default) return
    row.chip.states[e.chip]?.forEach((op) => applyOp(body, op))
  })
  pc.rows.forEach((row, i) => {
    const e = edits[i]
    if (row.locked || !e || row.chip) return
    if (!e.enabled) return row.offOps.forEach((op) => applyOp(body, op))
    if (row.minPath && e.min !== row.min) setLeaf(body, row.minPath, e.min)
    if (row.maxPath && e.max !== row.max) setLeaf(body, row.maxPath, e.max)
  })
  prune(body)
  return body
}

/**
 * Build a trade2 search URL from a price check and viewer edits.
 */
export function tradeSearchUrl(pc: PriceCheck, edits: Array<RowEdit | undefined>): string {
  const q = encodeURIComponent(JSON.stringify(applyEdits(pc, edits)))
  return `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(pc.league)}?q=${q}`
}
