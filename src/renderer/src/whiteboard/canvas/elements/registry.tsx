import type {
  ImageElement as ImageEl,
  Pt,
  RadiusRingElement as RingEl,
  RulerElement as RulerEl,
  ShapeElement as ShapeEl,
  StrokeElement as StrokeEl,
  TextElement as TextEl,
  WhiteboardElement,
} from '../../../../../shared/whiteboard-types'
import type { GameSize } from '../coords'
import {
  bakeImageFromTransformResult,
  bakeShapeFromTransformResult,
  bakeStrokeFromTransformResult,
  bakeTextFromTransformResult,
  type BboxTransformResult,
  type StrokeTransformResult,
} from '../tools/transform'
import { ImageElement } from './ImageElement'
import { RadiusRingElement } from './RadiusRingElement'
import { RulerElement } from './RulerElement'
import { ShapeElement } from './ShapeElement'
import { StrokeElement } from './StrokeElement'
import { TextElement } from './TextElement'

/** Context Stage threads into each kind's renderer. The handlers take the
 *  element id so dispatch back into the store stays single-source-of-truth
 *  (Stage doesn't capture a stale element reference in a closure). */
export interface ElementRenderContext {
  size: GameSize
  /** Active PoE version, or null until resolved. The distance kinds (ruler,
   *  radiusRing) need it to project and render nothing when null. */
  version: 1 | 2 | null
  draggable: boolean
  editingTextId: string | null
  onDragEnd: (id: string, delta: Pt) => void
  onTransformEnd: (id: string, next: StrokeTransformResult | BboxTransformResult) => void
  onTextDoubleClick: (id: string) => void
}

/** Per-element-kind contract. Adding a new kind:
 *    1. Define its type in `src/shared/whiteboard-types.ts`
 *    2. Add a validator to `ELEMENT_VALIDATORS` there
 *    3. Add a renderer component under `./elements/`
 *    4. Add an entry here. The toolbar / tool registration is separate. */
interface ElementKindDef<E extends WhiteboardElement, TResult> {
  render: (el: E, ctx: ElementRenderContext) => JSX.Element
  applyDragDelta: (el: E, delta: Pt, size: GameSize) => E
  bakeTransform: (el: E, next: TResult, size: GameSize) => E
}

const strokeKind: ElementKindDef<StrokeEl, StrokeTransformResult> = {
  applyDragDelta: (el, delta, size) => ({
    ...el,
    points: el.points.map((p) => ({ x: p.x + delta.x / size.w, y: p.y + delta.y / size.h })),
  }),
  bakeTransform: bakeStrokeFromTransformResult,
  render: (el, ctx) => (
    <StrokeElement
      key={el.id}
      element={el}
      size={ctx.size}
      draggable={ctx.draggable}
      onDragEnd={(delta) => ctx.onDragEnd(el.id, delta)}
      onTransformEnd={(next) => ctx.onTransformEnd(el.id, next)}
    />
  ),
}

const shapeKind: ElementKindDef<ShapeEl, BboxTransformResult> = {
  applyDragDelta: (el, delta, size) => ({
    ...el,
    bbox: { ...el.bbox, x: el.bbox.x + delta.x / size.w, y: el.bbox.y + delta.y / size.h },
  }),
  bakeTransform: bakeShapeFromTransformResult,
  render: (el, ctx) => (
    <ShapeElement
      key={el.id}
      element={el}
      size={ctx.size}
      draggable={ctx.draggable}
      onDragEnd={(delta) => ctx.onDragEnd(el.id, delta)}
      onTransformEnd={(next) => ctx.onTransformEnd(el.id, next)}
    />
  ),
}

const textKind: ElementKindDef<TextEl, BboxTransformResult> = {
  applyDragDelta: (el, delta, size) => ({
    ...el,
    bbox: { ...el.bbox, x: el.bbox.x + delta.x / size.w, y: el.bbox.y + delta.y / size.h },
  }),
  bakeTransform: bakeTextFromTransformResult,
  render: (el, ctx) => (
    <TextElement
      key={el.id}
      element={el}
      size={ctx.size}
      draggable={ctx.draggable}
      visible={el.id !== ctx.editingTextId}
      onDoubleClick={() => ctx.onTextDoubleClick(el.id)}
      onDragEnd={(delta) => ctx.onDragEnd(el.id, delta)}
      onTransformEnd={(next) => ctx.onTransformEnd(el.id, next)}
    />
  ),
}

const imageKind: ElementKindDef<ImageEl, BboxTransformResult> = {
  applyDragDelta: (el, delta, size) => ({
    ...el,
    bbox: { ...el.bbox, x: el.bbox.x + delta.x / size.w, y: el.bbox.y + delta.y / size.h },
  }),
  bakeTransform: bakeImageFromTransformResult,
  render: (el, ctx) => (
    <ImageElement
      key={el.id}
      element={el}
      size={ctx.size}
      draggable={ctx.draggable}
      onDragEnd={(delta) => ctx.onDragEnd(el.id, delta)}
      onTransformEnd={(next) => ctx.onTransformEnd(el.id, next)}
    />
  ),
}

const rulerKind: ElementKindDef<RulerEl, BboxTransformResult> = {
  applyDragDelta: (el) => el,
  bakeTransform: (el) => el,
  render: (el, ctx) => <RulerElement key={el.id} element={el} size={ctx.size} version={ctx.version} />,
}

const radiusRingKind: ElementKindDef<RingEl, BboxTransformResult> = {
  applyDragDelta: (el) => el,
  bakeTransform: (el) => el,
  render: (el, ctx) => <RadiusRingElement key={el.id} element={el} size={ctx.size} version={ctx.version} />,
}

// biome-ignore lint/suspicious/noExplicitAny: heterogeneous element-kind registry
export const ELEMENT_KINDS: Record<WhiteboardElement['type'], ElementKindDef<any, any>> = {
  stroke: strokeKind,
  shape: shapeKind,
  text: textKind,
  image: imageKind,
  ruler: rulerKind,
  radiusRing: radiusRingKind,
}

/** Dispatch render to the right kind. The cast at the boundary is safe
 *  because each `ElementKindDef` operates on its own discriminated subtype. */
export function renderElement(el: WhiteboardElement, ctx: ElementRenderContext): JSX.Element | null {
  const def = ELEMENT_KINDS[el.type]
  if (!def) return null
  return def.render(el, ctx)
}

/** Shift any element by a pixel delta. Used by Stage's drag-end handler. */
export function applyDragDelta(el: WhiteboardElement, delta: Pt, size: GameSize): WhiteboardElement {
  const def = ELEMENT_KINDS[el.type]
  if (!def) return el
  return def.applyDragDelta(el, delta, size)
}

/** Bake a Konva transform result back into the element's stored shape. The
 *  `next` shape differs per kind (stroke baked points vs bbox + scale + rot);
 *  the registry routes to the right `bakeTransform`. */
export function bakeTransform(
  el: WhiteboardElement,
  next: StrokeTransformResult | BboxTransformResult,
  size: GameSize,
): WhiteboardElement {
  const def = ELEMENT_KINDS[el.type]
  if (!def) return el
  return def.bakeTransform(el, next, size)
}
