import type { GameSize } from '../coords'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const MIN_FRACTION = 1e-4

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/** New source rect after dragging the ghost by a pixel delta, clamped so it
 *  stays inside the client. Size is unchanged. */
export function moveSource(source: Rect, deltaPx: { x: number; y: number }, size: GameSize): Rect {
  const x = clamp(source.x + deltaPx.x / size.w, 0, 1 - source.w)
  const y = clamp(source.y + deltaPx.y / size.h, 0, 1 - source.h)
  return { ...source, x, y }
}

/** New source rect from the ghost's baked pixel rect (top-left + size in px),
 *  normalized and clamped into the client. */
export function resizeSourceFromPx(rectPx: Rect, size: GameSize): Rect {
  const w = clamp(rectPx.w / size.w, MIN_FRACTION, 1)
  const h = clamp(rectPx.h / size.h, MIN_FRACTION, 1)
  const x = clamp(rectPx.x / size.w, 0, 1 - w)
  const y = clamp(rectPx.y / size.h, 0, 1 - h)
  return { x, y, w, h }
}

/** The dest height (normalized) that keeps the dest aspect equal to the source
 *  aspect, preserving dest width. Because both rects are normalized to the same
 *  client, the size factors cancel and this is just `bbox.w * source.h /
 *  source.w`. */
export function destHeightForSourceAspect(bbox: Rect, source: Rect): number {
  const sw = Math.max(MIN_FRACTION, source.w)
  return (bbox.w * source.h) / sw
}
