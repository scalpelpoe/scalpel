import type { Pt } from '../../../../shared/whiteboard-types'
import type { GameSize } from './coords'

/** Camera/render constants for one PoE game version. Distances are in the
 *  game's internal "units" (the space PoE Rangefinder's camera math lives in);
 *  `metresPerUnit` converts to the metres players think in (1 unit = 0.1 m). */
export interface PoeCameraConstants {
  fovDeg: number
  cameraAngleDeg: number
  cameraDistance: number
  /** Camera world position. `x` is always 0 - both games center the playfield
   *  horizontally - so the projection omits an x term; `y`/`z` drive the
   *  ground-plane intersection. */
  cameraPos: { x: number; y: number; z: number }
  playerOffset: number
  /** Playfield width is clamped to maxAspect * height, centered. */
  maxAspect: number
  metresPerUnit: number
}

/** PoE1 values harvested from ifnjeff/poe-rangefinder (overlay.cpp). PoE2
 *  constants are provisional (eyeball-fit from one screenshot); every function
 *  below returns null for an unsupported version rather than throwing. */
export const CAMERA_CONSTANTS: Record<1 | 2, PoeCameraConstants | null> = {
  1: {
    fovDeg: 45,
    cameraAngleDeg: 33.67,
    cameraDistance: 108.48,
    cameraPos: { x: 0, y: -65.320483, z: 90.28189 },
    playerOffset: 5.178223,
    maxAspect: 2.4,
    metresPerUnit: 0.1,
  },
  // PROVISIONAL: eyeball-fit from a single PoE2 Presence (4 m = 40 unit) ring
  // screenshot at 1920x1080, holding FOV 45 and the 2.4 clamp as PoE1-shared.
  // Reproduces that one circle; not yet validated in-game or against other
  // radii. Refine with an exact screenshot + a second reference.
  2: {
    fovDeg: 45,
    cameraAngleDeg: 42.9,
    cameraDistance: 126.2,
    cameraPos: { x: 0, y: -98.057, z: 92.447 },
    playerOffset: 12.15,
    maxAspect: 2.4,
    metresPerUnit: 0.1,
  },
}

export interface PlayfieldRect {
  left: number
  top: number
  width: number
  height: number
}

/** The world-rendering region inside the game window: full height, width
 *  clamped to maxAspect and centered. Matches the rangefinder's
 *  `min(clientWidth, 2.4*height)` rule. */
export function playfieldRect(version: 1 | 2, size: GameSize): PlayfieldRect {
  const c = CAMERA_CONSTANTS[version]
  const maxAspect = c?.maxAspect ?? size.w / size.h
  const width = Math.min(size.w, maxAspect * size.h)
  return { left: (size.w - width) / 2, top: 0, width, height: size.h }
}

/** Inverse projection: a normalized (0-1 of full window) screen point to the
 *  ground plane (z=0) in world units. Closed-form port of the rangefinder's
 *  `mousePositionOnPlane`. Null for unsupported version / no plane hit. */
export function screenToGround(version: 1 | 2, p: Pt, size: GameSize): Pt | null {
  const c = CAMERA_CONSTANTS[version]
  if (!c) return null
  const pf = playfieldRect(version, size)
  const aspect = pf.width / pf.height
  const t = Math.tan((c.fovDeg * Math.PI) / 180 / 2)

  const pfX = p.x * size.w - pf.left
  const pfY = p.y * size.h - pf.top
  const ndcX = (2 * pfX) / pf.width - 1
  const ndcY = 1 - (2 * pfY) / pf.height

  const viewRayX = aspect * t * ndcX
  const viewRayY = t * ndcY
  const a = (c.cameraAngleDeg * Math.PI) / 180
  const cos = Math.cos(a)
  const sin = Math.sin(a)
  const dirX = viewRayX
  const dirY = viewRayY * cos + sin
  const dirZ = viewRayY * sin - cos
  if (dirZ === 0) return null

  return {
    x: -c.cameraPos.z * (dirX / dirZ),
    y: c.cameraPos.y - c.cameraPos.z * (dirY / dirZ),
  }
}

interface ForwardParams {
  c: PoeCameraConstants
  pf: PlayfieldRect
  aspect: number
  t: number
  cos: number
  sin: number
}

/** Precompute the per-call invariants for forward projection (camera consts,
 *  playfield rect, fov tangent, camera-angle sin/cos). Hoisted so a batch like
 *  projectCircle computes them once rather than per point. Null if unsupported. */
function forwardParams(version: 1 | 2, size: GameSize): ForwardParams | null {
  const c = CAMERA_CONSTANTS[version]
  if (!c) return null
  const pf = playfieldRect(version, size)
  const a = (c.cameraAngleDeg * Math.PI) / 180
  return {
    c,
    pf,
    aspect: pf.width / pf.height,
    t: Math.tan((c.fovDeg * Math.PI) / 180 / 2),
    cos: Math.cos(a),
    sin: Math.sin(a),
  }
}

function projectGround(p: ForwardParams, g: Pt, size: GameSize): Pt | null {
  const yo = g.y + p.c.playerOffset
  const vz = -yo * p.sin - p.c.cameraDistance
  if (vz >= 0) return null
  const ndcX = -g.x / (p.aspect * p.t * vz)
  const ndcY = -(yo * p.cos) / (p.t * vz)
  const pfX = ((ndcX + 1) / 2) * p.pf.width
  const pfY = ((1 - ndcY) / 2) * p.pf.height
  return { x: (p.pf.left + pfX) / size.w, y: (p.pf.top + pfY) / size.h }
}

/** Forward projection: a ground-plane world point to a normalized (0-1 of full
 *  window) screen point. Null for unsupported version / behind the camera. */
export function groundToScreen(version: 1 | 2, g: Pt, size: GameSize): Pt | null {
  const p = forwardParams(version, size)
  if (!p) return null
  return projectGround(p, g, size)
}

/** Euclidean distance between two ground points, in world units. */
export function groundDistance(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/** The screen-pixel point with the greatest x among already-projected (0-1)
 *  ring points - the on-screen "right edge" of a ground circle. Null if empty.
 *  Shared by the ring renderer (radius spoke end) and the edit handle so they
 *  agree on exactly the same point. */
export function rightmostPx(pointsNorm: Pt[], size: GameSize): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null
  for (const p of pointsNorm) {
    const x = p.x * size.w
    if (!best || x > best.x) best = { x, y: p.y * size.h }
  }
  return best
}

/** Project a ground circle (center + radius in world units) to an array of
 *  normalized screen points tracing the on-screen ellipse. Segments behind the
 *  camera are dropped; an unsupported version yields an empty array. */
export function projectCircle(version: 1 | 2, center: Pt, radiusUnits: number, size: GameSize, segments = 64): Pt[] {
  const p = forwardParams(version, size)
  if (!p) return []
  const pts: Pt[] = []
  for (let i = 0; i < segments; i++) {
    const ang = (i / segments) * 2 * Math.PI
    const sp = projectGround(
      p,
      { x: center.x + radiusUnits * Math.cos(ang), y: center.y + radiusUnits * Math.sin(ang) },
      size,
    )
    if (sp) pts.push(sp)
  }
  return pts
}

/** Convert world units to metres for display. Null for unsupported version. */
export function unitsToMetres(version: 1 | 2, units: number): number | null {
  const c = CAMERA_CONSTANTS[version]
  if (!c) return null
  return units * c.metresPerUnit
}
