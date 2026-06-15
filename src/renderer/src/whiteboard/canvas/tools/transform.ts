import type Konva from 'konva'
import type { ImageElement, ShapeElement, StrokeElement, TextElement } from '@shared/whiteboard-types'
import type { GameSize } from '../coords'

export interface StrokeTransformResult {
  /** Stroke points in stage pixels, after the full transform has been baked. Flat [x0, y0, x1, y1, ...]. */
  pointsPx: number[]
}

export interface BboxTransformResult {
  /** Konva node.position() in stage pixels after the Transformer drag ends.
   *  Semantics depend on how the caller renders the node: for centered-origin
   *  shapes this is the new visual center; for top-left-origin text this is
   *  the new visual top-left. The bake function for each element type knows
   *  which one to expect. */
  positionPx: { x: number; y: number }
  /** Absolute scale applied along x, signed. */
  scaleX: number
  /** Absolute scale applied along y, signed. */
  scaleY: number
  /** Rotation in radians. */
  rotationRad: number
}

export function bakeStrokeFromTransformResult(
  el: StrokeElement,
  next: StrokeTransformResult,
  size: GameSize,
): StrokeElement {
  const points = []
  for (let i = 0; i < next.pointsPx.length; i += 2) {
    points.push({ x: next.pointsPx[i] / size.w, y: next.pointsPx[i + 1] / size.h })
  }
  // Width is preserved across scaling. The Konva node renders with
  // strokeScaleEnabled=false so the visual stroke is already constant during
  // the drag, and the stored value matches what's on screen.
  return {
    ...el,
    points,
  }
}

export function bakeShapeFromTransformResult(
  el: ShapeElement,
  next: BboxTransformResult,
  size: GameSize,
): ShapeElement {
  // Shapes render with their rotation pivot at the bbox center, so
  // `positionPx` is the new center. We scale the *original* bbox dimensions
  // (preserving signed w/h for line/arrow direction) and re-derive the
  // top-left from the new center.
  const oldWpx = el.bbox.w * size.w
  const oldHpx = el.bbox.h * size.h
  const sxAbs = Math.abs(next.scaleX)
  const syAbs = Math.abs(next.scaleY)
  const newWpx = oldWpx * sxAbs
  const newHpx = oldHpx * syAbs
  const newXpx = next.positionPx.x - newWpx / 2
  const newYpx = next.positionPx.y - newHpx / 2
  return {
    ...el,
    bbox: {
      x: newXpx / size.w,
      y: newYpx / size.h,
      w: newWpx / size.w,
      h: newHpx / size.h,
    },
    rotation: next.rotationRad,
    // strokeWidth is preserved across scaling. The Konva node renders with
    // strokeScaleEnabled=false so the border visually stays a constant pixel
    // width during the drag, and the stored value matches.
    strokeWidth: el.strokeWidth,
  }
}

/** How close to identity a scale value has to be before we treat it as
 *  exactly 1 in the bake. A pure rotation shouldn't change scale at all,
 *  but Konva's matrix composition can leave behind floating-point noise
 *  that, multiplied through bbox.w, drifts the stored width by a sub-pixel
 *  and flips Konva.Text wrapping on text sized exactly to its content. */
const SCALE_IDENTITY_EPS = 1e-3

/** Read a bbox-style Konva node's transform after the user releases a
 *  Transformer drag, then reset scale to identity. Rotation and position are
 *  intentionally NOT reset: they're written via React-Konva props on the next
 *  render, and since the new prop value usually equals the value Konva left
 *  on the node (e.g. after a pure scale, rotation didn't change), React-Konva
 *  diffs and skips re-applying the prop. If we reset rotation to 0 here, that
 *  zero would stick because the prop diff is a no-op, and the shape would
 *  visually un-rotate. Scale must still be reset because we don't pass
 *  scaleX/Y as props. */
export function readAndResetBboxTransform(node: Konva.Node): BboxTransformResult {
  const sxRaw = node.scaleX()
  const syRaw = node.scaleY()
  // Snap near-identity scales to exactly 1 so pure rotations don't drift
  // bbox dimensions by floating-point noise.
  const sx = Math.abs(Math.abs(sxRaw) - 1) < SCALE_IDENTITY_EPS ? Math.sign(sxRaw) || 1 : sxRaw
  const sy = Math.abs(Math.abs(syRaw) - 1) < SCALE_IDENTITY_EPS ? Math.sign(syRaw) || 1 : syRaw
  const rotDeg = node.rotation()
  const pos = node.position()
  node.scaleX(1)
  node.scaleY(1)
  return {
    positionPx: { x: pos.x, y: pos.y },
    scaleX: sx,
    scaleY: sy,
    rotationRad: (rotDeg * Math.PI) / 180,
  }
}

export function bakeTextFromTransformResult(el: TextElement, next: BboxTransformResult, size: GameSize): TextElement {
  // Text renders with its rotation pivot at the bbox top-left (Konva.Text's
  // natural origin), so `positionPx` is the new top-left.
  const oldWpx = el.bbox.w * size.w
  const oldHpx = el.bbox.h * size.h
  const sxAbs = Math.abs(next.scaleX)
  const syAbs = Math.abs(next.scaleY)
  return {
    ...el,
    bbox: {
      x: next.positionPx.x / size.w,
      y: next.positionPx.y / size.h,
      w: (oldWpx * sxAbs) / size.w,
      h: (oldHpx * syAbs) / size.h,
    },
    rotation: next.rotationRad,
    fontSize: el.fontSize * Math.sqrt(sxAbs * syAbs),
  }
}

export function bakeImageFromTransformResult(
  el: ImageElement,
  next: BboxTransformResult,
  size: GameSize,
): ImageElement {
  // Image renders with its rotation pivot at the bbox top-left (Konva.Image's
  // natural origin), so `positionPx` is the new top-left. Same shape as the
  // text bake without the per-element font-size rescale.
  const oldWpx = el.bbox.w * size.w
  const oldHpx = el.bbox.h * size.h
  const sxAbs = Math.abs(next.scaleX)
  const syAbs = Math.abs(next.scaleY)
  return {
    ...el,
    bbox: {
      x: next.positionPx.x / size.w,
      y: next.positionPx.y / size.h,
      w: (oldWpx * sxAbs) / size.w,
      h: (oldHpx * syAbs) / size.h,
    },
    rotation: next.rotationRad,
  }
}
