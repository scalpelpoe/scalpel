import { join } from 'node:path'
import { BrowserWindow, screen } from 'electron'
import { OverlayController, OVERLAY_WINDOW_OPTS } from 'electron-overlay-window'
import {
  CHEAT_SHEET_MINIMIZED_HEIGHT,
  CHEAT_SHEET_MINIMIZED_SLACK,
  CHEAT_SHEET_MINIMIZED_WIDTH,
  restoreTargetRect,
} from '@shared/cheat-sheet-window'
import type { CheatSheetsSettings, OverlayAnchor } from '@shared/types'
import { forwardZoneChangesTo, sendCurrentZoneTo } from './client-log'
import { setSecondaryOverlayHotkeys } from './hotkeys'
import {
  type Rect,
  registerAuxiliaryScalpelWindow,
  registerOnPoeLeave,
  registerSecondaryOverlay,
  type SecondaryOverlay,
} from './windowing'

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
  // Mutual exclusion: hide the whiteboard before showing the cheat sheet -
  // UNLESS it's persisting (passthrough mode), where it stays behind.
  if (!wasVisible) {
    import('./whiteboard').then(({ getWhiteboardOverlay }) => {
      const wb = getWhiteboardOverlay()
      if (wb && !wb.getPersistOverOthers()) wb.hide()
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
  // When the grid is being dismissed, also clear any in-flight hover preview:
  // the renderer's onMouseLeave doesn't fire from an opacity-hide so the
  // preview would otherwise stay painted above PoE indefinitely.
  if (wasVisible) hidePreview()
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
/** Hover previews stay suppressed for the length of a minimize/restore tween
 *  plus this tail. As the grid grows back, thumbnails reflow under a stationary
 *  cursor and fire mouseEnter; without the guard each one flashes the fullscreen
 *  preview. The tail covers the final reflow's mouseEnter, which can land a frame
 *  or two after the last tween step. */
const PREVIEW_SUPPRESS_TAIL_MS = 120
/** Default size used when expand is requested but we don't have a saved
 *  pre-minimize size (e.g. the user shrank the window manually, or the app
 *  was restarted while the window was at its minimized footprint). The user
 *  can resize from there. */
const DEFAULT_EXPANDED_WIDTH = 460
const DEFAULT_EXPANDED_HEIGHT = 270

/** Size the window had immediately before the user pressed minimize. Only the
 *  size survives minimize now - the restore position is derived from wherever
 *  the strip currently sits, since the user may have dragged it while
 *  minimized. Cleared once the restore tween starts so a stale entry doesn't
 *  outlive its usefulness. */
let preMinimizeSize: { width: number; height: number } | null = null
let animationTimer: NodeJS.Timeout | null = null
/** Epoch ms before which showPreview is a no-op. Bumped whenever a size tween
 *  starts (animateBoundsTo) so reflow-driven mouseEnter events during the
 *  un-minimize animation don't flash the hover preview. */
let suppressPreviewUntil = 0

function clearAnimationTimer(): void {
  if (animationTimer) {
    clearInterval(animationTimer)
    animationTimer = null
  }
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

function animateBoundsTo(target: Rect, onComplete?: () => void): void {
  const win = overlay?.getWindow()
  if (!win || win.isDestroyed()) return
  clearAnimationTimer()
  // Mute hover previews for the tween (+ tail): as the grid resizes, thumbnails
  // slide under a stationary cursor and fire mouseEnter, which would otherwise
  // flash the fullscreen preview. See showPreview.
  suppressPreviewUntil = Date.now() + ANIMATION_DURATION_MS + PREVIEW_SUPPRESS_TAIL_MS
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
    overlay?.setBoundsProgrammaticOnce({
      x: Math.round(start.x + (target.x - start.x) * k),
      y: Math.round(start.y + (target.y - start.y) * k),
      width: Math.round(start.width + (target.width - start.width) * k),
      height: Math.round(start.height + (target.height - start.height) * k),
    })
    if (t >= 1) {
      clearAnimationTimer()
      onComplete?.()
    }
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
  preMinimizeSize = { width: cur.width, height: cur.height }
  animateBoundsTo(
    {
      x: cur.x + cur.width - CHEAT_SHEET_MINIMIZED_WIDTH,
      y: cur.y + cur.height - CHEAT_SHEET_MINIMIZED_HEIGHT,
      width: CHEAT_SHEET_MINIMIZED_WIDTH,
      height: CHEAT_SHEET_MINIMIZED_HEIGHT,
    },
    // Lock the collapsed strip non-resizable so an edge-drag can't pull it back
    // open into a half-minimized state (which desyncs preMinimizeSize from the
    // renderer's height-derived minimized flag). The restore button is the only
    // intended way back; restoreCheatSheets re-enables resizing.
    () => {
      const w = overlay?.getWindow()
      if (w && !w.isDestroyed()) w.setResizable(false)
    },
  )
}

/** Restore the cheat-sheets window. Expands in place from the strip's current
 *  bottom-right corner - it may have been dragged since minimize - reusing the
 *  pre-minimize size when we recorded one this session, or the default size
 *  otherwise. Clamped fully on-screen so a strip parked near the top or left
 *  screen edge can't expand the header out of reach (this also covers a stale
 *  saved size from a display that has since changed resolution or been
 *  unplugged, since clampRectToScreen caps the size to the display it lands
 *  on). */
export function restoreCheatSheets(): void {
  const win = overlay?.getWindow()
  if (!win || win.isDestroyed()) return
  // Minimize locked the window non-resizable; re-enable it before the grow tween
  // so the restored grid can be edge-resized again.
  win.setResizable(true)
  const cur = win.getBounds()
  const size = preMinimizeSize ?? { width: DEFAULT_EXPANDED_WIDTH, height: DEFAULT_EXPANDED_HEIGHT }
  const display = screen.getDisplayNearestPoint({
    x: cur.x + Math.round(cur.width / 2),
    y: cur.y + Math.round(cur.height / 2),
  })
  const target = restoreTargetRect(cur, size, display.bounds)
  preMinimizeSize = null
  animateBoundsTo(target)
}

// ---- Hover preview (dedicated transparent click-through window) -----------

// A standalone preview window, sized per-show to match PoE's bounds. We don't
// reuse the shared full-desktop canvas (snap-canvas) because that window spans
// every display, which forces Chromium to pick a single devicePixelRatio - so
// on a mixed-DPI multi-monitor desktop a box sized in DIP renders at the wrong
// physical scale on any monitor that doesn't match the chosen dpr, and there's
// no CSS sizing trick that fixes it (the per-monitor DIP slice is fixed by the
// window's bounds). By giving the preview its own window whose bounds match
// PoE's display, Chromium assigns it that monitor's dpr and w-full/h-full
// just works.
//
// Lifecycle mirrors snap-canvas: create once on first use, never destroy, never
// .hide() (which would trigger Windows' show/hide animation on next reveal).
// "Hide" is just an IPC clearing the image - the window stays as a transparent
// click-through layer doing nothing.

let previewWin: BrowserWindow | null = null
let previewShown = false
// True once the renderer has fired did-finish-load. Before that, IPC sends
// are silently dropped (same gotcha that pendingFocusCategory works around
// for the grid window).
let previewReady = false
// Latest src reported via showPreview while the renderer is still loading.
// Flushed in the did-finish-load handler. Also doubles as "preview is logically
// showing" state for PoE-move re-bounding and PoE-leave clearing.
let pendingPreviewSrc: string | null = null
// Auxiliary-window + PoE-leave registrations live for the lifetime of the
// process; the unregister thunks aren't needed.
let previewHooksRegistered = false

function registerPreviewHooks(): void {
  if (previewHooksRegistered) return
  previewHooksRegistered = true
  // Make the preview visible to focus.ts so aroundNativeDialog can demote its
  // screen-saver alwaysOnTop level when a native file picker opens.
  registerAuxiliaryScalpelWindow(() => previewWin)
  // Clear the image on alt-tab and PoE exit so it doesn't paint over the
  // destination app. The window itself stays alive (warm) but renders nothing
  // when src is null.
  registerOnPoeLeave(() => hidePreview())
  // Track PoE moves while a preview is visible. Without this a windowed-PoE
  // user dragging the game during a hover would see the preview detach and
  // stay at PoE's old bounds until the next mouseEnter.
  OverlayController.events.on('moveresize', () => {
    if (pendingPreviewSrc === null || !previewWin || previewWin.isDestroyed()) return
    setBoundsToGame(previewWin)
  })
}

function ensurePreviewWindow(): BrowserWindow {
  if (previewWin && !previewWin.isDestroyed()) return previewWin
  // Fresh window - reset both flags so showPreview takes the first-show branch
  // and so pre-load IPCs get stashed instead of silently dropped. Without this
  // reset, a destroyed-and-recreated previewWin would be stuck in the
  // moveTop-only branch and stay invisible forever.
  previewShown = false
  previewReady = false
  previewWin = new BrowserWindow({
    ...OVERLAY_WINDOW_OPTS,
    focusable: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  // 'screen-saver' matches the secondary overlays' level so the preview lifts
  // above PoE and the cheat-sheet grid window without fighting the taskbar.
  previewWin.setAlwaysOnTop(true, 'screen-saver')
  previewWin.setIgnoreMouseEvents(true)
  previewWin.webContents.once('did-finish-load', () => {
    previewReady = true
    if (previewWin && !previewWin.isDestroyed() && pendingPreviewSrc !== null) {
      previewWin.webContents.send('cheat-sheet-preview:render', { src: pendingPreviewSrc })
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    void previewWin.loadURL(`${process.env.ELECTRON_RENDERER_URL}/cheat-sheet-preview.html`)
  } else {
    void previewWin.loadFile(join(__dirname, '../renderer/cheat-sheet-preview.html'))
  }
  registerPreviewHooks()
  return previewWin
}

/** Bound the window to PoE's current rect in DIP. Pass null as the reference
 *  window to screenToDipRect so the conversion uses the display nearest the
 *  RECT (PoE's monitor) rather than the window's current display - otherwise
 *  the first show would use the preview window's default-placement display
 *  (primary) for the conversion, and a PoE on a different-DPI secondary
 *  monitor would land at the wrong scale on first hover. On non-Windows
 *  targetBounds is already logical. */
function setBoundsToGame(win: BrowserWindow): boolean {
  const tb = OverlayController.targetBounds
  if (!tb || !tb.width || !tb.height) return false
  const dip =
    process.platform === 'win32'
      ? screen.screenToDipRect(null, { x: tb.x, y: tb.y, width: tb.width, height: tb.height })
      : { x: tb.x, y: tb.y, width: tb.width, height: tb.height }
  win.setBounds(dip)
  // Windows's first setBounds across displays / on a freshly created window
  // doesn't always stick; the second call lets the OS settle. Matches the
  // electron-overlay-window library's double-apply pattern.
  if (process.platform === 'win32') win.setBounds(dip)
  return true
}

export function showPreview(src: string): void {
  // Drop preview requests fired while a minimize/restore tween is settling - the
  // mouseEnter came from the grid reflowing under the cursor, not a real hover.
  if (Date.now() < suppressPreviewUntil) return
  const win = ensurePreviewWindow()
  if (!setBoundsToGame(win)) {
    // No game attached (dev runs without PoE). Fall back to the primary work
    // area, using the same double-setBounds pattern setBoundsToGame uses so a
    // fresh window at fractional Windows DPI commits on the second call.
    const wa = screen.getPrimaryDisplay().workArea
    const rect = { x: wa.x, y: wa.y, width: wa.width, height: wa.height }
    win.setBounds(rect)
    if (process.platform === 'win32') win.setBounds(rect)
  }
  pendingPreviewSrc = src
  if (previewReady) {
    win.webContents.send('cheat-sheet-preview:render', { src })
  }
  // Re-assert top so the preview sits above the grid window every show (both
  // at 'screen-saver' level, so last-on-top wins) - including the first show,
  // where the grid was raised earlier by restoreAllOnPoeFocus/aroundNativeDialog
  // and would otherwise stack above us.
  if (!previewShown) {
    win.showInactive()
    previewShown = true
  }
  win.moveTop()
}

export function hidePreview(): void {
  pendingPreviewSrc = null
  const win = previewWin
  if (!win || win.isDestroyed()) return
  // Only meaningful to send if the renderer is loaded - otherwise the stash
  // above already prevents the next did-finish-load from flushing stale src.
  if (previewReady) win.webContents.send('cheat-sheet-preview:render', { src: null })
}
