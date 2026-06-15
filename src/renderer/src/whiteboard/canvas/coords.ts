import type { Pt } from '@shared/whiteboard-types'

export interface GameSize {
  w: number
  h: number
}

export function toPixels(p: Pt, size: GameSize): { x: number; y: number } {
  return { x: p.x * size.w, y: p.y * size.h }
}

export function fromPixels(p: { x: number; y: number }, size: GameSize): Pt {
  return { x: p.x / size.w, y: p.y / size.h }
}

/** Convert a normalized stroke width (fraction of game height) to pixels. */
export function widthToPixels(normalized: number, size: GameSize): number {
  return normalized * size.h
}
