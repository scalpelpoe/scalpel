import type { JsonPath, QueryOp } from '@scalpel/stream-contract'

export type { JsonPath, QueryOp }

export const SENTINEL_MIN = 987654.25
export const SENTINEL_MAX = 876543.75

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function walk(on: unknown, off: unknown, path: JsonPath, ops: QueryOp[]): boolean {
  if (equal(on, off)) return true
  if (isObj(on) && isObj(off)) {
    for (const k of Object.keys(off)) if (!(k in on)) return false
    for (const k of Object.keys(on)) {
      if (!(k in off)) ops.push({ op: 'delete', path: [...path, k] })
      else if (!walk(on[k], off[k], [...path, k], ops)) return false
    }
    return true
  }
  if (Array.isArray(on) && Array.isArray(off)) {
    if (on.length === off.length) return on.every((v, i) => walk(v, off[i], [...path, i], ops))
    if (off.length > on.length) return false
    let j = 0
    for (let i = 0; i < on.length; i++) {
      if (j < off.length && equal(on[i], off[j])) j++
      else if (isObj(on[i])) ops.push({ op: 'disable', path: [...path, i] })
      else return false
    }
    return j === off.length
  }
  return false
}

export function removalOps(on: unknown, off: unknown): QueryOp[] | null {
  const ops: QueryOp[] = []
  return walk(on, off, [], ops) ? ops : null
}

function diffWalk(on: unknown, variant: unknown, path: JsonPath, ops: QueryOp[]): boolean {
  if (equal(on, variant)) return true
  if (isObj(on) && isObj(variant)) {
    // A key holding undefined doesn't survive JSON, so it counts as absent.
    const has = (o: Record<string, unknown>, k: string) => o[k] !== undefined
    for (const k of Object.keys(on)) {
      if (!has(on, k)) continue
      if (!has(variant, k)) ops.push({ op: 'delete', path: [...path, k] })
      else if (!diffWalk(on[k], variant[k], [...path, k], ops)) return false
    }
    for (const k of Object.keys(variant))
      if (has(variant, k) && !has(on, k)) ops.push({ op: 'set', path: [...path, k], value: variant[k] })
    return true
  }
  if (Array.isArray(on) && Array.isArray(variant)) {
    if (on.length === variant.length) return on.every((v, i) => diffWalk(v, variant[i], [...path, i], ops))
    if (variant.length > on.length) return false
    let j = 0
    for (let i = 0; i < on.length; i++) {
      if (j < variant.length && equal(on[i], variant[j])) j++
      else if (isObj(on[i])) ops.push({ op: 'disable', path: [...path, i] })
      else return false
    }
    return j === variant.length
  }
  // Changed primitive, or the subtree changed type.
  ops.push({ op: 'set', path, value: variant })
  return true
}

/**
 * Ops that turn `on` into `variant`: removalOps plus `set` for added keys, changed
 * primitives and type-changed subtrees. Null when an array grows or a shorter array
 * isn't a subsequence of `on` whose dropped elements are all objects.
 */
export function diffOps(on: unknown, variant: unknown): QueryOp[] | null {
  const ops: QueryOp[] = []
  return diffWalk(on, variant, [], ops) ? ops : null
}

export function sentinelPath(base: unknown, probe: unknown, sentinel: number): JsonPath | null {
  const found: JsonPath[] = []
  let clean = true
  const visit = (b: unknown, p: unknown, path: JsonPath): void => {
    if (!clean || equal(b, p)) return
    if (p === sentinel && typeof b === 'number') return void found.push(path)
    if (isObj(b) && isObj(p)) {
      const keys = new Set([...Object.keys(b), ...Object.keys(p)])
      for (const k of keys) {
        if (!(k in b) || !(k in p)) return void (clean = false)
        visit(b[k], p[k], [...path, k])
      }
      return
    }
    if (Array.isArray(b) && Array.isArray(p) && b.length === p.length)
      return b.forEach((v, i) => visit(v, p[i], [...path, i]))
    clean = false
  }
  visit(base, probe, [])
  return clean && found.length === 1 ? found[0] : null
}
