import type { RulerElement } from '../../../../../shared/whiteboard-types'
import type { GameSize } from '../coords'
import { screenToGround } from '../poe-projection'

const COMMIT_THRESHOLD_PX = 4

export interface RulerSession {
  id: string
  version: 1 | 2
  color: string
  strokeWidth: number
  anchorPx: { x: number; y: number }
  cursorPx: { x: number; y: number }
}

export function startRuler(opts: {
  version: 1 | 2
  color: string
  strokeWidth: number
  anchorPx: { x: number; y: number }
  size: GameSize
}): RulerSession {
  return {
    id: globalThis.crypto.randomUUID(),
    version: opts.version,
    color: opts.color,
    strokeWidth: opts.strokeWidth,
    anchorPx: { ...opts.anchorPx },
    cursorPx: { ...opts.anchorPx },
  }
}

export function updateRulerEnd(s: RulerSession, cursorPx: { x: number; y: number }): void {
  s.cursorPx = { ...cursorPx }
}

export function commitRuler(s: RulerSession, size: GameSize): RulerElement | null {
  const dx = s.cursorPx.x - s.anchorPx.x
  const dy = s.cursorPx.y - s.anchorPx.y
  if (Math.abs(dx) < COMMIT_THRESHOLD_PX && Math.abs(dy) < COMMIT_THRESHOLD_PX) return null

  const a = screenToGround(s.version, { x: s.anchorPx.x / size.w, y: s.anchorPx.y / size.h }, size)
  const b = screenToGround(s.version, { x: s.cursorPx.x / size.w, y: s.cursorPx.y / size.h }, size)
  if (!a || !b) return null

  return {
    id: s.id,
    z: 0,
    rotation: 0,
    type: 'ruler',
    a,
    b,
    stroke: s.color,
    strokeWidth: s.strokeWidth,
  }
}
