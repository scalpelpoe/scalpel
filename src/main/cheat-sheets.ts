import { screen } from 'electron'
import { OverlayController } from 'electron-overlay-window'
import {
  CHEAT_SHEET_MINIMIZED_HEIGHT,
  CHEAT_SHEET_MINIMIZED_SLACK,
  CHEAT_SHEET_MINIMIZED_WIDTH,
} from '../shared/cheat-sheet-window'
import type { CheatSheetsSettings, OverlayAnchor } from '../shared/types'
import { forwardZoneChangesTo, sendCurrentZoneTo } from './client-log'
import { setSecondaryOverlayHotkeys } from './hotkeys'
import { moveCanvasTop, type Rect, registerSecondaryOverlay, type SecondaryOverlay, sendCanvasIpc } from './windowing'

// Re-export the pure storage / image-fetch helpers so consumers (handlers,
// protocol handler, tests) keep their existing import path. The actual
// implementations live in cheat-sheet-storage.ts so they can be unit-tested
// without dragging the full main-process module graph in.
export {
  categoryDir,
  ensureThumb,
  fetchImageBuffer,
  generateCategoryId,
  generateSheetId,
  removeCategoryDir,
  removeSheetFile,
  saveSheetBuffer,
  sheetFilePath,
} from './cheat-sheet-storage'

// ---- Overlay registration ---------------------------------------------------

// Mount point: horizontally centered, bottom edge 17/1080 above the game's
// bottom (just above PoE's XP bar at 1080p). fracX = (1 - fracW)/2 places the
// default-sized rect's center on the game's horizontal center; fracY is set
// so fracY + fracH = 1 - 17/1080 = ~0.9843.
const DEFAULT_ANCHOR: OverlayAnchor = {
  fracX: 0.2695,
  fracY: 0.8463,
  fracW: 0.4609,
  fracH: 0.138,
}

let overlay: SecondaryOverlay | null = null
let storedAnchorGetter: () => OverlayAnchor | undefined = () => undefined
let onAnchorChangedFn: ((a: OverlayAnchor) => void) | undefined

// Stash for the focus-category IPC across the async did-finish-load delay
// the very first time the overlay opens. After that, the window is always
// loaded and IPCs deliver synchronously.
let pendingFocusCategory: string | undefined

/** Register the cheat-sheets overlay with the secondary-overlay system.
 *  Called once during main process boot (after settings are available).
 *  Returns the overlay handle so the caller can wire hotkeys. */
export function registerCheatSheetsOverlay(deps: {
  storedAnchor: () => OverlayAnchor | undefined
  onAnchorChanged: (a: OverlayAnchor) => void
}): SecondaryOverlay {
  storedAnchorGetter = deps.storedAnchor
  onAnchorChangedFn = deps.onAnchorChanged
  overlay = registerSecondaryOverlay({
    id: 'cheat-sheets',
    htmlEntry: 'cheat-sheets-grid.html',
    defaultAnchor: () => DEFAULT_ANCHOR,
    storedAnchor: () => storedAnchorGetter(),
    onAnchorChanged: (a) => onAnchorChangedFn?.(a),
    // Re-center horizontally and bottom-align against the default rect so the
    // snap ghost tracks the user's resize - dragging a narrower or shorter
    // window near the mount still snaps it centered and just above the XP bar.
    snapTarget: (defaultRect, cur) => ({
      x: Math.round(defaultRect.x + defaultRect.width / 2 - cur.width / 2),
      y: defaultRect.y + defaultRect.height - cur.height,
      width: cur.width,
      height: cur.height,
    }),
    onFirstShow: (win) => {
      // Deliver any focus-category IPC that arrived during the first window
      // creation - webContents.send before did-finish-load is silently
      // dropped, so we wait until now to flush it.
      win.webContents.send('cheat-sheet:focus-category', pendingFocusCategory)
      pendingFocusCategory = undefined
      sendCurrentZoneTo(win)
      // Floor drag-resize at the minimized footprint so the user can't
      // shrink past the header strip.
      win.setMinimumSize(CHEAT_SHEET_MINIMIZED_WIDTH, CHEAT_SHEET_MINIMIZED_HEIGHT)
    },
  })
  forwardZoneChangesTo(() => overlay?.getWindow() ?? null)
  return overlay
}

/** Handle a cheat-sheet hotkey press.
 *
 *  - **Global hotkey** (no categoryId): toggle the overlay open/closed.
 *  - **Category hotkey** (categoryId set):
 *    - If overlay is closed: open it focused on that category.
 *    - If overlay is open: just switch the active tab to that category. Don't
 *      close - the user already has it open and is asking to view a different
 *      sheet, not dismiss it. They can close it via the global hotkey or Esc.
 */
export function toggleCheatSheets(categoryId?: string): void {
  if (!overlay) return
  const wasVisible = overlay.isVisible()
  if (categoryId !== undefined && wasVisible) {
    overlay.send('cheat-sheet:focus-category', categoryId)
    return
  }
  // Mutual exclusion: hide the whiteboard before showing the cheat sheet.
  if (!wasVisible) {
    import('./whiteboard').then(({ getWhiteboardOverlay }) => {
      getWhiteboardOverlay()?.hide()
    })
  }
  // First open of the session creates the window asynchronously; stash the
  // category so onFirstShow can deliver it after did-finish-load. For
  // already-loaded windows the send below delivers immediately.
  if (!overlay.getWindow()) {
    pendingFocusCategory = categoryId
    overlay.toggle()
    return
  }
  overlay.toggle()
  if (!wasVisible) overlay.send('cheat-sheet:focus-category', categoryId)
}

export function getCheatSheetsOverlay(): SecondaryOverlay | null {
  return overlay
}

// Optional pre-show hook (index.ts wires this to hideOverlay() so the main
// overlay collapses before the cheat-sheet appears). Kept here so the hotkey
// handlers below stay self-contained.
let beforeShowHook: (() => void) | null = null

export function setCheatSheetsBeforeShow(cb: (() => void) | null): void {
  beforeShowHook = cb
}

/** Re-register the cheat-sheet hotkeys (global + per-category) with the
 *  secondary-overlay system. Called once at boot and again whenever the
 *  cheatSheets settings change. */
export function applyCheatSheetHotkeys(cs: CheatSheetsSettings): void {
  const hotkeys: Array<{ accelerator: string; handler: () => void }> = []
  const fire = (categoryId?: string): void => {
    beforeShowHook?.()
    toggleCheatSheets(categoryId)
  }
  if (cs?.globalHotkey) {
    hotkeys.push({ accelerator: cs.globalHotkey, handler: () => fire() })
  }
  for (const cat of cs?.categories ?? []) {
    if (!cat.hotkey) continue
    const id = cat.id
    hotkeys.push({ accelerator: cat.hotkey, handler: () => fire(id) })
  }
  setSecondaryOverlayHotkeys(hotkeys)
}

// ---- Minimize / restore ---------------------------------------------------

const ANIMATION_DURATION_MS = 200
const ANIMATION_FRAME_MS = 16
/** Default size used when expand is requested but we don't have saved
 *  pre-minimize bounds (e.g. the user shrank the window manually, or the app
 *  was restarted while the window was at its minimized footprint). The user
 *  can resize from there. */
const DEFAULT_EXPANDED_WIDTH = 460
const DEFAULT_EXPANDED_HEIGHT = 270

/** Bounds the window had immediately before the user pressed minimize.
 *  Restored verbatim on un-minimize. Cleared once the restore tween starts
 *  so a stale entry doesn't outlive its usefulness. */
let preMinimizeBounds: Rect | null = null
let animationTimer: NodeJS.Timeout | null = null

function clearAnimationTimer(): void {
  if (animationTimer) {
    clearInterval(animationTimer)
    animationTimer = null
  }
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

function animateBoundsTo(target: Rect): void {
  const win = overlay?.getWindow()
  if (!win || win.isDestroyed()) return
  clearAnimationTimer()
  const start = win.getBounds()
  const startTime = Date.now()
  animationTimer = setInterval(() => {
    // Window died mid-animation (close, app shutdown). Stop ticking; the
    // setBoundsProgrammatic call below would no-op but the timer would leak
    // until the t>=1 branch otherwise.
    const liveWin = overlay?.getWindow()
    if (!liveWin || liveWin.isDestroyed()) {
      clearAnimationTimer()
      return
    }
    const t = Math.min(1, (Date.now() - startTime) / ANIMATION_DURATION_MS)
    const k = easeOutCubic(t)
    overlay?.setBoundsProgrammatic({
      x: Math.round(start.x + (target.x - start.x) * k),
      y: Math.round(start.y + (target.y - start.y) * k),
      width: Math.round(start.width + (target.width - start.width) * k),
      height: Math.round(start.height + (target.height - start.height) * k),
    })
    if (t >= 1) clearAnimationTimer()
  }, ANIMATION_FRAME_MS)
}

/** Collapse the cheat-sheets window to a header-only strip anchored to the
 *  bottom-right of its current bounds. Idempotent based on actual window
 *  height: a second call while already small is a no-op, but a call after
 *  the user has drag-expanded the window will save the new bounds and shrink
 *  again. (The previous version gated on `preMinimizeBounds` set/null, which
 *  silently dropped re-minimize requests after a manual resize.) */
export function minimizeCheatSheets(): void {
  const win = overlay?.getWindow()
  if (!win || win.isDestroyed()) return
  const cur = win.getBounds()
  if (cur.height <= CHEAT_SHEET_MINIMIZED_HEIGHT + CHEAT_SHEET_MINIMIZED_SLACK) return
  preMinimizeBounds = cur
  animateBoundsTo({
    x: cur.x + cur.width - CHEAT_SHEET_MINIMIZED_WIDTH,
    y: cur.y + cur.height - CHEAT_SHEET_MINIMIZED_HEIGHT,
    width: CHEAT_SHEET_MINIMIZED_WIDTH,
    height: CHEAT_SHEET_MINIMIZED_HEIGHT,
  })
}

/** Restore the cheat-sheets window. If we recorded a pre-minimize size (this
 *  session), animate back to it. Otherwise expand from the current bottom-
 *  right anchor to a default size so the window grows into the screen rather
 *  than off the right edge. */
export function restoreCheatSheets(): void {
  const win = overlay?.getWindow()
  if (!win || win.isDestroyed()) return
  let target = preMinimizeBounds
  if (!target) {
    const cur = win.getBounds()
    target = {
      x: cur.x + cur.width - DEFAULT_EXPANDED_WIDTH,
      y: cur.y + cur.height - DEFAULT_EXPANDED_HEIGHT,
      width: DEFAULT_EXPANDED_WIDTH,
      height: DEFAULT_EXPANDED_HEIGHT,
    }
  }
  preMinimizeBounds = null
  animateBoundsTo(target)
}

// ---- Hover preview (cheat-sheet specific, renders on the shared canvas) ----

export function showPreview(src: string): void {
  // Center the image on the PoE window when known; otherwise fall back to the
  // primary display's work area (e.g. dev runs without an attached game).
  const tb = OverlayController.targetBounds
  const gameBounds =
    tb && tb.width > 0 && tb.height > 0
      ? { x: tb.x, y: tb.y, width: tb.width, height: tb.height }
      : (() => {
          const wa = screen.getPrimaryDisplay().workArea
          return { x: wa.x, y: wa.y, width: wa.width, height: wa.height }
        })()
  sendCanvasIpc('cheat-sheet-preview:render', { src, gameBounds })
  // Lift the canvas above the cheat-sheet window so the hover image visibly
  // overlays the thumbnail strip (snap ghost intentionally doesn't do this -
  // it stays behind the dragged window).
  moveCanvasTop()
}

export function hidePreview(): void {
  // Don't hide the canvas - that would trigger a paint flash on next show.
  // Just clear the cheat-sheet preview layer; snap ghost (if any) is unaffected.
  sendCanvasIpc('cheat-sheet-preview:render', { src: null, gameBounds: null })
}
