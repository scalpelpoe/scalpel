import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useWhiteboardStore, type Tool } from '../state/store'
import { ToolButton } from './ToolButton'
import { ColorPalette } from './ColorPalette'
import { PenTipPicker } from './PenTipPicker'
import { ShapeVariantPicker } from './ShapeVariantPicker'
import { DistanceVariantPicker } from './DistanceVariantPicker'
import { PlayToggle } from './PlayToggle'
import { OpacitySlider } from './OpacitySlider'
import { PANEL_CHROME } from './panel-chrome'
import { FontSizePicker } from './FontSizePicker'
import { SaveCurrentDialog } from '../snapshots/SaveCurrentDialog'
import { SnapshotLibrary } from '../snapshots/SnapshotLibrary'
import { useDismissOnOutside } from '../state/use-dismiss-on-outside'
import { UnifiedPillArrow } from './pill-arrow'
import { ToolMarker, ToolHighlighter, ToolEraser } from './tool-icons'
import {
  IconCursor,
  IconShape,
  IconText,
  IconUndo,
  IconRedo,
  IconTrash,
  IconLayers,
  IconOpacity,
  IconRuler,
} from './icons'
import { CAMERA_CONSTANTS } from '../canvas/poe-projection'
import type { BoardSnapshot, BoardState } from '../../../../shared/whiteboard-types'

interface ToolbarProps {
  version: 1 | 2
}

type PenFamilyTool = 'pen' | 'highlighter' | 'eraser'
const PEN_FAMILY: PenFamilyTool[] = ['pen', 'highlighter', 'eraser']
const isPenFamily = (t: Tool): t is PenFamilyTool => PEN_FAMILY.includes(t as PenFamilyTool)

/** Pixel height of the 3D pen icon mounted in the toolbar's big slot. Bumping
 *  this typically requires retuning the `bottom` offset in ToolButton's big
 *  variant since the SVG's internal shadow row scales proportionally. */
const BIG_SLOT_ICON_SIZE = 96
/** Pixel height of the cropped 3D pen icons in the ink sub-tool picker. */
const INK_PICKER_ICON_SIZE = 48

/** Cropped 3D-icon picker for marker / highlighter / eraser. Each icon hangs
 *  below the slot's clipping edge so only the tip pokes up; hover rises it
 *  with the design's spring overshoot. */
function InkSubToolPicker({
  tool,
  setTool,
  color,
}: {
  tool: Tool
  setTool: (t: Tool) => void
  color: string
}): JSX.Element {
  const items: Array<{ id: PenFamilyTool; label: string; icon: JSX.Element }> = [
    { id: 'pen', label: 'Marker', icon: <ToolMarker size={INK_PICKER_ICON_SIZE} color={color} /> },
    { id: 'highlighter', label: 'Highlighter', icon: <ToolHighlighter size={INK_PICKER_ICON_SIZE} color={color} /> },
    { id: 'eraser', label: 'Eraser', icon: <ToolEraser size={INK_PICKER_ICON_SIZE} /> },
  ]
  return (
    <div className="flex items-center gap-1 px-1">
      {items.map((it) => {
        const active = tool === it.id
        return (
          <button
            key={it.id}
            type="button"
            className={[
              'wb-ink-slot relative rounded overflow-hidden flex items-end justify-center transition-colors',
              active ? 'bg-white/15' : 'bg-white/5 hover:bg-white/10',
            ].join(' ')}
            style={
              {
                width: 44,
                height: 44,
                padding: 0,
                '--ink-bottom': active ? '-16px' : '-28px',
                '--ink-bottom-hover': active ? '-12px' : '-22px',
              } as React.CSSProperties
            }
            onClick={() => setTool(it.id)}
            title={it.label}
          >
            <span aria-hidden className="wb-ink-icon absolute left-1/2 -translate-x-1/2 pointer-events-none">
              {it.icon}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function Toolbar({ version }: ToolbarProps): JSX.Element {
  const tool = useWhiteboardStore((s) => s.tool)
  const setTool = useWhiteboardStore((s) => s.setTool)
  const color = useWhiteboardStore((s) => s.color)
  const shapeVariant = useWhiteboardStore((s) => s.shapeVariant)
  const mode = useWhiteboardStore((s) => s.mode)
  const [pos] = useState({ left: '50%', bottom: 24 })
  const containerRef = useRef<HTMLDivElement>(null)
  const distanceSupported = CAMERA_CONSTANTS[version] !== null

  // Only report toolbar rects in Play mode. (See longer note on the panel
  // hit-testing contract previously in this file.)
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (mode !== 'play') {
      window.api.whiteboard.clearToolbarRect()
      return
    }
    function report(): void {
      if (!el) return
      const rects: Array<{ left: number; top: number; width: number; height: number }> = []
      for (const child of Array.from(el.children) as HTMLElement[]) {
        const r = child.getBoundingClientRect()
        if (r.width > 0 && r.height > 0) {
          rects.push({ left: r.left, top: r.top, width: r.width, height: r.height })
        }
      }
      window.api.whiteboard.reportToolbarRects(rects)
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    for (const child of Array.from(el.children) as HTMLElement[]) ro.observe(child)
    const mo = new MutationObserver(() => {
      for (const child of Array.from(el.children) as HTMLElement[]) {
        try {
          ro.observe(child)
        } catch {}
      }
      report()
    })
    mo.observe(el, { childList: true })
    window.addEventListener('resize', report)
    return () => {
      ro.disconnect()
      mo.disconnect()
      window.removeEventListener('resize', report)
      window.api.whiteboard.clearToolbarRect()
    }
  }, [mode])

  const undo = useWhiteboardStore((s) => s.undo)
  const redo = useWhiteboardStore((s) => s.redo)
  const canUndo = useWhiteboardStore((s) => s.canUndo)
  const canRedo = useWhiteboardStore((s) => s.canRedo)
  const historyVersion = useWhiteboardStore((s) => s.historyVersion)
  const canUndoNow = useMemo(() => canUndo(), [canUndo, historyVersion])
  const canRedoNow = useMemo(() => canRedo(), [canRedo, historyVersion])
  const clearAll = useWhiteboardStore((s) => s.clearAll)
  const elementCount = useWhiteboardStore((s) => s.elements.length)
  const replaceAll = useWhiteboardStore((s) => s.replaceAll)
  const elements = useWhiteboardStore((s) => s.elements)

  type Pending = { kind: 'open'; snap: BoardSnapshot } | { kind: 'save-only' } | null
  const [pending, setPending] = useState<Pending>(null)
  const [libOpen, setLibOpen] = useState(false)
  const [opacityOpen, setOpacityOpen] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Anchor refs are forwarded to each trigger button on the main toolbar so
  // contextual pills / popovers can render an arrow pointing at the button
  // they "come out of."
  const mainPillRef = useRef<HTMLDivElement | null>(null)
  const penAnchorRef = useRef<HTMLButtonElement | null>(null)
  const shapeAnchorRef = useRef<HTMLButtonElement | null>(null)
  const textAnchorRef = useRef<HTMLButtonElement | null>(null)
  const distanceAnchorRef = useRef<HTMLButtonElement | null>(null)
  const snapshotsAnchorRef = useRef<HTMLButtonElement | null>(null)
  const opacityAnchorRef = useRef<HTMLButtonElement | null>(null)

  // Opacity is the only contextual surface that needs its own pill ref
  // for dismiss-on-outside. The arrow doesn't measure pill positions
  // anymore (it uses the wrapper + target), so the other pills don't need
  // refs.
  const opacityPillRef = useRef<HTMLDivElement | null>(null)
  useDismissOnOutside(opacityPillRef, () => setOpacityOpen(false), opacityOpen)

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    }
  }, [])

  // Drive the toolbar entrance animation off the whiteboard window's
  // show/hide IPCs from main. The window persists across show/hide
  // (opacity-based, see windowing), so the React tree mounts once and we
  // can't use mount lifecycle. On hide we set the toolbar to the FROM
  // state under cover of opacity=0; on show we play the animation. Pinning
  // the FROM state during the hidden phase eliminates the "flash of settled
  // toolbar" before the bounce starts - the previous frame already matches
  // the animation's first keyframe.
  useLayoutEffect(() => {
    const el = mainPillRef.current
    if (!el) return
    el.classList.add('wb-toolbar-hidden')
  }, [])

  useEffect(() => {
    const unShown = window.api.whiteboard.onShown(() => {
      const el = mainPillRef.current
      if (!el) return
      const isSelect = useWhiteboardStore.getState().tool === 'select'
      el.classList.remove('wb-toolbar-hidden')
      el.classList.remove('wb-toolbar-enter')
      if (!isSelect) return
      // Force a reflow so the class re-add starts a fresh animation - the
      // browser otherwise coalesces remove+add and the animation does not
      // play.
      void el.offsetWidth
      el.classList.add('wb-toolbar-enter')
    })
    const unHidden = window.api.whiteboard.onHidden(() => {
      const el = mainPillRef.current
      if (!el) return
      el.classList.remove('wb-toolbar-enter')
      el.classList.add('wb-toolbar-hidden')
    })
    // Pull the shown state in case main's onFirstShow push fired before this
    // effect ran. The Toolbar gates its mount on an async version probe -
    // when that resolves slower than the setImmediate that delivers the
    // initial 'whiteboard:shown' IPC, the toolbar would stay hidden until
    // the next toggle without this catch-up call.
    window.api.whiteboard.requestShownState()
    return () => {
      unShown()
      unHidden()
    }
  }, [])

  // Only one extra bar shows above the main toolbar at a time. Snapshots /
  // Save dialog / Opacity all push the contextual tool pill (ink, shape,
  // text) out of view while open; closing returns the contextual pill since
  // it's tool-driven.
  const popoverOpen = libOpen || opacityOpen || pending !== null
  const showInkRow = isPenFamily(tool) && !popoverOpen
  const showShapeRow = tool === 'shape' && !popoverOpen
  const showTextRow = tool === 'text' && !popoverOpen
  const showDistanceRow = (tool === 'ruler' || tool === 'radiusRing') && !popoverOpen

  /** Body of the tool's contextual pill, or null if none is visible. The pill
   *  chrome (panel bg + padding + pop-in animation) is rendered once at the
   *  call site so adding a new contextual surface is a one-branch change. */
  const contextualRowBody: JSX.Element | null = (() => {
    if (showInkRow)
      return (
        <>
          <InkSubToolPicker tool={tool} setTool={setTool} color={color} />
          <div className="w-px bg-border self-stretch" />
          <PenTipPicker />
          {/* Color row stays mounted with `invisible` when eraser is active so
              the pill width is identical across all 3 sub-tools. Otherwise the
              pill would shrink when eraser is selected and the arrow could
              fall outside its bottom edge. */}
          <div
            className={['flex items-center gap-2', tool === 'eraser' ? 'invisible pointer-events-none' : ''].join(' ')}
          >
            <div className="w-px bg-border self-stretch" />
            <ColorPalette />
          </div>
        </>
      )
    if (showShapeRow)
      return (
        <>
          <ShapeVariantPicker />
          <div className="w-px bg-border self-stretch" />
          <ColorPalette />
        </>
      )
    if (showTextRow)
      return (
        <>
          <FontSizePicker />
          <div className="w-px bg-border self-stretch" />
          <ColorPalette />
        </>
      )
    if (showDistanceRow)
      return (
        <>
          <DistanceVariantPicker />
          <div className="w-px bg-border self-stretch" />
          <ColorPalette />
        </>
      )
    return null
  })()

  // The unified arrow points at whichever trigger button owns the currently-
  // visible pill or popover. Changing this ref slides the arrow to the new
  // target via the CSS `left` transition inside UnifiedPillArrow.
  const arrowTargetRef = (() => {
    if (libOpen || pending !== null) return snapshotsAnchorRef
    if (opacityOpen) return opacityAnchorRef
    if (showInkRow) return penAnchorRef
    if (showShapeRow) return shapeAnchorRef
    if (showTextRow) return textAnchorRef
    if (showDistanceRow) return distanceAnchorRef
    return null
  })()

  // Opacity popover positions itself absolutely at the opacity button's x
  // (rather than being a flex child centered in the wrapper) so that its
  // bar sits directly above the trigger and the connecting arrow stays
  // inside it.
  const [opacityX, setOpacityX] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (!opacityOpen) {
      setOpacityX(null)
      return
    }
    function update(): void {
      const a = opacityAnchorRef.current
      const w = containerRef.current
      if (!a || !w) return
      const ar = a.getBoundingClientRect()
      const wr = w.getBoundingClientRect()
      setOpacityX(ar.left + ar.width / 2 - wr.left)
    }
    update()
    const ro = new ResizeObserver(update)
    if (containerRef.current) ro.observe(containerRef.current)
    if (opacityAnchorRef.current) ro.observe(opacityAnchorRef.current)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [opacityOpen])

  function buildBoardState(): BoardState {
    return {
      schemaVersion: 1,
      elements,
      authoredAtGameSize: { w: window.innerWidth, h: window.innerHeight },
    }
  }

  function onClearAll(): void {
    if (elementCount === 0) return
    if (!confirmingClear) {
      setConfirmingClear(true)
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
      clearTimerRef.current = setTimeout(() => setConfirmingClear(false), 3000)
      return
    }
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    clearTimerRef.current = null
    setConfirmingClear(false)
    clearAll()
  }

  function onToggleLibrary(): void {
    if (libOpen) {
      setLibOpen(false)
    } else {
      setOpacityOpen(false)
      setPending(null)
      setLibOpen(true)
    }
  }

  function onToggleOpacity(): void {
    if (opacityOpen) {
      setOpacityOpen(false)
    } else {
      setLibOpen(false)
      setPending(null)
      setOpacityOpen(true)
    }
  }

  function onPickSnapshot(snap: BoardSnapshot): void {
    setLibOpen(false)
    if (elements.length === 0) {
      replaceAll(snap.state.elements)
      return
    }
    setPending({ kind: 'open', snap })
  }

  function onSaveCurrent(): void {
    setLibOpen(false)
    setPending({ kind: 'save-only' })
  }

  function applyPending(): void {
    if (!pending) return
    if (pending.kind === 'open') replaceAll(pending.snap.state.elements)
    setPending(null)
  }

  function handleDialogSave(name: string): void {
    const state = buildBoardState()
    window.api.whiteboard.saveAsSnapshot(version, name, state).then(() => {
      const wasSaveOnly = pending?.kind === 'save-only'
      applyPending()
      if (wasSaveOnly) setLibOpen(true)
    })
  }
  function handleDialogDiscard(): void {
    applyPending()
  }
  function handleDialogCancel(): void {
    setPending(null)
  }

  // Pen icon shown in the big slot reflects the active sub-tool. Defaults to
  // marker so the slot has presence even outside ink mode.
  const PenSlotIcon = (() => {
    if (tool === 'highlighter') return <ToolHighlighter size={BIG_SLOT_ICON_SIZE} color={color} />
    if (tool === 'eraser') return <ToolEraser size={BIG_SLOT_ICON_SIZE} />
    return <ToolMarker size={BIG_SLOT_ICON_SIZE} color={color} />
  })()

  /** Close every open popover in one call so React batches the updates with
   *  any tool change in the same render. Without this, dismiss-on-outside
   *  fires on pointerdown (closing the popover) and the tool-change fires on
   *  click (later event). Between them React commits a frame where the
   *  contextual pill of the *previous* tool flashes back into view. */
  function closePopovers(): void {
    if (libOpen) setLibOpen(false)
    if (opacityOpen) setOpacityOpen(false)
    if (pending !== null) setPending(null)
  }

  /** Set the active tool and dismiss any open popover atomically. */
  function pickTool(t: Tool): void {
    closePopovers()
    setTool(t)
  }

  // Pen slot is the one click handler that needs a guard: clicking the slot
  // while a pen-family tool is already active should keep that sub-tool, not
  // reset to plain pen.
  const onPenSlotClick = (): void => {
    closePopovers()
    if (!isPenFamily(tool)) setTool('pen')
  }

  const onDistanceSlotClick = (): void => {
    closePopovers()
    if (tool !== 'ruler' && tool !== 'radiusRing') setTool('radiusRing')
  }

  return (
    <div
      ref={containerRef}
      className="absolute -translate-x-1/2 flex flex-col items-center gap-2 select-none"
      style={{ left: pos.left, bottom: pos.bottom }}
    >
      {contextualRowBody && (
        <div className={`${PANEL_CHROME} p-2 flex gap-2 items-center wb-pop-in`}>{contextualRowBody}</div>
      )}
      {opacityOpen && opacityX !== null && (
        <div
          ref={opacityPillRef}
          className="absolute bottom-[calc(100%+8px)] -translate-x-1/2"
          style={{ left: opacityX }}
        >
          {/* py-4 (16px) keeps the 18px-tall slider thumb fully inside the
           * popover even at the value where its x aligns with the arrow's x.
           * Otherwise the thumb's bottom dips down past the popover's bottom
           * edge and disappears behind the arrow's diamond. */}
          <div className={`${PANEL_CHROME} px-3 py-4 flex items-center wb-pop-in`}>
            <OpacitySlider />
          </div>
        </div>
      )}
      {/* clipPath lets the marker tip (and other content) extend ABOVE the
       * toolbar freely but clips anything below at the pill's outer bottom
       * edge. Needed because the global `button:active { scale(1.18) }`
       * bounce briefly enlarges the marker's clip-path region and would
       * otherwise show the icon's body dipping past the toolbar's bottom. */}
      <div
        ref={mainPillRef}
        className={`${PANEL_CHROME} relative z-10 p-2 flex gap-1 items-center`}
        style={{ clipPath: 'inset(-9999px -9999px 0 -9999px round 22px)' }}
      >
        <ToolButton
          icon={<IconCursor />}
          title="Select"
          active={tool === 'select'}
          onClick={() => pickTool('select')}
          dismissAnchor
        />
        <ToolButton
          ref={penAnchorRef}
          icon={PenSlotIcon}
          title={tool === 'highlighter' ? 'Highlighter' : tool === 'eraser' ? 'Eraser' : 'Marker'}
          /* Drop to the inactive (lower) position when a popover is open.
           * The contextual ink pill is hidden in that state, so visually the
           * marker should match. It re-mounts up when the popover closes. */
          active={isPenFamily(tool) && !popoverOpen}
          onClick={onPenSlotClick}
          dismissAnchor
          big
        />
        <ToolButton
          ref={shapeAnchorRef}
          icon={<IconShape variant={tool === 'shape' ? shapeVariant : 'rect'} />}
          title="Shape"
          active={tool === 'shape'}
          onClick={() => pickTool('shape')}
          dismissAnchor
        />
        <ToolButton
          ref={textAnchorRef}
          icon={<IconText />}
          title="Text"
          active={tool === 'text'}
          onClick={() => pickTool('text')}
          dismissAnchor
        />
        <ToolButton
          ref={distanceAnchorRef}
          icon={<IconRuler />}
          title={distanceSupported ? 'Distance (ruler / radius)' : 'Distance - PoE2 support coming'}
          active={tool === 'ruler' || tool === 'radiusRing'}
          disabled={!distanceSupported}
          onClick={onDistanceSlotClick}
          dismissAnchor
        />
        <div className="w-px bg-border mx-1 self-stretch" />
        <ToolButton icon={<IconUndo />} title="Undo" disabled={!canUndoNow} onClick={undo} />
        <ToolButton icon={<IconRedo />} title="Redo" disabled={!canRedoNow} onClick={redo} />
        <button
          type="button"
          className={[
            'btn-ghost btn-bounce h-9 flex items-center justify-center gap-0.5',
            confirmingClear ? 'min-w-9 px-2' : 'w-9',
            elementCount === 0
              ? 'opacity-30 cursor-not-allowed text-text-dim'
              : confirmingClear
                ? '!bg-danger !text-white cursor-pointer'
                : 'text-text-dim hover:text-text cursor-pointer',
          ].join(' ')}
          title={confirmingClear ? 'Click again to confirm' : 'Clear all'}
          disabled={elementCount === 0}
          onClick={onClearAll}
        >
          <IconTrash />
          {confirmingClear && <span className="font-bold text-sm leading-none">?</span>}
        </button>
        <div className="w-px bg-border mx-1 self-stretch" />
        <ToolButton
          ref={snapshotsAnchorRef}
          icon={<IconLayers />}
          title="Snapshots"
          active={libOpen || pending !== null}
          onClick={onToggleLibrary}
          dismissAnchor
        />
        <ToolButton
          ref={opacityAnchorRef}
          icon={<IconOpacity />}
          title="Opacity"
          active={opacityOpen}
          onClick={onToggleOpacity}
          dismissAnchor
        />
        <div className="w-px bg-border mx-1 self-stretch" />
        <PlayToggle />
      </div>
      <SaveCurrentDialog
        open={pending !== null}
        warnLoseWork={pending?.kind === 'open'}
        onSave={handleDialogSave}
        onDiscard={handleDialogDiscard}
        onCancel={handleDialogCancel}
      />
      <SnapshotLibrary
        open={libOpen}
        version={version}
        hasCurrentWork={elements.length > 0}
        onPick={onPickSnapshot}
        onClose={() => setLibOpen(false)}
        onDelete={() => {
          /* nothing - lib refreshes itself */
        }}
        onSaveCurrent={onSaveCurrent}
      />
      {/* Render arrow LAST so it sits on TOP of every bar/popover. The
       * arrow's bg matches `--bg-card-translucent`, so the upper half that
       * overlaps the bar reads as part of it (a "speech bubble" body),
       * while the lower half extends below as the tail. Rendering on top
       * also avoids being clipped behind the wider snapshot library /
       * save-dialog panels which span across the trigger button's x. */}
      <UnifiedPillArrow wrapperRef={containerRef} targetRef={arrowTargetRef} />
    </div>
  )
}
