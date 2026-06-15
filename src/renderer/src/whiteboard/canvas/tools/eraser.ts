import type { Pt, StrokeElement, WhiteboardElement } from '@shared/whiteboard-types'
import type { GameSize } from '../coords'

const DEFAULT_ERASER_RADIUS_PX = 14

/** True iff the stroke's renderable area passes within `eraserRadiusPx` of
 *  the eraser tip (in stage pixels). */
export function strokeIntersects(
  el: StrokeElement,
  tipPx: { x: number; y: number },
  eraserRadiusPx: number,
  size: GameSize,
): boolean {
  if (el.points.length === 0) return false
  const halfWidthPx = (el.width * size.h) / 2
  const hitDist = eraserRadiusPx + halfWidthPx
  const hitDistSq = hitDist * hitDist

  if (el.points.length === 1) {
    const p = el.points[0]
    const dx = p.x * size.w - tipPx.x
    const dy = p.y * size.h - tipPx.y
    return dx * dx + dy * dy <= hitDistSq
  }

  for (let i = 0; i < el.points.length - 1; i++) {
    const a = el.points[i]
    const b = el.points[i + 1]
    if (segmentDistSq(a.x * size.w, a.y * size.h, b.x * size.w, b.y * size.h, tipPx.x, tipPx.y) <= hitDistSq) {
      return true
    }
  }
  return false
}

/** Returns true if the bbox (normalized coords) intersects the eraser tip circle. */
function bboxIntersectsTip(
  bbox: { x: number; y: number; w: number; h: number },
  tipPx: { x: number; y: number },
  radiusPx: number,
  size: GameSize,
): boolean {
  // Normalize bbox into an axis-aligned pixel rect (handle negative w/h for
  // line/arrow endpoint storage).
  const x0 = Math.min(bbox.x, bbox.x + bbox.w) * size.w
  const y0 = Math.min(bbox.y, bbox.y + bbox.h) * size.h
  const x1 = Math.max(bbox.x, bbox.x + bbox.w) * size.w
  const y1 = Math.max(bbox.y, bbox.y + bbox.h) * size.h
  // Closest point on rect to tip.
  const cx = Math.max(x0, Math.min(tipPx.x, x1))
  const cy = Math.max(y0, Math.min(tipPx.y, y1))
  const dx = tipPx.x - cx
  const dy = tipPx.y - cy
  return dx * dx + dy * dy <= radiusPx * radiusPx
}

/** Square distance from point (px, py) to segment (ax, ay)-(bx, by). */
function segmentDistSq(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) {
    const ex = px - ax
    const ey = py - ay
    return ex * ex + ey * ey
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq
  if (t < 0) t = 0
  else if (t > 1) t = 1
  const cx = ax + t * dx
  const cy = ay + t * dy
  const ex = px - cx
  const ey = py - cy
  return ex * ex + ey * ey
}

/** Erase the section of `el` under the eraser tip. Returns:
 *  - `null` if the stroke is unaffected (no segment within range)
 *  - `[]` if the stroke is fully erased
 *  - one or more StrokeElement fragments if the stroke is trimmed or split.
 *
 *  The first fragment retains the original element's `id`; subsequent
 *  fragments get fresh ids so each is independently selectable. */
export function eraseStroke(
  el: StrokeElement,
  tipPx: { x: number; y: number },
  eraserRadiusPx: number,
  size: GameSize,
): StrokeElement[] | null {
  if (el.points.length === 0) return null
  const halfWidthPx = (el.width * size.h) / 2
  const hitDist = eraserRadiusPx + halfWidthPx
  const hitDistSq = hitDist * hitDist

  // Mark each point as alive (true) or dead (false).
  const alive: boolean[] = el.points.map((p) => {
    const dx = p.x * size.w - tipPx.x
    const dy = p.y * size.h - tipPx.y
    return dx * dx + dy * dy > hitDistSq
  })

  // For segments where both endpoints are alive but the segment itself
  // crosses the eraser disk, kill the endpoint closer to the tip so the
  // gap appears at the right spot.
  for (let i = 0; i < el.points.length - 1; i++) {
    if (!alive[i] || !alive[i + 1]) continue
    const a = el.points[i]
    const b = el.points[i + 1]
    const ax = a.x * size.w
    const ay = a.y * size.h
    const bx = b.x * size.w
    const by = b.y * size.h
    if (segmentDistSq(ax, ay, bx, by, tipPx.x, tipPx.y) > hitDistSq) continue
    const da = (ax - tipPx.x) ** 2 + (ay - tipPx.y) ** 2
    const db = (bx - tipPx.x) ** 2 + (by - tipPx.y) ** 2
    if (da < db) alive[i] = false
    else alive[i + 1] = false
  }

  // No change: nothing was hit.
  if (alive.every((a) => a)) return null

  // Group consecutive alive points into fragments.
  const fragments: Pt[][] = []
  let cur: Pt[] = []
  for (let i = 0; i < el.points.length; i++) {
    if (alive[i]) {
      cur.push(el.points[i])
    } else if (cur.length > 0) {
      fragments.push(cur)
      cur = []
    }
  }
  if (cur.length > 0) fragments.push(cur)

  // Drop single-point fragments that came from a multi-point original
  // (they're visually noise; a lone surviving sample isn't a meaningful stroke).
  const keep = el.points.length === 1 ? fragments : fragments.filter((pts) => pts.length >= 2)

  return keep.map((pts, idx) => ({
    ...el,
    id: idx === 0 ? el.id : globalThis.crypto.randomUUID(),
    points: pts,
  }))
}

/** Apply the eraser to every element. Returns a new elements array if
 *  anything changed, else null (caller can skip the store update). */
export function applyErase(
  elements: WhiteboardElement[],
  tipPx: { x: number; y: number },
  size: GameSize,
  eraserRadiusPx: number = DEFAULT_ERASER_RADIUS_PX,
): WhiteboardElement[] | null {
  const next: WhiteboardElement[] = []
  let changed = false
  for (const el of elements) {
    if (el.type === 'stroke') {
      const result = eraseStroke(el, tipPx, eraserRadiusPx, size)
      if (result === null) {
        next.push(el)
      } else {
        changed = true
        next.push(...result)
      }
      continue
    }
    if (el.type === 'shape' || el.type === 'text') {
      if (bboxIntersectsTip(el.bbox, tipPx, eraserRadiusPx, size)) {
        changed = true
        // whole-element delete
        continue
      }
      next.push(el)
      continue
    }
    next.push(el)
  }
  return changed ? next : null
}
