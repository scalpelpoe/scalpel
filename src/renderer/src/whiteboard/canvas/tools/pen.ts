import type Konva from 'konva'
import { fromPixels, type GameSize } from '../coords'
import type { StrokeElement, Pt } from '@shared/whiteboard-types'

export interface PenSession {
  id: string
  variant: 'pen' | 'highlighter'
  color: string
  width: number
  points: Pt[]
}

export function startStroke(opts: {
  variant: 'pen' | 'highlighter'
  color: string
  width: number
  startStagePt: { x: number; y: number }
  size: GameSize
}): PenSession {
  return {
    id: globalThis.crypto.randomUUID(),
    variant: opts.variant,
    color: opts.color,
    width: opts.width,
    points: [fromPixels(opts.startStagePt, opts.size)],
  }
}

/** Minimum pixel distance between consecutive stored samples. High pointer
 *  rates (120Hz+) can deposit several points per millimetre; the cardinal
 *  spline overemphasises every micro-jitter, so we drop redundant samples
 *  before they hit the renderer. Tuned to feel smooth without losing detail. */
const MIN_POINT_DIST_PX = 2

export function appendPoint(s: PenSession, stagePt: { x: number; y: number }, size: GameSize): void {
  const prev = s.points[s.points.length - 1]
  if (prev) {
    const dx = stagePt.x - prev.x * size.w
    const dy = stagePt.y - prev.y * size.h
    if (dx * dx + dy * dy < MIN_POINT_DIST_PX * MIN_POINT_DIST_PX) return
  }
  s.points.push(fromPixels(stagePt, size))
}

export function commitStroke(s: PenSession): StrokeElement {
  return {
    id: s.id,
    z: 0,
    rotation: 0,
    type: 'stroke',
    variant: s.variant,
    points: s.points,
    color: s.color,
    width: s.width,
  }
}

/** Read pointer position from a Konva stage event in stage-local pixels. */
export function getStagePointer(stage: Konva.Stage): { x: number; y: number } | null {
  const p = stage.getPointerPosition()
  return p ? { x: p.x, y: p.y } : null
}
