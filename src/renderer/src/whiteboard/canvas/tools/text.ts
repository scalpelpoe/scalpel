import type { TextElement } from '@shared/whiteboard-types'
import { fromPixels, type GameSize } from '../coords'

const DEFAULT_BBOX_W_PX = 200
const DEFAULT_BBOX_H_PX = 40

export function createTextAt(opts: {
  pointPx: { x: number; y: number }
  color: string
  fontSize: number
  size: GameSize
}): TextElement {
  const tl = fromPixels(opts.pointPx, opts.size)
  return {
    id: globalThis.crypto.randomUUID(),
    z: 0,
    rotation: 0,
    type: 'text',
    bbox: {
      x: tl.x,
      y: tl.y,
      w: DEFAULT_BBOX_W_PX / opts.size.w,
      h: DEFAULT_BBOX_H_PX / opts.size.h,
    },
    text: '',
    color: opts.color,
    fontSize: opts.fontSize,
    fontWeight: 600,
  }
}

let measureCanvas: HTMLCanvasElement | null = null

/** Bonus pixels added to the measured text width so Konva.Text's wrap check
 *  doesn't tip over due to subpixel anti-aliasing or measurement drift
 *  between canvas measureText and Konva's internal layout. Without this,
 *  rotating a text whose bbox was sized exactly to its content can flip the
 *  last word onto a second line. */
const TEXT_WIDTH_BUFFER_PX = 2

/** Measure a text block in pixels using the same font Konva.Text uses, then
 *  return normalized bbox dimensions for the element schema. Used after a
 *  text edit to snap the bbox to the actual rendered text size so the
 *  Transformer handles wrap correctly. */
export function measureTextBbox(text: string, fontSizeNormalized: number, size: GameSize): { w: number; h: number } {
  const fontSizePx = fontSizeNormalized * size.h
  if (typeof document !== 'undefined' && !measureCanvas) {
    measureCanvas = document.createElement('canvas')
  }
  const ctx = measureCanvas?.getContext('2d') ?? null
  if (!ctx) {
    // Fallback for non-DOM environments (vitest node env): approximate via char count.
    const lines = text.split('\n')
    const widest = Math.max(0, ...lines.map((l) => l.length * fontSizePx * 0.55))
    const lineCount = Math.max(1, lines.length)
    return {
      w: (Math.max(widest, fontSizePx) + TEXT_WIDTH_BUFFER_PX) / size.w,
      h: (lineCount * fontSizePx * 1.2) / size.h,
    }
  }
  ctx.font = `600 ${fontSizePx}px 'Segoe UI', system-ui`
  const lines = text.length === 0 ? [''] : text.split('\n')
  let maxW = 0
  for (const line of lines) {
    const m = ctx.measureText(line)
    if (m.width > maxW) maxW = m.width
  }
  const lineHeightPx = fontSizePx * 1.2
  return {
    w: (Math.ceil(Math.max(maxW, fontSizePx)) + TEXT_WIDTH_BUFFER_PX) / size.w,
    h: (lines.length * lineHeightPx) / size.h,
  }
}
