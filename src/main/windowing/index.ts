import { app, type BrowserWindow, screen } from 'electron'
import { OverlayController } from 'electron-overlay-window'
import { uIOhook } from 'uiohook-napi'
import { guardNativeListener } from '../diagnostics'
import { hideAllOnPoeBlur, isAnyScalpelWindowFocused } from './focus'
import { prewarmSnapCanvas, type Rect, setSnapGhost } from './snap-canvas'
import { fireOnLeaveScalpel, type OverlayState, overlays } from './state'
import { createOverlayWindow } from './window'

export type { OverlayAnchor } from '../../shared/types'
export {
  aroundNativeDialog,
  closeAllOverlaysOnPoeExit,
  hideAllOnPoeBlur,
  hideFocusedOrAnyVisibleSecondaryOverlay,
  isAnyScalpelWindowFocused,
  isInsideAnySecondaryOverlay,
  isSecondaryOverlayWindow,
  restoreAllOnPoeFocus,
} from './focus'
export { prewarmSnapCanvas, setSnapGhost } from './snap-canvas'
export { registerAuxiliaryScalpelWindow, registerOnPoeLeave, setMainOverlayGetter, setOnLeaveScalpel } from './state'
// Public re-exports - this module is the public face of the windowing system.
export type { Rect }

import type { OverlayAnchor } from '../../shared/types'

export interface OverlaySpec {
  /** Stable id, used for IPC channels and as a lookup key. Kebab-case. */
  id: string
  /** HTML filename in src/renderer/, e.g. 'cheat-sheets-grid.html'. */
  htmlEntry: string
  /** The spec's default anchor - used when no stored anchor exists, and as
   *  the snap target during drag. */
  defaultAnchor: () => OverlayAnchor
  /** Optional: read persisted anchor (from electron-store etc.). */
  storedAnchor?: () => OverlayAnchor | undefined
  /** Optional: fired when the user moves or resizes the window. Persist here. */
  onAnchorChanged?: (anchor: OverlayAnchor) => void
  /** Optional override for how the snap-back rect is derived from the spec's
   *  default-anchor rect and the window's current size. When omitted, the
   *  snap target uses the default rect's top-left with the window's current
   *  size - good when the mount point is the top-left corner. Specs whose
   *  mount point is conceptually elsewhere (center+bottom, etc.) supply this
   *  so the ghost (and snap commit) tracks the user's resize. */
  snapTarget?: (defaultRect: Rect, cur: Rect) => Rect
  /** Fired once after did-finish-load + the very first show. The earliest
   *  safe point to deliver IPCs whose payload was known at registration time
   *  but couldn't be sent during window creation (renderer wasn't mounted
   *  yet, so webContents.send would silently drop them). */
  onFirstShow?: (win: BrowserWindow) => void
  /** When true, re-apply the (resolved) anchor bounds on every show, not just at
   *  window creation. For specs whose `defaultAnchor` is context-dependent and
   *  must re-evaluate each time the window is shown. Default (false) keeps the
   *  position the window last had. */
  repositionOnShow?: boolean
}

/** Multiply an anchor against a rect, returning a rect in the same coordinate
 *  space as the input. Used in physical space (anchor x PoE physical bounds)
 *  and logical space (anchor x display workArea fallback). */
function anchorTimes(anchor: OverlayAnchor, base: Rect): Rect {
  return {
    x: Math.round(base.x + anchor.fracX * base.width),
    y: Math.round(base.y + anchor.fracY * base.height),
    width: Math.round(anchor.fracW * base.width),
    height: Math.round(anchor.fracH * base.height),
  }
}

/** Compute the DIP (logical) bounds an overlay window should occupy for the
 *  given anchor. Uses `screen.screenToDipRect(win, physRect)` - the same path
 *  the electron-overlay-window library uses for the main overlay - so behavior
 *  matches across all DPI / multi-monitor configurations.
 *
 *  Returns null when PoE bounds aren't available yet. */
function anchorToDipBounds(win: BrowserWindow, anchor: OverlayAnchor): Rect | null {
  const tb = OverlayController.targetBounds
  if (!tb || tb.width <= 0 || tb.height <= 0) return null
  const phys = anchorTimes(anchor, { x: tb.x, y: tb.y, width: tb.width, height: tb.height })
  return screen.screenToDipRect(win, phys)
}

/** Compute an anchor from a window's current DIP bounds. Converts PoE's
 *  physical bounds to DIP using the same `screenToDipRect` path so the
 *  numerator and denominator are in the same coordinate space. */
function boundsToAnchor(win: BrowserWindow): OverlayAnchor | null {
  const tb = OverlayController.targetBounds
  if (!tb || tb.width <= 0 || tb.height <= 0) return null
  const poeDip = screen.screenToDipRect(win, { x: tb.x, y: tb.y, width: tb.width, height: tb.height })
  if (poeDip.width <= 0 || poeDip.height <= 0) return null
  const cur = win.getBounds()
  return {
    fracX: (cur.x - poeDip.x) / poeDip.width,
    fracY: (cur.y - poeDip.y) / poeDip.height,
    fracW: cur.width / poeDip.width,
    fracH: cur.height / poeDip.height,
  }
}

export interface SecondaryOverlay {
  show(): void
  hide(): void
  toggle(): void
  isVisible(): boolean
  send(channel: string, ...args: unknown[]): void
  /** The underlying BrowserWindow. Null until the first .show() (window is
   *  created lazily so we don't spawn renderers for overlays the user never
   *  touches in a session). */
  getWindow(): BrowserWindow | null
  /** Set window bounds without triggering the anchor-persist callback that
   *  user-driven drags fire. Use for programmatic resize/move flows (minimize
   *  animation, content-driven height) that shouldn't pollute the stored
   *  anchor. No-op if the window hasn't been created. */
  setBoundsProgrammatic(target: Rect): void
  /** Resize the window in place without moving it. Calls setBounds exactly
   *  once: the double-call in setBoundsProgrammatic exists to settle cross-
   *  display anchor moves, and at fractional Windows scale factors (1.5x in
   *  particular) the second call compounds the DPI conversion - growing the
   *  window by the scale factor on every call. Size-only updates never cross
   *  displays, so single-apply is both correct and necessary. No-op if the
   *  window hasn't been created. */
  setSizeProgrammatic(width: number, height: number): void
  /** Hide the window without clearing the alt-tab restore memory. Use when
   *  the hide is driven by content/state (e.g. the pinned-zone overlay
   *  reacting to a zone with no matching cheat sheet) rather than the user
   *  explicitly dismissing the overlay. The default hide() treats the hide
   *  as user intent and clears wasVisibleBeforeFocusLoss so PoE refocus
   *  doesn't bring it back; that's wrong for content-driven hides because
   *  the next alt-tab can leave the window permanently hidden when it
   *  happened to be opacity-hidden at PoE-blur time (isVisible() returns
   *  false then, so hideAllOnPoeBlur doesn't re-record the flag). */
  hideKeepingRestore(): void
}

const SNAP_RANGE = 80
/** Window between a programmatic setBounds and clearing the "ignore the move
 *  events that setBounds will fire" flag. Long enough for the OS to deliver
 *  every synthetic move/moved/resized event the bounds change provokes. */
const PROGRAMMATIC_MOVE_SETTLE_MS = 200

function resolveAnchor(spec: OverlaySpec): OverlayAnchor {
  return spec.storedAnchor?.() ?? spec.defaultAnchor()
}

/** Snap target = the spec's default anchor's POSITION, with the window's
 *  CURRENT size. Lets the user resize the window then drag-snap back to its
 *  "home" without losing the new size. Returns null when PoE isn't attached
 *  (no anchor frame of reference). */
function snapTargetFor(state: OverlayState, cur: Rect): Rect | null {
  if (!state.win || state.win.isDestroyed()) return null
  const defaultRect = anchorToDipBounds(state.win, state.spec.defaultAnchor())
  if (!defaultRect) return null
  if (state.spec.snapTarget) return state.spec.snapTarget(defaultRect, cur)
  return { x: defaultRect.x, y: defaultRect.y, width: cur.width, height: cur.height }
}

/** Apply a programmatic setBounds and arm the settle timer. Calls setBounds
 *  twice on Windows because a fresh BrowserWindow's first setBounds doesn't
 *  always stick at the OS level (and a cross-DPI move needs a second pass to
 *  resolve the new display's scale factor) - same workaround the
 *  electron-overlay-window library uses for the main overlay. Replaces any
 *  pending settle so rapid back-to-back calls (PoE live-drag) don't let the
 *  flag drop while move/moved events from the latest setBounds are still in
 *  flight. */
function setBoundsProgrammatic(state: OverlayState, target: Rect): void {
  if (!state.win || state.win.isDestroyed()) return
  state.inProgrammaticMove = true
  state.win.setBounds(target)
  if (process.platform === 'win32') state.win.setBounds(target)
  if (state.programmaticSettleTimer) clearTimeout(state.programmaticSettleTimer)
  state.programmaticSettleTimer = setTimeout(() => {
    state.inProgrammaticMove = false
    state.programmaticSettleTimer = null
  }, PROGRAMMATIC_MOVE_SETTLE_MS)
}

/** Size-only programmatic resize. Single setBounds (no double-apply): the
 *  double-call in setBoundsProgrammatic is there to settle cross-display
 *  anchor moves, but on Windows at fractional scale factors (1.5x) calling
 *  setBounds twice with the same target compounds the DIP-to-physical
 *  conversion, growing the window by the scale factor every call. The
 *  pinned-zone ResizeObserver-driven height update fires this many times per
 *  second, so the compounding turns into runaway growth. Size-only updates
 *  don't move the window, so single-apply is sufficient. */
function setSizeProgrammatic(state: OverlayState, width: number, height: number): void {
  if (!state.win || state.win.isDestroyed()) return
  const cur = state.win.getBounds()
  if (cur.width === width && cur.height === height) return
  state.inProgrammaticMove = true
  state.win.setBounds({ x: cur.x, y: cur.y, width, height })
  if (state.programmaticSettleTimer) clearTimeout(state.programmaticSettleTimer)
  state.programmaticSettleTimer = setTimeout(() => {
    state.inProgrammaticMove = false
    state.programmaticSettleTimer = null
  }, PROGRAMMATIC_MOVE_SETTLE_MS)
}

/** Push the current anchor's DIP bounds onto the window. No-op when PoE
 *  isn't attached yet - the bounds will be applied by `repositionAll` when
 *  the next 'attach' event fires. */
function applyAnchorBounds(state: OverlayState): void {
  if (!state.win || state.win.isDestroyed()) return
  const dip = anchorToDipBounds(state.win, resolveAnchor(state.spec))
  if (!dip) return
  setBoundsProgrammatic(state, dip)
}

// Track left-mouse-button state globally so we only show the snap ghost when
// the user is actually dragging. gridWin.on('move') fires for *any* bounds
// change - initial creation, programmatic restores, etc. - so without this
// gate the ghost would light up whenever a persisted position happens to be
// within snap range of the default. Mirrors how the main overlay only updates
// snap state inside its drag-bound mousemove handler.
let leftMouseHeld = false
uIOhook.on(
  'mousedown',
  guardNativeListener('mousedown-snap', (e) => {
    if (e.button === 1) leftMouseHeld = true
  }),
)
uIOhook.on(
  'mouseup',
  guardNativeListener('mouseup-snap', (e) => {
    if (e.button === 1) leftMouseHeld = false
    // Don't clear snapGhostActive here - the gridWin 'moved' event fires
    // *after* this mouseup and needs the flag set to know whether to commit
    // the snap. Clearing it here would silently break the snap.
  }),
)

export function registerSecondaryOverlay(spec: OverlaySpec): SecondaryOverlay {
  if (overlays.has(spec.id)) {
    throw new Error(`Secondary overlay '${spec.id}' is already registered`)
  }
  const state: OverlayState = {
    spec,
    win: null,
    snapGhostActive: false,
    inProgrammaticMove: false,
    programmaticSettleTimer: null,
    isResizing: false,
    wasVisibleBeforeFocusLoss: false,
  }
  overlays.set(spec.id, state)
  return makeOverlayApi(state)
}

function makeOverlayApi(state: OverlayState): SecondaryOverlay {
  return {
    show: () => showState(state),
    hide: () => hideState(state),
    toggle: () => {
      if (state.win && !state.win.isDestroyed() && state.win.isVisible()) {
        hideState(state)
      } else {
        showState(state)
      }
    },
    isVisible: () => !!state.win && !state.win.isDestroyed() && state.win.isVisible(),
    send: (channel, ...args) => {
      if (state.win && !state.win.isDestroyed()) state.win.webContents.send(channel, ...args)
    },
    setBoundsProgrammatic: (target) => {
      if (!state.win || state.win.isDestroyed()) return
      setBoundsProgrammatic(state, target)
    },
    setSizeProgrammatic: (width, height) => {
      if (!state.win || state.win.isDestroyed()) return
      setSizeProgrammatic(state, width, height)
    },
    hideKeepingRestore: () => {
      if (!state.win || state.win.isDestroyed()) return
      // Opacity-based hide (installed by installOpacityHideShow). Does NOT
      // touch state.wasVisibleBeforeFocusLoss - that's the whole point.
      state.win.hide()
    },
    getWindow: () => (state.win && !state.win.isDestroyed() ? state.win : null),
  }
}

// ---- Internal state operations ---------------------------------------------

function ensureWin(state: OverlayState): BrowserWindow {
  if (state.win && !state.win.isDestroyed()) return state.win
  // Window must exist before we can call `screen.screenToDipRect(win, ...)`
  // (the same path the library uses for the main overlay), so create at a
  // sensible placeholder - the display PoE is on if known, otherwise primary
  // workArea - then immediately overwrite with the anchor-derived DIP bounds.
  const placeholder = pickPlaceholderBounds()
  const win = createOverlayWindow({ htmlEntry: state.spec.htmlEntry, bounds: placeholder })
  state.win = win
  applyAnchorBounds(state)
  prewarmSnapCanvas()
  wireWindowEvents(state, win)
  win.webContents.once('did-finish-load', () => {
    if (!state.win || state.win.isDestroyed()) return
    // Reapply anchor bounds: on Windows the first setBounds after window
    // creation doesn't always stick until the renderer is loaded. Mirrors
    // the double-apply pattern in electron-overlay-window.
    applyAnchorBounds(state)
    // First show registers the window with the OS (one-time animation).
    // Doesn't steal focus from PoE - see installOpacityHideShow comment.
    state.win.show()
    state.spec.onFirstShow?.(state.win)
  })
  return win
}

/** Best-guess initial bounds before the window exists. Prefers the display
 *  PoE is on (so the placeholder is on the right monitor), falling back to
 *  the primary display's workArea when PoE isn't attached. Always in DIP. */
function pickPlaceholderBounds(): Rect {
  const tb = OverlayController.targetBounds
  if (tb && tb.width > 0 && tb.height > 0) {
    const display = screen.getDisplayNearestPoint({
      x: tb.x + Math.round(tb.width / 2),
      y: tb.y + Math.round(tb.height / 2),
    })
    return display.workArea
  }
  return screen.getPrimaryDisplay().workArea
}

function showState(state: OverlayState): void {
  const win = ensureWin(state)
  // The did-finish-load handler above takes care of the very first show.
  // Subsequent shows (window already loaded) just flip opacity. No .focus()
  // call - we never want to steal focus from PoE (background PoE breaks
  // hold-to-move and re-triggers PoE-blur which causes overlay flicker).
  if (win.webContents.isLoading()) return
  if (win.isVisible()) return
  if (state.spec.repositionOnShow) applyAnchorBounds(state)
  win.show()
}

function hideState(state: OverlayState): void {
  if (!state.win || state.win.isDestroyed()) return
  // Explicit user-driven hide: clear the auto-restore memory so PoE
  // refocusing doesn't bring it back. Only PoE alt-tab cycles restore.
  state.wasVisibleBeforeFocusLoss = false
  state.win.hide()
}

// Secondary overlays hide-instead-of-close so their hotkey can re-show them.
// During app shutdown they must actually close: the unconditional preventDefault
// below otherwise refuses the close and stalls Electron's quit forever
// (before-quit fires, will-quit never does), hanging the process. Only bites
// when a secondary overlay was opened this session -- which is why the hang was
// intermittent. Mirrors the quitting guard in app-window.ts.
let appQuitting = false
app.on('before-quit', () => {
  appQuitting = true
})

function wireWindowEvents(state: OverlayState, win: BrowserWindow): void {
  win.on('close', (e) => {
    if (appQuitting) return
    e.preventDefault()
    win.hide()
    state.wasVisibleBeforeFocusLoss = false
  })
  win.on('move', () => {
    if (state.inProgrammaticMove) return
    maybeUpdateSnap(state)
  })
  win.on('moved', () => {
    if (state.inProgrammaticMove) return
    if (state.snapGhostActive) {
      // Snap will commit: skip persisting the user's pre-snap drop position
      // and persist the snapped position once after setBounds. The synthetic
      // 'moved' Windows fires from setBounds-inside-a-moved-handler doesn't
      // reliably arrive on Windows, so we have to persist explicitly.
      state.snapGhostActive = false
      setSnapGhost(null)
      const target = snapTargetFor(state, win.getBounds())
      if (target) {
        setBoundsProgrammatic(state, target)
        persistBounds(state)
      }
    } else {
      persistBounds(state)
      setSnapGhost(null)
    }
  })
  win.on('will-resize', () => {
    state.isResizing = true
  })
  win.on('resized', () => {
    persistBounds(state)
    state.isResizing = false
  })
  win.on('blur', () => {
    setImmediate(() => {
      if (!state.win || state.win.isDestroyed()) return
      // PoE keeps the overlay alive; focus moving to another Scalpel window
      // (main overlay or sibling secondary) does too. Only hide when focus
      // genuinely left the app.
      if (OverlayController.targetHasFocus || isAnyScalpelWindowFocused()) return
      // Hide every visible secondary overlay, not just this one. Sibling
      // overlays (the pinned-zone overlay, in particular) never receive
      // their own blur event because they were never focused - the user
      // clicked the cheat-sheet bar, not the pinned image - so without this
      // they stay floating above the destination app's window.
      hideAllOnPoeBlur()
      // Focus left every Scalpel surface. The PoE-blur handler in main can't
      // fire here because PoE was already blurred when focus moved into this
      // overlay; without this hook, hotkeys would stay armed in the
      // destination app.
      fireOnLeaveScalpel()
    })
  })
}

function persistBounds(state: OverlayState): void {
  if (!state.win || state.win.isDestroyed()) return
  const anchor = boundsToAnchor(state.win)
  if (!anchor) return
  state.spec.onAnchorChanged?.(anchor)
}

function maybeUpdateSnap(state: OverlayState): void {
  if (!state.win || state.win.isDestroyed()) return
  // Only react to bounds changes that happen while the user is actively
  // holding the mouse (dragging the title bar). Programmatic moves and the
  // 'move' events fired during initial show would otherwise pop the ghost
  // when the persisted bounds happen to be within snap range.
  if (!leftMouseHeld) return
  // Resizing from the top/left edges shifts the origin, firing 'move' events
  // that look like a drag. Skip - the user isn't repositioning, they're
  // resizing.
  if (state.isResizing) return
  const cur = state.win.getBounds()
  const target = snapTargetFor(state, cur)
  if (!target) return
  const dist = Math.hypot(cur.x - target.x, cur.y - target.y)
  const wantActive = dist < SNAP_RANGE
  if (wantActive === state.snapGhostActive) return
  state.snapGhostActive = wantActive
  setSnapGhost(state.snapGhostActive ? target : null)
}

/** The current anchor (fractions of PoE's window) of a registered secondary
 *  overlay's live window, or null if it doesn't exist yet or PoE isn't
 *  attached. Lets owning modules detect where their window currently sits
 *  (e.g. whether it's flush against a dock edge). */
export function getOverlayAnchor(id: string): OverlayAnchor | null {
  const state = overlays.get(id)
  if (!state?.win || state.win.isDestroyed()) return null
  return boundsToAnchor(state.win)
}

/** Every registered secondary-overlay window that currently exists (created
 *  lazily on first show) and isn't destroyed. Used by broadcast/notify paths
 *  that need to reach secondary overlays in addition to the primary windows. */
export function getSecondaryOverlayWindows(): BrowserWindow[] {
  const wins: BrowserWindow[] = []
  for (const state of overlays.values()) {
    if (state.win && !state.win.isDestroyed()) wins.push(state.win)
  }
  return wins
}

/** Subscribe to PoE attach/move/resize events and re-anchor every registered
 *  secondary overlay's window to track PoE. Call once during main-process boot
 *  after OverlayController is wired up. */
export function subscribeToPoeMoves(): void {
  OverlayController.events.on('attach', guardNativeListener('reposition-attach', repositionAll))
  OverlayController.events.on('moveresize', guardNativeListener('reposition-moveresize', repositionAll))
}

function repositionAll(): void {
  for (const state of overlays.values()) {
    if (!state.win || state.win.isDestroyed()) continue
    applyAnchorBounds(state)
  }
}
