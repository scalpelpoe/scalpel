import type { RadiusRingElement } from '../../../../../shared/whiteboard-types'
import type { GameSize } from '../coords'
import { groundDistance, screenToGround } from '../poe-projection'

const COMMIT_THRESHOLD_PX = 4

export interface RadiusSession {
  id: string
  version: 1 | 2
  color: string
  strokeWidth: number
  centerPx: { x: number; y: number }
  cursorPx: { x: number; y: number }
}

export function startRadius(opts: {
  version: 1 | 2
  color: string
  strokeWidth: number
  anchorPx: { x: number; y: number }
  size: GameSize
}): RadiusSession {
  return {
    id: globalThis.crypto.randomUUID(),
    version: opts.version,
    color: opts.color,
    strokeWidth: opts.strokeWidth,
    centerPx: { ...opts.anchorPx },
    cursorPx: { ...opts.anchorPx },
  }
}

export function updateRadiusEnd(s: RadiusSession, cursorPx: { x: number; y: number }): void {
  s.cursorPx = { ...cursorPx }
}

export function commitRadius(s: RadiusSession, size: GameSize): RadiusRingElement | null {
  const dx = s.cursorPx.x - s.centerPx.x
  const dy = s.cursorPx.y - s.centerPx.y
  if (Math.abs(dx) < COMMIT_THRESHOLD_PX && Math.abs(dy) < COMMIT_THRESHOLD_PX) return null

  const center = screenToGround(s.version, { x: s.centerPx.x / size.w, y: s.centerPx.y / size.h }, size)
  const edge = screenToGround(s.version, { x: s.cursorPx.x / size.w, y: s.cursorPx.y / size.h }, size)
  if (!center || !edge) return null

  return {
    id: s.id,
    z: 0,
    rotation: 0,
    type: 'radiusRing',
    center,
    radius: groundDistance(center, edge),
    stroke: s.color,
    strokeWidth: s.strokeWidth,
    fill: null,
  }
}
