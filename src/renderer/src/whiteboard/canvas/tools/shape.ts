import type { ShapeElement } from '@shared/whiteboard-types'
import { fromPixels, type GameSize } from '../coords'

const COMMIT_THRESHOLD_PX = 4

/** Hex alpha suffix appended to the stroke color for closed shapes. 75%
 *  opacity (0xBF / 255) - bold highlight while still letting some of the
 *  game show through. */
const FILL_ALPHA_HEX = 'bf'

/** Default fill for a freshly-drawn shape. Closed shapes get a translucent
 *  fill so streamers can highlight a region without blocking the game;
 *  line/arrow stay unfilled (the arrowhead reads `stroke` directly). */
export function shapeDefaultFill(shape: ShapeElement['shape'], color: string): string | null {
  if (shape === 'line' || shape === 'arrow') return null
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color + FILL_ALPHA_HEX
  return color
}

export interface ShapeSession {
  id: string
  shape: ShapeElement['shape']
  color: string
  strokeWidth: number
  anchorPx: { x: number; y: number }
  cursorPx: { x: number; y: number }
}

export function startShape(opts: {
  shape: ShapeElement['shape']
  color: string
  strokeWidth: number
  anchorPx: { x: number; y: number }
  size: GameSize
}): ShapeSession {
  return {
    id: globalThis.crypto.randomUUID(),
    shape: opts.shape,
    color: opts.color,
    strokeWidth: opts.strokeWidth,
    anchorPx: { ...opts.anchorPx },
    cursorPx: { ...opts.anchorPx },
  }
}

export function updateShapeEnd(
  s: ShapeSession,
  cursorPx: { x: number; y: number },
  _size: GameSize,
  _shiftKey: boolean,
): void {
  // Shift constraint is applied at render/commit time via bboxFromAnchorAndCursor
  // so we always carry the raw cursor here. Storing the raw cursor lets callers
  // re-derive constrained bbox + endpoints whenever the modifier state changes.
  s.cursorPx = { ...cursorPx }
}

/** Compute the bbox or endpoint pair from anchor + cursor.
 *
 *  mode = 'bbox': returned w/h are always non-negative, x/y is the top-left.
 *  mode = 'endpoints': returned w/h are signed; (x, y) is the anchor and
 *    (x + w, y + h) is the cursor. Used by line/arrow so direction is preserved. */
export function bboxFromAnchorAndCursor(
  anchorPx: { x: number; y: number },
  cursorPx: { x: number; y: number },
  shiftKey: boolean,
  mode: 'bbox' | 'endpoints',
): { x: number; y: number; w: number; h: number } {
  let dx = cursorPx.x - anchorPx.x
  let dy = cursorPx.y - anchorPx.y

  if (shiftKey) {
    if (mode === 'bbox') {
      const m = Math.max(Math.abs(dx), Math.abs(dy))
      dx = m * Math.sign(dx || 1)
      dy = m * Math.sign(dy || 1)
    } else {
      // endpoints: snap to nearest 45 deg
      // Use max(|dx|, |dy|) as the basis magnitude so the longer axis is
      // preserved. At 45-degree angles both components equal that magnitude;
      // at 0/90/180/270 one component is the magnitude and the other is 0.
      const m = Math.max(Math.abs(dx), Math.abs(dy))
      const angle = Math.atan2(dy, dx)
      const step = Math.PI / 4
      const snapped = Math.round(angle / step) * step
      const cosS = Math.cos(snapped)
      const sinS = Math.sin(snapped)
      // Scale so that max(|dx|, |dy|) stays at m, then round to whole pixels
      const maxComponent = Math.max(Math.abs(cosS), Math.abs(sinS))
      dx = maxComponent > 1e-9 ? Math.round((m * cosS) / maxComponent) : 0
      dy = maxComponent > 1e-9 ? Math.round((m * sinS) / maxComponent) : 0
    }
  }

  if (mode === 'bbox') {
    const x = dx >= 0 ? anchorPx.x : anchorPx.x + dx
    const y = dy >= 0 ? anchorPx.y : anchorPx.y + dy
    return { x, y, w: Math.abs(dx), h: Math.abs(dy) }
  }
  return { x: anchorPx.x, y: anchorPx.y, w: dx, h: dy }
}

export function commitShape(s: ShapeSession, size: GameSize): ShapeElement | null {
  const isEndpoints = s.shape === 'line' || s.shape === 'arrow'
  const r = bboxFromAnchorAndCursor(s.anchorPx, s.cursorPx, false, isEndpoints ? 'endpoints' : 'bbox')

  const wAbs = Math.abs(r.w)
  const hAbs = Math.abs(r.h)
  if (wAbs < COMMIT_THRESHOLD_PX && hAbs < COMMIT_THRESHOLD_PX) return null

  const tl = fromPixels({ x: r.x, y: r.y }, size)
  const wN = r.w / size.w
  const hN = r.h / size.h

  return {
    id: s.id,
    z: 0,
    rotation: 0,
    type: 'shape',
    shape: s.shape,
    bbox: { x: tl.x, y: tl.y, w: wN, h: hN },
    stroke: s.color,
    strokeWidth: s.strokeWidth,
    fill: shapeDefaultFill(s.shape, s.color),
  }
}
