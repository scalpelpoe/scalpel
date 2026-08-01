import type { LiveMirrorElement } from '@shared/whiteboard-types'
import { fromPixels, type GameSize } from '../coords'
import { bboxFromAnchorAndCursor } from './shape'

const COMMIT_THRESHOLD_PX = 4

export interface MirrorSession {
  id: string
  anchorPx: { x: number; y: number }
  cursorPx: { x: number; y: number }
}

export function startMirror(opts: { anchorPx: { x: number; y: number } }): MirrorSession {
  return {
    id: globalThis.crypto.randomUUID(),
    anchorPx: { ...opts.anchorPx },
    cursorPx: { ...opts.anchorPx },
  }
}

export function updateMirrorEnd(s: MirrorSession, cursorPx: { x: number; y: number }): void {
  s.cursorPx = { ...cursorPx }
}

/** Normalized rect (top-left + size) from the drag, or null if sub-threshold. */
function normalizedRect(s: MirrorSession, size: GameSize): { x: number; y: number; w: number; h: number } | null {
  const r = bboxFromAnchorAndCursor(s.anchorPx, s.cursorPx, false, 'bbox')
  if (r.w < COMMIT_THRESHOLD_PX && r.h < COMMIT_THRESHOLD_PX) return null
  const tl = fromPixels({ x: r.x, y: r.y }, size)
  return { x: tl.x, y: tl.y, w: r.w / size.w, h: r.h / size.h }
}

/** Commit a fresh mirror: source and dest start equal (the captured rect), both
 *  normalized. Null if the drag was sub-threshold. */
export function commitMirror(s: MirrorSession, size: GameSize): LiveMirrorElement | null {
  const rect = normalizedRect(s, size)
  if (!rect) return null
  return {
    id: s.id,
    z: 0,
    rotation: 0,
    type: 'liveMirror',
    source: rect,
    bbox: { ...rect },
  }
}
