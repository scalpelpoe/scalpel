import type Konva from 'konva'
import type { WhiteboardElement } from '../../../../../shared/whiteboard-types'
import type { GameSize } from '../coords'
import { groundToScreen, projectCircle } from '../poe-projection'

interface RectPx {
  x: number
  y: number
  w: number
  h: number
}

/** Returns the id of the topmost element under the click, or null. */
export function pickTopElement(stage: Konva.Stage, pointPx: { x: number; y: number }): string | null {
  const node = stage.getIntersection(pointPx)
  if (!node) return null
  // Walk up to find a node carrying an `id` we set on element nodes.
  let cur: Konva.Node | null = node
  while (cur && !cur.id()) cur = cur.getParent() ?? null
  return cur?.id() ?? null
}

/** Axis-aligned bounding box (in stage pixels) of a bbox after applying its
 *  element's rotation around its center. Works for signed bbox.w/h too
 *  (line/arrow direction encoding); the 4-corner sweep produces the same
 *  set of points either way, so min/max is correct. */
function rotatedAabb(bbox: RectPx, rotationRad: number): RectPx {
  if (rotationRad === 0) {
    const x = Math.min(bbox.x, bbox.x + bbox.w)
    const y = Math.min(bbox.y, bbox.y + bbox.h)
    return { x, y, w: Math.abs(bbox.w), h: Math.abs(bbox.h) }
  }
  const cx = bbox.x + bbox.w / 2
  const cy = bbox.y + bbox.h / 2
  const cos = Math.cos(rotationRad)
  const sin = Math.sin(rotationRad)
  const corners = [
    { x: bbox.x, y: bbox.y },
    { x: bbox.x + bbox.w, y: bbox.y },
    { x: bbox.x + bbox.w, y: bbox.y + bbox.h },
    { x: bbox.x, y: bbox.y + bbox.h },
  ]
  let xMin = Infinity
  let yMin = Infinity
  let xMax = -Infinity
  let yMax = -Infinity
  for (const c of corners) {
    const dx = c.x - cx
    const dy = c.y - cy
    const rx = cx + dx * cos - dy * sin
    const ry = cy + dx * sin + dy * cos
    if (rx < xMin) xMin = rx
    if (ry < yMin) yMin = ry
    if (rx > xMax) xMax = rx
    if (ry > yMax) yMax = ry
  }
  return { x: xMin, y: yMin, w: xMax - xMin, h: yMax - yMin }
}

/** AABB of an element in stage pixels, accounting for stored rotation. Strokes
 *  bake their transform into points so they have no rotation field to apply.
 *  `version` is required only for the projection-based kinds (ruler/radiusRing);
 *  omit it (or pass null) and those return a zero box - i.e. not marquee-hittable. */
export function elementAabbPx(el: WhiteboardElement, size: GameSize, version?: 1 | 2 | null): RectPx {
  if (el.type === 'stroke') {
    if (el.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
    let xMin = el.points[0].x
    let yMin = el.points[0].y
    let xMax = xMin
    let yMax = yMin
    for (const p of el.points) {
      if (p.x < xMin) xMin = p.x
      if (p.x > xMax) xMax = p.x
      if (p.y < yMin) yMin = p.y
      if (p.y > yMax) yMax = p.y
    }
    return {
      x: xMin * size.w,
      y: yMin * size.h,
      w: (xMax - xMin) * size.w,
      h: (yMax - yMin) * size.h,
    }
  }
  if (el.type === 'shape' || el.type === 'text' || el.type === 'image') {
    const bbox = {
      x: el.bbox.x * size.w,
      y: el.bbox.y * size.h,
      w: el.bbox.w * size.w,
      h: el.bbox.h * size.h,
    }
    return rotatedAabb(bbox, el.rotation)
  }
  if (el.type === 'ruler') {
    if (version == null) return { x: 0, y: 0, w: 0, h: 0 }
    const a = groundToScreen(version, el.a, size)
    const b = groundToScreen(version, el.b, size)
    if (!a || !b) return { x: 0, y: 0, w: 0, h: 0 }
    const ax = a.x * size.w
    const ay = a.y * size.h
    const bx = b.x * size.w
    const by = b.y * size.h
    return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) }
  }
  if (el.type === 'radiusRing') {
    if (version == null) return { x: 0, y: 0, w: 0, h: 0 }
    const pts = projectCircle(version, el.center, el.radius, size)
    if (pts.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
    let xMin = Infinity
    let yMin = Infinity
    let xMax = -Infinity
    let yMax = -Infinity
    for (const p of pts) {
      const px = p.x * size.w
      const py = p.y * size.h
      if (px < xMin) xMin = px
      if (px > xMax) xMax = px
      if (py < yMin) yMin = py
      if (py > yMax) yMax = py
    }
    return { x: xMin, y: yMin, w: xMax - xMin, h: yMax - yMin }
  }
  return { x: 0, y: 0, w: 0, h: 0 }
}

function aabbIntersects(a: RectPx, b: RectPx): boolean {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y)
}

/** Figma-style marquee hit test: any element whose axis-aligned bounding box
 *  overlaps the marquee rect is included. The marquee rect's w/h are assumed
 *  non-negative (caller normalizes anchor-vs-cursor). */
export function elementsInMarquee(
  elements: readonly WhiteboardElement[],
  marqueePx: RectPx,
  size: GameSize,
  version?: 1 | 2 | null,
): string[] {
  const ids: string[] = []
  for (const el of elements) {
    if (aabbIntersects(elementAabbPx(el, size, version), marqueePx)) ids.push(el.id)
  }
  return ids
}
