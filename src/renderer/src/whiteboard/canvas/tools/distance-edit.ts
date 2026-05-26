import type { Pt, RadiusRingElement, RulerElement } from '../../../../../shared/whiteboard-types'
import type { GameSize } from '../coords'
import { groundDistance, screenToGround } from '../poe-projection'

/** Floor radius (units) so a ring can't collapse to an unselectable dot. */
const MIN_RADIUS_UNITS = 1

export type RingEdit = { kind: 'ring-radius' } | { kind: 'ring-move'; grabGround: Pt; startCenter: Pt }

export type RulerEdit =
  | { kind: 'ruler-a' }
  | { kind: 'ruler-b' }
  | { kind: 'ruler-move'; grabGround: Pt; startA: Pt; startB: Pt }

/** Next ring after applying `edit` for the given cursor (normalized full-window
 *  screen coords). World-space, so the projected ellipse reshapes on render.
 *  No-op if the version is unsupported or the cursor misses the ground plane. */
export function applyRingEdit(
  el: RadiusRingElement,
  edit: RingEdit,
  cursorNorm: Pt,
  size: GameSize,
  version: 1 | 2 | null,
): RadiusRingElement {
  if (version === null) return el
  const g = screenToGround(version, cursorNorm, size)
  if (!g) return el
  if (edit.kind === 'ring-radius') {
    return { ...el, radius: Math.max(MIN_RADIUS_UNITS, groundDistance(el.center, g)) }
  }
  const dx = g.x - edit.grabGround.x
  const dy = g.y - edit.grabGround.y
  return { ...el, center: { x: edit.startCenter.x + dx, y: edit.startCenter.y + dy } }
}

/** Next ruler after applying `edit`. World-space; keeps the distance label exact. */
export function applyRulerEdit(
  el: RulerElement,
  edit: RulerEdit,
  cursorNorm: Pt,
  size: GameSize,
  version: 1 | 2 | null,
): RulerElement {
  if (version === null) return el
  const g = screenToGround(version, cursorNorm, size)
  if (!g) return el
  if (edit.kind === 'ruler-a') return { ...el, a: g }
  if (edit.kind === 'ruler-b') return { ...el, b: g }
  const dx = g.x - edit.grabGround.x
  const dy = g.y - edit.grabGround.y
  return {
    ...el,
    a: { x: edit.startA.x + dx, y: edit.startA.y + dy },
    b: { x: edit.startB.x + dx, y: edit.startB.y + dy },
  }
}
