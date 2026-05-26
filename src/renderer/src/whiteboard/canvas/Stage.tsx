import { useEffect, useRef, useState } from 'react'
import { Rect as KonvaRect, Stage as KonvaStage, Layer, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useWhiteboardStore } from '../state/store'
import { StrokeElement } from './elements/StrokeElement'
import { ShapeElement } from './elements/ShapeElement'
import { TextEditor, type TextEditorHandle } from './elements/TextEditor'
import { applyDragDelta, bakeTransform, renderElement } from './elements/registry'
import { readOsClipboardForPaste, writeElementsToOsClipboard } from '../state/os-clipboard'
import { createTextAt, measureTextBbox } from './tools/text'
import type {
  ImageElement,
  StrokeElement as StrokeEl,
  TextElement,
  WhiteboardElement,
} from '../../../../shared/whiteboard-types'
import { ContextMenu, type ContextMenuEntry } from './ContextMenu'
import { appendPoint, commitStroke, getStagePointer, startStroke, type PenSession } from './tools/pen'
import { applyErase } from './tools/eraser'
import { elementAabbPx, elementsInMarquee, pickTopElement } from './tools/select'
import {
  bboxFromAnchorAndCursor,
  commitShape,
  shapeDefaultFill,
  startShape,
  updateShapeEnd,
  type ShapeSession,
} from './tools/shape'
import { commitRuler, startRuler, updateRulerEnd, type RulerSession } from './tools/ruler'
import { commitRadius, startRadius, updateRadiusEnd, type RadiusSession } from './tools/radius'
import { RulerElement } from './elements/RulerElement'
import { RadiusRingElement } from './elements/RadiusRingElement'
import { applyRingEdit, applyRulerEdit, type RingEdit, type RulerEdit } from './tools/distance-edit'
import { DistanceEditHandles, DISTANCE_HANDLE } from './elements/DistanceEditHandles'
import { screenToGround } from './poe-projection'

const SHAPE_STROKE_WIDTH_NORM = 0.0035
/** Per-step stagger applied when pasting via keyboard. Each successive paste
 *  from the same clipboard increases the offset by this amount so the user
 *  can tell the paste happened. */
const KEYBOARD_PASTE_STEP_PX = 20

type PastePositioning = { kind: 'keyboard-offset' } | { kind: 'at-cursor'; cursorPx: { x: number; y: number } }

/** Compute the pixel translation to apply on paste. For keyboard pastes we
 *  use a cumulative offset (so successive pastes stagger); for cursor pastes
 *  we anchor the group's top-left at the cursor. */
function computePasteDelta(
  positioning: PastePositioning,
  elements: WhiteboardElement[],
  pasteCount: number,
  size: { w: number; h: number },
): { x: number; y: number } {
  if (positioning.kind === 'keyboard-offset') {
    const step = KEYBOARD_PASTE_STEP_PX * (pasteCount + 1)
    return { x: step, y: step }
  }
  let minX = Infinity
  let minY = Infinity
  for (const el of elements) {
    const b = elementAabbPx(el, size)
    if (b.x < minX) minX = b.x
    if (b.y < minY) minY = b.y
  }
  return { x: positioning.cursorPx.x - minX, y: positioning.cursorPx.y - minY }
}

/** Maximum fraction of the game window an image is allowed to occupy on
 *  paste. Large clipboard images (4K screenshots etc.) get scaled down so
 *  the user sees the whole thing inside the viewport; they can still resize
 *  up afterward. */
const IMAGE_PASTE_MAX_FRACTION = 0.5

/** Resolve the stage-pixel anchor for a paste. At-cursor pastes land at the
 *  click; keyboard pastes drop near the top-left and stagger on repeats. */
function pastePointPx(positioning: PastePositioning, pasteCount: number): { x: number; y: number } {
  if (positioning.kind === 'at-cursor') return positioning.cursorPx
  const step = KEYBOARD_PASTE_STEP_PX * (pasteCount + 1)
  return { x: 60 + step, y: 60 + step }
}

/** Add a paste-originated element to the canvas: append it, select it, and
 *  bump `pasteCount` so the next paste of the same clipboard staggers. The
 *  internal-roundtrip branch goes through `pasteFromClipboard` which bumps
 *  internally; this helper covers the external-text / external-image paths. */
function dropPastedElement(el: WhiteboardElement): void {
  const store = useWhiteboardStore
  store.getState().addElement(el)
  store.getState().setSelectedIds([el.id])
  store.setState((s) => ({ pasteCount: s.pasteCount + 1 }))
}

/** Load an image data URL and read its natural dimensions. */
function loadImageDimensions(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const probe = new Image()
    probe.onload = (): void => resolve({ w: probe.naturalWidth, h: probe.naturalHeight })
    probe.onerror = (): void => reject(new Error('paste: image load failed'))
    probe.src = src
  })
}

/** Build an ImageElement from a pasted data URL. The bbox is the natural
 *  image size, clamped to `IMAGE_PASTE_MAX_FRACTION` of the viewport along
 *  each axis while preserving aspect ratio. */
async function buildImageElementForPaste(
  src: string,
  positioning: PastePositioning,
  pasteCount: number,
): Promise<ImageElement> {
  const natural = await loadImageDimensions(src)
  const size = { w: window.innerWidth, h: window.innerHeight }
  const maxWPx = size.w * IMAGE_PASTE_MAX_FRACTION
  const maxHPx = size.h * IMAGE_PASTE_MAX_FRACTION
  const scale = Math.min(1, maxWPx / natural.w, maxHPx / natural.h)
  const wPx = natural.w * scale
  const hPx = natural.h * scale
  const pt = pastePointPx(positioning, pasteCount)
  return {
    id: globalThis.crypto.randomUUID(),
    z: 0,
    rotation: 0,
    type: 'image',
    src,
    bbox: {
      x: pt.x / size.w,
      y: pt.y / size.h,
      w: wPx / size.w,
      h: hPx / size.h,
    },
  }
}

/** Build a TextElement for a plain-text paste. The bbox is sized to the
 *  measured content so the user can immediately resize / rotate without an
 *  extra layout pass. */
function buildTextElementForPaste(text: string, positioning: PastePositioning, pasteCount: number): TextElement {
  const state = useWhiteboardStore.getState()
  const size = { w: window.innerWidth, h: window.innerHeight }
  const base = createTextAt({
    pointPx: pastePointPx(positioning, pasteCount),
    color: state.color,
    fontSize: state.textFontSize,
    size,
  })
  const measured = measureTextBbox(text, base.fontSize, size)
  return {
    ...base,
    text,
    bbox: { ...base.bbox, w: measured.w, h: measured.h },
  }
}

/** Paste behavior: the OS clipboard carries only the readable text form of
 *  a Scalpel copy (so pasting into other apps gives clean text), while the
 *  in-memory clipboard retains full element fidelity (shapes, strokes, text
 *  with bbox/color/rotation). `readOsClipboardForPaste` detects a round-
 *  trip by comparing the current OS text to the text we last wrote.
 *
 *    - external-image     -> create an ImageElement from the clipboard blob
 *    - external-text      -> create a TextElement with that text
 *    - internal-roundtrip -> restore from in-memory (full fidelity)
 *    - empty / unavailable -> fall back to in-memory if anything is there;
 *                             otherwise no-op
 *
 *  No-op when nothing is paste-able from either source. */
async function performPaste(positioning: PastePositioning): Promise<void> {
  const state = useWhiteboardStore.getState()
  const size = { w: window.innerWidth, h: window.innerHeight }
  const read = await readOsClipboardForPaste()

  if (read.kind === 'external-image') {
    try {
      dropPastedElement(await buildImageElementForPaste(read.src, positioning, state.pasteCount))
    } catch {
      /* image decode failed; no-op rather than throwing into the click handler */
    }
    return
  }

  if (read.kind === 'external-text') {
    dropPastedElement(buildTextElementForPaste(read.text, positioning, state.pasteCount))
    return
  }

  // internal-roundtrip / empty / unavailable all fall through to the
  // in-memory clipboard. Internal roundtrip is the common case (the user
  // copied within Scalpel and is pasting back); empty / unavailable cover
  // edge cases (shapes-only copy where the OS text was empty, or OS access
  // denied) so the in-memory state still serves a paste.
  if (state.clipboard.length === 0) return
  const delta = computePasteDelta(positioning, state.clipboard, state.pasteCount, size)
  state.pasteFromClipboard((el) => applyDragDelta(el, delta, size))
}

/** Copy ids to both the in-memory clipboard (sync, sticky across the
 *  session) and the OS clipboard (best-effort, lets the user paste into
 *  other apps and round-trip back in). */
function performCopy(ids: string[]): void {
  const state = useWhiteboardStore.getState()
  state.copyToClipboard(ids)
  // After the store action lands, `clipboard` holds the deep clones we
  // want to advertise to the OS.
  writeElementsToOsClipboard(useWhiteboardStore.getState().clipboard)
}

/** CSS cursor for the Transformer's rotation anchor. A 270-degree arc
 *  sweeping clockwise from 12 o'clock to 9 o'clock, with an arrowhead at
 *  the end pointing up to indicate the continuing rotation direction.
 *  Drawn as a black outline under a white foreground so it reads on the
 *  dark PoE backdrop the whiteboard floats over. The SVG body is
 *  URL-encoded because browsers reject `data:image/svg+xml;utf8,...`
 *  cursors with literal `<` / `>` and silently fall back to the system
 *  default (Konva's `crosshair`, the plain "+"). Hotspot (12, 12) lands
 *  at the anchor's visual center. */
const ROTATE_CURSOR_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' stroke-linecap='round' stroke-linejoin='round'><path d='M 12 4 A 8 8 0 1 1 4 12' fill='none' stroke='black' stroke-width='3.5'/><path d='M 2.5 14.5 L 5 12 L 7.5 14.5 Z' fill='black' stroke='black' stroke-width='3.5'/><path d='M 12 4 A 8 8 0 1 1 4 12' fill='none' stroke='white' stroke-width='1.8'/><path d='M 2.5 14.5 L 5 12 L 7.5 14.5 Z' fill='white' stroke='white' stroke-width='1.8'/></svg>"
const ROTATE_CURSOR = `url("data:image/svg+xml;utf8,${encodeURIComponent(ROTATE_CURSOR_SVG)}") 12 12, grab`

function cssEscape(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`)
}

type EditSession = { id: string; el: 'radiusRing'; edit: RingEdit } | { id: string; el: 'ruler'; edit: RulerEdit }

export function Stage(): JSX.Element {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const stageRef = useRef<Konva.Stage>(null)
  const sessionRef = useRef<PenSession | null>(null)
  const shapeSessionRef = useRef<ShapeSession | null>(null)
  const marqueeSessionRef = useRef<{ anchorPx: { x: number; y: number }; cursorPx: { x: number; y: number } } | null>(
    null,
  )
  const transformerRef = useRef<Konva.Transformer>(null)
  const [, forceRender] = useState(0)

  const elements = useWhiteboardStore((s) => s.elements)
  const drawingsOpacity = useWhiteboardStore((s) => s.drawingsOpacity)
  const tool = useWhiteboardStore((s) => s.tool)
  const color = useWhiteboardStore((s) => s.color)
  const widthN = useWhiteboardStore((s) => s.width)
  const shapeVariant = useWhiteboardStore((s) => s.shapeVariant)
  const addElement = useWhiteboardStore((s) => s.addElement)
  const replaceAll = useWhiteboardStore((s) => s.replaceAll)
  const selectedIds = useWhiteboardStore((s) => s.selectedIds)
  const setSelectedIds = useWhiteboardStore((s) => s.setSelectedIds)
  const updateElement = useWhiteboardStore((s) => s.updateElement)
  const textFontSize = useWhiteboardStore((s) => s.textFontSize)
  const setEditingTextId = useWhiteboardStore((s) => s.setEditingTextId)
  const editingTextId = useWhiteboardStore((s) => s.editingTextId)
  const bringToFront = useWhiteboardStore((s) => s.bringToFront)
  const sendToBack = useWhiteboardStore((s) => s.sendToBack)
  const rulerSessionRef = useRef<RulerSession | null>(null)
  const radiusSessionRef = useRef<RadiusSession | null>(null)
  const editSessionRef = useRef<EditSession | null>(null)
  const poeVersion = useWhiteboardStore((s) => s.poeVersion)
  const erasingRef = useRef(false)
  const erasedThisPassRef = useRef(false)
  const [contextMenu, setContextMenu] = useState<{ hitId: string | null; x: number; y: number } | null>(null)
  const textEditorRef = useRef<TextEditorHandle>(null)

  useEffect(() => {
    useWhiteboardStore.getState().snapshotForHistory()
  }, [])

  useEffect(() => {
    function onResize(): void {
      setSize({ w: window.innerWidth, h: window.innerHeight })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    const tr = transformerRef.current
    if (!stage || !tr) return
    const nodes = selectedIds
      .filter((id) => {
        const el = elements.find((e2) => e2.id === id)
        return el?.type !== 'ruler' && el?.type !== 'radiusRing'
      })
      .map((id) => stage.findOne(`#${cssEscape(id)}`))
      .filter((n): n is Konva.Node => !!n)
    tr.nodes(nodes)
    tr.getLayer()?.batchDraw()
  }, [selectedIds, elements])

  // The Transformer's resize/rotate handles only respond in select mode, so
  // leaving a selection bound while the user switches to a drawing tool just
  // shows handles that ignore clicks. Clear the selection on tool-switch so
  // the canvas matches the active tool.
  useEffect(() => {
    if (tool !== 'select' && selectedIds.length > 0) {
      setSelectedIds([])
    }
  }, [tool, selectedIds.length, setSelectedIds])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      // While a text element is being edited, the textarea owns all keys.
      // The TextEditor handles Escape and Enter; everything else (typing,
      // Backspace, Ctrl+Z within the textarea, arrow-key cursor movement)
      // must reach the textarea natively, so the canvas-level shortcuts
      // below are skipped entirely.
      if (useWhiteboardStore.getState().editingTextId !== null) return

      if (e.key === 'Escape') {
        window.api.whiteboard.requestClose()
        return
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        const ids = useWhiteboardStore.getState().selectedIds
        if (ids.length > 0) {
          useWhiteboardStore.getState().removeElements(ids)
        }
        return
      }
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        useWhiteboardStore.getState().undo()
        return
      }
      if (e.ctrlKey && ((e.shiftKey && e.key.toLowerCase() === 'z') || e.key.toLowerCase() === 'y')) {
        e.preventDefault()
        useWhiteboardStore.getState().redo()
        return
      }
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'c') {
        const ids = useWhiteboardStore.getState().selectedIds
        if (ids.length > 0) {
          e.preventDefault()
          performCopy(ids)
        }
        return
      }
      if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'v') {
        // Always claim the keystroke - the OS clipboard read is async and we
        // don't know yet whether it'll have anything paste-able. Letting the
        // default fire could surface a beep or paste into a focused widget
        // we don't own.
        e.preventDefault()
        void performPaste({ kind: 'keyboard-offset' })
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (editingTextId === null) return
    if (tool !== 'text') {
      // Tool switched away while editing - explicitly commit so in-progress
      // text isn't discarded. Deferred one tick so any in-flight onInput
      // (from the click that switched tools) lands first.
      const id = setTimeout(() => {
        if (useWhiteboardStore.getState().editingTextId === editingTextId) {
          textEditorRef.current?.commit()
        }
      }, 0)
      return () => clearTimeout(id)
    }
  }, [tool, editingTextId])

  function onPointerDown(e?: KonvaEventObject<MouseEvent | TouchEvent>): void {
    // Right-clicks are reserved for the context menu - don't let them start
    // a marquee / stroke / shape / erase pass.
    const evt = e?.evt as MouseEvent | TouchEvent | undefined
    if (evt && 'button' in evt && evt.button !== 0) return
    if (tool === 'select') {
      const stage = stageRef.current
      if (!stage) return
      // Don't intercept clicks on the Transformer or its handles; Konva
      // owns those interactions natively. Walking up the parent chain handles
      // both the Transformer node itself and its anchor children.
      let cur: Konva.Node | null = e?.target ?? null
      while (cur) {
        if (cur.getClassName?.() === 'Transformer') return
        cur = cur.getParent() ?? null
      }
      const pt = getStagePointer(stage)
      if (!pt) return
      // Distance-edit routing: when exactly one ring/ruler is selected, a press
      // on its handle starts a resize/endpoint drag; a press on its body starts
      // a world-space move. Everything else falls through to normal selection.
      const selId = selectedIds.length === 1 ? selectedIds[0] : null
      const selEl = selId ? elements.find((e2) => e2.id === selId) : null
      const hit = pickTopElement(stage, pt)
      if (selEl && (selEl.type === 'radiusRing' || selEl.type === 'ruler') && poeVersion !== null) {
        const cursorNorm = { x: pt.x / size.w, y: pt.y / size.h }
        const handleName = typeof e?.target?.name === 'function' ? e.target.name() : ''
        if (selEl.type === 'radiusRing' && handleName === DISTANCE_HANDLE.ringRadius) {
          editSessionRef.current = { id: selEl.id, el: 'radiusRing', edit: { kind: 'ring-radius' } }
          return
        }
        if (selEl.type === 'ruler' && handleName === DISTANCE_HANDLE.rulerA) {
          editSessionRef.current = { id: selEl.id, el: 'ruler', edit: { kind: 'ruler-a' } }
          return
        }
        if (selEl.type === 'ruler' && handleName === DISTANCE_HANDLE.rulerB) {
          editSessionRef.current = { id: selEl.id, el: 'ruler', edit: { kind: 'ruler-b' } }
          return
        }
        if (hit === selEl.id) {
          const grab = screenToGround(poeVersion, cursorNorm, size)
          if (grab) {
            editSessionRef.current =
              selEl.type === 'radiusRing'
                ? {
                    id: selEl.id,
                    el: 'radiusRing',
                    edit: { kind: 'ring-move', grabGround: grab, startCenter: selEl.center },
                  }
                : {
                    id: selEl.id,
                    el: 'ruler',
                    edit: { kind: 'ruler-move', grabGround: grab, startA: selEl.a, startB: selEl.b },
                  }
            return
          }
        }
      }
      if (hit && selectedIds.includes(hit)) return
      if (hit) {
        setSelectedIds([hit])
        return
      }
      // Empty-space press: open a marquee session. We commit selection (or
      // clear, for a plain click) on pointer-up - this lets Figma-style
      // drag-to-select work without stomping the existing click-to-clear.
      marqueeSessionRef.current = { anchorPx: pt, cursorPx: pt }
      forceRender((n) => n + 1)
      return
    }
    if (tool === 'text') {
      const stage = stageRef.current
      if (!stage) return
      const pt = getStagePointer(stage)
      if (!pt) return
      // If clicking onto an existing text element, fall through to select.
      const hit = pickTopElement(stage, pt)
      if (hit) {
        const hitEl = elements.find((e) => e.id === hit)
        if (hitEl?.type === 'text') {
          setEditingTextId(hit)
          return
        }
      }
      const newEl = createTextAt({ pointPx: pt, color, fontSize: textFontSize, size })
      addElement(newEl)
      setEditingTextId(newEl.id)
      forceRender((n) => n + 1)
      return
    }
    if (tool === 'shape') {
      const stage = stageRef.current
      if (!stage) return
      const pt = getStagePointer(stage)
      if (!pt) return
      shapeSessionRef.current = startShape({
        shape: shapeVariant,
        color,
        strokeWidth: SHAPE_STROKE_WIDTH_NORM,
        anchorPx: pt,
        size,
      })
      forceRender((n) => n + 1)
      return
    }
    if (tool === 'eraser') {
      const stage = stageRef.current
      if (!stage) return
      const pt = getStagePointer(stage)
      if (!pt) return
      erasingRef.current = true
      const next = applyErase(elements, pt, size)
      if (next !== null) {
        replaceAll(next)
        erasedThisPassRef.current = true
      }
      return
    }
    if (tool === 'ruler' || tool === 'radiusRing') {
      if (poeVersion === null) return
      const stage = stageRef.current
      if (!stage) return
      const pt = getStagePointer(stage)
      if (!pt) return
      if (tool === 'ruler') {
        rulerSessionRef.current = startRuler({
          version: poeVersion,
          color,
          strokeWidth: SHAPE_STROKE_WIDTH_NORM,
          anchorPx: pt,
          size,
        })
      } else {
        radiusSessionRef.current = startRadius({
          version: poeVersion,
          color,
          strokeWidth: SHAPE_STROKE_WIDTH_NORM,
          anchorPx: pt,
          size,
        })
      }
      forceRender((n) => n + 1)
      return
    }
    if (tool !== 'pen' && tool !== 'highlighter') return
    const stage = stageRef.current
    if (!stage) return
    const pt = getStagePointer(stage)
    if (!pt) return
    sessionRef.current = startStroke({
      variant: tool,
      color,
      width: widthN,
      startStagePt: pt,
      size,
    })
    forceRender((n) => n + 1)
  }

  function onPointerMove(e?: KonvaEventObject<MouseEvent | TouchEvent>): void {
    if (editSessionRef.current) {
      const stage = stageRef.current
      if (!stage) return
      const pt = getStagePointer(stage)
      if (!pt) return
      const cursorNorm = { x: pt.x / size.w, y: pt.y / size.h }
      const s = editSessionRef.current
      const curr = useWhiteboardStore.getState().elements.find((e2) => e2.id === s.id)
      if (!curr) return
      let next = curr
      if (s.el === 'radiusRing' && curr.type === 'radiusRing')
        next = applyRingEdit(curr, s.edit, cursorNorm, size, poeVersion)
      else if (s.el === 'ruler' && curr.type === 'ruler')
        next = applyRulerEdit(curr, s.edit, cursorNorm, size, poeVersion)
      if (next === curr) return
      updateElement(s.id, () => next, { history: false })
      forceRender((n) => n + 1)
      return
    }
    if (marqueeSessionRef.current) {
      const stage = stageRef.current
      if (!stage) return
      const pt = getStagePointer(stage)
      if (!pt) return
      marqueeSessionRef.current.cursorPx = pt
      forceRender((n) => n + 1)
      return
    }
    if (shapeSessionRef.current) {
      const stage = stageRef.current
      if (!stage) return
      const pt = getStagePointer(stage)
      if (!pt) return
      updateShapeEnd(shapeSessionRef.current, pt, size, e?.evt?.shiftKey ?? false)
      forceRender((n) => n + 1)
      return
    }
    if (rulerSessionRef.current) {
      const stage = stageRef.current
      if (!stage) return
      const pt = getStagePointer(stage)
      if (!pt) return
      updateRulerEnd(rulerSessionRef.current, pt)
      forceRender((n) => n + 1)
      return
    }
    if (radiusSessionRef.current) {
      const stage = stageRef.current
      if (!stage) return
      const pt = getStagePointer(stage)
      if (!pt) return
      updateRadiusEnd(radiusSessionRef.current, pt)
      forceRender((n) => n + 1)
      return
    }
    if (tool === 'eraser' && erasingRef.current) {
      const stage = stageRef.current
      if (!stage) return
      const pt = getStagePointer(stage)
      if (!pt) return
      // Re-read elements via the store getter to get the freshest state after
      // any erasures since the previous move event.
      const next = applyErase(useWhiteboardStore.getState().elements, pt, size)
      if (next !== null) {
        replaceAll(next)
        erasedThisPassRef.current = true
      }
      return
    }
    if (!sessionRef.current) return
    const stage = stageRef.current
    if (!stage) return
    const pt = getStagePointer(stage)
    if (!pt) return
    appendPoint(sessionRef.current, pt, size)
    forceRender((n) => n + 1)
  }

  function onPointerUp(): void {
    if (editSessionRef.current) {
      editSessionRef.current = null
      useWhiteboardStore.getState().snapshotForHistory()
      forceRender((n) => n + 1)
      return
    }
    if (marqueeSessionRef.current) {
      const m = marqueeSessionRef.current
      marqueeSessionRef.current = null
      const dx = m.cursorPx.x - m.anchorPx.x
      const dy = m.cursorPx.y - m.anchorPx.y
      // Below the drag threshold the gesture is a plain click, so honor the
      // existing "empty click clears selection" contract.
      const MARQUEE_MIN_PX = 4
      if (Math.abs(dx) < MARQUEE_MIN_PX && Math.abs(dy) < MARQUEE_MIN_PX) {
        setSelectedIds([])
        forceRender((n) => n + 1)
        return
      }
      const rect = {
        x: Math.min(m.anchorPx.x, m.cursorPx.x),
        y: Math.min(m.anchorPx.y, m.cursorPx.y),
        w: Math.abs(dx),
        h: Math.abs(dy),
      }
      const ids = elementsInMarquee(elements, rect, size, poeVersion)
      setSelectedIds(ids)
      forceRender((n) => n + 1)
      return
    }
    if (shapeSessionRef.current) {
      const finished = commitShape(shapeSessionRef.current, size)
      shapeSessionRef.current = null
      if (finished) addElement(finished)
      forceRender((n) => n + 1)
      return
    }
    if (rulerSessionRef.current) {
      const finished = commitRuler(rulerSessionRef.current, size)
      rulerSessionRef.current = null
      if (finished) addElement(finished)
      forceRender((n) => n + 1)
      return
    }
    if (radiusSessionRef.current) {
      const finished = commitRadius(radiusSessionRef.current, size)
      radiusSessionRef.current = null
      if (finished) addElement(finished)
      forceRender((n) => n + 1)
      return
    }
    if (erasingRef.current) {
      if (erasedThisPassRef.current) {
        useWhiteboardStore.getState().snapshotForHistory()
        erasedThisPassRef.current = false
      }
      erasingRef.current = false
      return
    }
    if (!sessionRef.current) return
    const finished = commitStroke(sessionRef.current)
    sessionRef.current = null
    addElement(finished)
    forceRender((n) => n + 1)
  }

  const inProgressEl: StrokeEl | null = sessionRef.current
    ? {
        id: sessionRef.current.id,
        z: 0,
        rotation: 0,
        type: 'stroke',
        variant: sessionRef.current.variant,
        points: sessionRef.current.points,
        color: sessionRef.current.color,
        width: sessionRef.current.width,
      }
    : null

  function onContextMenu(e: KonvaEventObject<PointerEvent>): void {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return
    const pt = stage.getPointerPosition()
    if (!pt) return
    // Always open the menu, even on empty canvas - the user needs somewhere
    // to invoke "Paste here." The items list branches on hit/selection.
    const hit = pickTopElement(stage, pt)
    setContextMenu({ hitId: hit, x: pt.x, y: pt.y })
  }

  const marquee = (() => {
    const m = marqueeSessionRef.current
    if (!m) return null
    const dx = m.cursorPx.x - m.anchorPx.x
    const dy = m.cursorPx.y - m.anchorPx.y
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return null
    return {
      x: Math.min(m.anchorPx.x, m.cursorPx.x),
      y: Math.min(m.anchorPx.y, m.cursorPx.y),
      w: Math.abs(dx),
      h: Math.abs(dy),
    }
  })()

  const inProgressShape = shapeSessionRef.current
    ? (() => {
        const s = shapeSessionRef.current
        const isEndpoints = s.shape === 'line' || s.shape === 'arrow'
        const r = bboxFromAnchorAndCursor(s.anchorPx, s.cursorPx, false, isEndpoints ? 'endpoints' : 'bbox')
        return {
          id: s.id,
          z: 0,
          rotation: 0,
          type: 'shape' as const,
          shape: s.shape,
          bbox: { x: r.x / size.w, y: r.y / size.h, w: r.w / size.w, h: r.h / size.h },
          stroke: s.color,
          strokeWidth: s.strokeWidth,
          fill: shapeDefaultFill(s.shape, s.color),
        }
      })()
    : null

  const inProgressRuler =
    rulerSessionRef.current && poeVersion !== null ? commitRuler(rulerSessionRef.current, size) : null

  const inProgressRing =
    radiusSessionRef.current && poeVersion !== null ? commitRadius(radiusSessionRef.current, size) : null

  return (
    <>
      <KonvaStage
        ref={stageRef}
        width={size.w}
        height={size.h}
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
        onContextMenu={onContextMenu}
      >
        <Layer opacity={drawingsOpacity} listening={true}>
          {elements.map((el) =>
            renderElement(el, {
              size,
              version: poeVersion,
              draggable: tool === 'select',
              editingTextId,
              onDragEnd: (id, delta) => updateElement(id, (curr) => applyDragDelta(curr, delta, size)),
              onTransformEnd: (id, next) => updateElement(id, (curr) => bakeTransform(curr, next, size)),
              onTextDoubleClick: setEditingTextId,
            }),
          )}
        </Layer>
        <Layer listening={false}>
          {inProgressEl && <StrokeElement element={inProgressEl} size={size} listening={false} />}
          {inProgressShape && <ShapeElement element={inProgressShape} size={size} listening={false} />}
          {inProgressRuler && (
            <RulerElement element={inProgressRuler} size={size} version={poeVersion} listening={false} />
          )}
          {inProgressRing && (
            <RadiusRingElement element={inProgressRing} size={size} version={poeVersion} listening={false} />
          )}
          {marquee && (
            <KonvaRect
              x={marquee.x}
              y={marquee.y}
              width={marquee.w}
              height={marquee.h}
              fill="rgba(56, 189, 248, 0.15)"
              stroke="#38bdf8"
              strokeWidth={1}
              listening={false}
              perfectDrawEnabled={false}
            />
          )}
        </Layer>
        <Layer>
          <Transformer
            ref={transformerRef}
            rotateEnabled={true}
            keepRatio={false}
            flipEnabled={false}
            rotateAnchorCursor={ROTATE_CURSOR}
          />
        </Layer>
        {(() => {
          if (selectedIds.length !== 1) return null
          const el = elements.find((e2) => e2.id === selectedIds[0])
          if (!el || (el.type !== 'ruler' && el.type !== 'radiusRing')) return null
          return (
            <Layer>
              <DistanceEditHandles element={el} size={size} version={poeVersion} />
            </Layer>
          )
        })()}
      </KonvaStage>
      <TextEditor ref={textEditorRef} size={size} />
      {contextMenu &&
        (() => {
          // Determine what the menu acts on:
          //   - hit + hit-is-in-selection -> the whole selection (Figma rule)
          //   - hit + hit-not-in-selection -> just that one element
          //   - no hit, selection non-empty -> the existing selection
          //   - no hit, no selection -> nothing actionable; menu shows only Paste
          const { hitId } = contextMenu
          const targetIds = hitId ? (selectedIds.includes(hitId) ? selectedIds : [hitId]) : selectedIds
          const hasTargets = targetIds.length > 0
          // Can't sync-check the OS clipboard for whether anything's
          // paste-able, so "Paste here" is always enabled. A click on an
          // empty clipboard quietly no-ops instead of showing a disabled row.
          const items: ContextMenuEntry[] = []
          if (hasTargets) {
            items.push({ label: 'Copy', onClick: () => performCopy(targetIds) })
          }
          items.push({
            label: 'Paste here',
            onClick: () => void performPaste({ kind: 'at-cursor', cursorPx: { x: contextMenu.x, y: contextMenu.y } }),
          })
          if (hasTargets) {
            items.push({ divider: true })
            items.push({ label: 'Bring to front', onClick: () => bringToFront(targetIds) })
            items.push({ label: 'Send to back', onClick: () => sendToBack(targetIds) })
          }
          return <ContextMenu x={contextMenu.x} y={contextMenu.y} items={items} onClose={() => setContextMenu(null)} />
        })()}
    </>
  )
}
