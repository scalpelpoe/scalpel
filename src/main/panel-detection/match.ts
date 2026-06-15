import type { PanelState } from '@shared/panel-state'

/** A captured frame as BGRA pixel data (the format NativeImage.toBitmap yields),
 *  cropped so (0,0) is the game-window top-left. */
export interface BitmapView {
  data: Buffer
  width: number
  height: number
}

export interface PanelSample {
  side: 'left' | 'right'
  /** Position in the 3840x2160 reference frame. Negative x = from the right edge. */
  pos: { x: number; y: number }
  rgbMin: { r: number; g: number; b: number }
  rgbMax: { r: number; g: number; b: number }
}

export interface PatchRect {
  x: number
  y: number
  size: number
}

const REF_HEIGHT = 2160

/** Resolve a reference-frame sample to an absolute patch rect inside `frame`.
 *  Coords scale by frame.height / 2160; patch side = round(frame.height / 360). */
export function patchRect(sample: PanelSample, frame: BitmapView): PatchRect {
  const scale = frame.height / REF_HEIGHT
  const size = Math.max(1, Math.round(frame.height / 360))
  const x = sample.pos.x >= 0 ? sample.pos.x * scale : frame.width + sample.pos.x * scale
  const y = sample.pos.y * scale
  return { x: Math.round(x), y: Math.round(y), size }
}

function patchInBounds(rect: PatchRect, frame: BitmapView): boolean {
  return rect.x >= 0 && rect.y >= 0 && rect.x + rect.size <= frame.width && rect.y + rect.size <= frame.height
}

/** True when every pixel in the sample's patch falls within [rgbMin, rgbMax]. */
export function matchPatchFuzzy(frame: BitmapView, sample: PanelSample): boolean {
  const rect = patchRect(sample, frame)
  if (!patchInBounds(rect, frame)) return false
  const { rgbMin: lo, rgbMax: hi } = sample
  for (let dy = 0; dy < rect.size; dy++) {
    for (let dx = 0; dx < rect.size; dx++) {
      const off = ((rect.y + dy) * frame.width + (rect.x + dx)) * 4
      const b = frame.data[off]
      const g = frame.data[off + 1]
      const r = frame.data[off + 2]
      if (r < lo.r || r > hi.r || g < lo.g || g > hi.g || b < lo.b || b > hi.b) return false
    }
  }
  return true
}

/** Copy a patch's raw pixel bytes into a flat array (BGR channel order, matching
 *  the BGRA source), for an exact byte comparison later. */
export function readPatch(frame: BitmapView, rect: PatchRect): Uint8Array {
  const out = new Uint8Array(rect.size * rect.size * 3)
  let i = 0
  for (let dy = 0; dy < rect.size; dy++) {
    for (let dx = 0; dx < rect.size; dx++) {
      const off = ((rect.y + dy) * frame.width + (rect.x + dx)) * 4
      out[i++] = frame.data[off]
      out[i++] = frame.data[off + 1]
      out[i++] = frame.data[off + 2]
    }
  }
  return out
}

/** True when the patch in `frame` exactly equals the cached patch bytes. */
export function matchPatchExact(frame: BitmapView, rect: PatchRect, cached: Uint8Array): boolean {
  if (!patchInBounds(rect, frame)) return false
  const cur = readPatch(frame, rect)
  if (cur.length !== cached.length) return false
  for (let i = 0; i < cur.length; i++) if (cur[i] !== cached[i]) return false
  return true
}

/** A side is open when >= 2 of its 4 indicators matched. `matched[i]` aligns
 *  with `samples[i]`; the side is read from each sample, so ordering is robust. */
export function votePanels(samples: PanelSample[], matched: boolean[]): PanelState {
  let left = 0
  let right = 0
  samples.forEach((s, i) => {
    if (!matched[i]) return
    if (s.side === 'left') left++
    else right++
  })
  return { leftPanelOpen: left >= 2, rightPanelOpen: right >= 2 }
}
