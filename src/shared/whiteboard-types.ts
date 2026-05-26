/** Schema version for the on-disk whiteboard file. Bump only on a breaking
 *  change; non-breaking additions (new optional fields, new element types)
 *  do not require a bump. */
export const CURRENT_SCHEMA_VERSION = 1 as const

export type Pt = { x: number; y: number }

export interface BaseElement {
  id: string
  z: number
  rotation: number
  locked?: boolean
}

export interface StrokeElement extends BaseElement {
  type: 'stroke'
  variant: 'pen' | 'highlighter'
  points: Pt[]
  color: string
  width: number
}

export interface ShapeElement extends BaseElement {
  type: 'shape'
  shape: 'rect' | 'ellipse' | 'arrow' | 'line' | 'triangle'
  bbox: { x: number; y: number; w: number; h: number }
  stroke: string
  strokeWidth: number
  fill: string | null
}

export interface TextElement extends BaseElement {
  type: 'text'
  bbox: { x: number; y: number; w: number; h: number }
  text: string
  color: string
  fontSize: number
  fontWeight: 400 | 600 | 700
}

export interface ImageElement extends BaseElement {
  type: 'image'
  bbox: { x: number; y: number; w: number; h: number }
  /** Inline image as a data URL (`data:image/png;base64,...`). Inlining keeps
   *  the BoardLibrary JSON self-contained so snapshots can be moved/copied
   *  freely; the cost is bigger files. Mitigation: structural sharing in the
   *  history stack means an image's data URL string is referenced from many
   *  snapshots without duplicating the underlying memory. */
  src: string
}

/** A two-point distance measurement. `a`/`b` are GROUND-PLANE world coords
 *  (game units), not normalized screen coords - the renderer projects them
 *  with the active camera each frame so the measurement is aspect-correct. */
export interface RulerElement extends BaseElement {
  type: 'ruler'
  a: Pt
  b: Pt
  stroke: string
  strokeWidth: number
}

/** A skill-radius circle. `center` is a GROUND-PLANE world coord; `radius` is
 *  in world units. Rendered as the perspective projection of that ground
 *  circle. */
export interface RadiusRingElement extends BaseElement {
  type: 'radiusRing'
  center: Pt
  radius: number
  stroke: string
  strokeWidth: number
  fill: string | null
}

export type WhiteboardElement =
  | StrokeElement
  | ShapeElement
  | TextElement
  | ImageElement
  | RulerElement
  | RadiusRingElement

export const ELEMENT_TYPES: ReadonlyArray<WhiteboardElement['type']> = [
  'stroke',
  'shape',
  'text',
  'image',
  'ruler',
  'radiusRing',
]

export interface BoardState {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION
  elements: WhiteboardElement[]
  authoredAtGameSize: { w: number; h: number }
}

export interface BoardSnapshot {
  id: string
  name: string
  createdAt: number
  state: BoardState
}

export interface BoardLibrary {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION
  active: BoardState
  snapshots: BoardSnapshot[]
}

export function emptyBoardState(gameSize: { w: number; h: number }): BoardState {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    elements: [],
    authoredAtGameSize: { ...gameSize },
  }
}

export function emptyBoardLibrary(gameSize: { w: number; h: number }): BoardLibrary {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    active: emptyBoardState(gameSize),
    snapshots: [],
  }
}

// ---- Validation -------------------------------------------------------------

type RawObj = Record<string, unknown>

function isObj(v: unknown): v is RawObj {
  return !!v && typeof v === 'object'
}

function validateBbox(v: unknown): boolean {
  if (!isObj(v)) return false
  return typeof v.x === 'number' && typeof v.y === 'number' && typeof v.w === 'number' && typeof v.h === 'number'
}

function validateStroke(v: RawObj): boolean {
  if (v.variant !== 'pen' && v.variant !== 'highlighter') return false
  if (!Array.isArray(v.points)) return false
  for (const p of v.points as unknown[]) {
    if (!isObj(p)) return false
    if (typeof p.x !== 'number' || typeof p.y !== 'number') return false
  }
  if (typeof v.color !== 'string') return false
  if (typeof v.width !== 'number') return false
  return true
}

const SHAPE_VARIANTS: ReadonlyArray<ShapeElement['shape']> = ['rect', 'ellipse', 'arrow', 'line', 'triangle']

function validateShape(v: RawObj): boolean {
  if (!SHAPE_VARIANTS.includes(v.shape as ShapeElement['shape'])) return false
  if (!validateBbox(v.bbox)) return false
  if (typeof v.stroke !== 'string') return false
  if (typeof v.strokeWidth !== 'number') return false
  if (v.fill !== null && typeof v.fill !== 'string') return false
  return true
}

function validateText(v: RawObj): boolean {
  if (!validateBbox(v.bbox)) return false
  if (typeof v.text !== 'string') return false
  if (typeof v.color !== 'string') return false
  if (typeof v.fontSize !== 'number') return false
  if (v.fontWeight !== 400 && v.fontWeight !== 600 && v.fontWeight !== 700) return false
  return true
}

function validateImage(v: RawObj): boolean {
  if (!validateBbox(v.bbox)) return false
  if (typeof v.src !== 'string') return false
  // Data URL prefix gates against arbitrary external URLs (privacy: a board
  // with an http(s) image source would phone home on every render).
  if (!v.src.startsWith('data:image/')) return false
  return true
}

function validatePt(v: unknown): boolean {
  return isObj(v) && typeof v.x === 'number' && typeof v.y === 'number'
}

function validateRuler(v: RawObj): boolean {
  if (!validatePt(v.a) || !validatePt(v.b)) return false
  if (typeof v.stroke !== 'string') return false
  if (typeof v.strokeWidth !== 'number') return false
  return true
}

function validateRadiusRing(v: RawObj): boolean {
  if (!validatePt(v.center)) return false
  if (typeof v.radius !== 'number') return false
  if (typeof v.stroke !== 'string') return false
  if (typeof v.strokeWidth !== 'number') return false
  if (v.fill !== null && typeof v.fill !== 'string') return false
  return true
}

/** Per-kind validators for the type-specific fields. Base fields (id, z,
 *  rotation, locked) are checked by `validateElement` before dispatching here.
 *  Adding a new element kind: extend `WhiteboardElement`, list it in
 *  `ELEMENT_TYPES`, and add an entry here. */
export const ELEMENT_VALIDATORS: Record<WhiteboardElement['type'], (v: RawObj) => boolean> = {
  stroke: validateStroke,
  shape: validateShape,
  text: validateText,
  image: validateImage,
  ruler: validateRuler,
  radiusRing: validateRadiusRing,
}

function validateElement(value: unknown): value is WhiteboardElement {
  if (!isObj(value)) return false
  if (typeof value.id !== 'string') return false
  if (typeof value.z !== 'number') return false
  if (typeof value.rotation !== 'number') return false
  if ('locked' in value && value.locked !== undefined && typeof value.locked !== 'boolean') return false
  const kind = value.type as WhiteboardElement['type']
  const validator = ELEMENT_VALIDATORS[kind]
  if (!validator) return false
  return validator(value)
}

function validateBoardState(value: unknown): value is BoardState {
  if (!isObj(value)) return false
  if (value.schemaVersion !== CURRENT_SCHEMA_VERSION) return false
  if (!Array.isArray(value.elements)) return false
  if (!isObj(value.authoredAtGameSize)) return false
  const sz = value.authoredAtGameSize
  if (typeof sz.w !== 'number' || typeof sz.h !== 'number') return false
  for (const e of value.elements as unknown[]) {
    if (!validateElement(e)) return false
  }
  return true
}

export function validateBoardLibrary(value: unknown): value is BoardLibrary {
  if (!isObj(value)) return false
  if (value.schemaVersion !== CURRENT_SCHEMA_VERSION) return false
  if (!validateBoardState(value.active)) return false
  if (!Array.isArray(value.snapshots)) return false
  for (const s of value.snapshots as unknown[]) {
    if (!isObj(s)) return false
    if (typeof s.id !== 'string' || typeof s.name !== 'string') return false
    if (typeof s.createdAt !== 'number') return false
    if (!validateBoardState(s.state)) return false
  }
  return true
}

/** Bring a raw library payload up to `CURRENT_SCHEMA_VERSION`. Returns null
 *  if the payload can't be coerced (unknown version, structurally invalid).
 *  This is the single entry point file IO should use; adding a v2 migration
 *  later means extending this function, not hunting through call sites. */
export function migrateBoardLibrary(raw: unknown): BoardLibrary | null {
  if (!isObj(raw)) return null
  if (raw.schemaVersion === CURRENT_SCHEMA_VERSION) {
    return validateBoardLibrary(raw) ? raw : null
  }
  // Future migrations chain here, each mutating `raw` toward the current
  // schema and falling through to the validateBoardLibrary check above.
  return null
}
