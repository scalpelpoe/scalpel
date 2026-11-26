import { BrowserWindow, screen, type BrowserWindowConstructorOptions } from 'electron'
import { OverlayController, waylandClipboard } from 'electron-overlay-window'
import { WaylandHost } from 'electron-overlay-window/dist/wayland/host'
import { createOverlayWindowBackend } from '../../../overlay-window-backend'
import { reportBreadcrumb, reportDiagnostic } from '../../../common/diagnostics'
import { nativeOverlayActive } from '../native-overlay'
import { registerCompositorClipboard } from '../wayland/compositor-clipboard'
import type { Backend, CaptureResult, WindowTracker } from '../../../types'
import { currentEnv } from '../../../select'
import { isNativeWayland } from '../display'
import { activateWaylandGame } from '../wayland/game-activation'
import { readWaylandGameFocus } from '../wayland/focus'
import {
  REGULAR_WINDOW_HEIGHT,
  REGULAR_WINDOW_PANEL_MARGIN,
  REGULAR_WINDOW_PANEL_WIDTH,
  REGULAR_WINDOW_SISTER_GAP,
  REGULAR_WINDOW_SISTER_WIDTH,
  REGULAR_WINDOW_WIDTH,
} from '../../../common/window-layout'

function centeredBounds(): Electron.Rectangle {
  let workArea: Electron.Rectangle = {
    x: 0,
    y: 0,
    width: REGULAR_WINDOW_WIDTH,
    height: REGULAR_WINDOW_HEIGHT,
  }
  try {
    workArea = screen.getPrimaryDisplay().workArea
  } catch {
    // Keep the fallback above if the display API is unavailable.
  }
  const width = Math.max(REGULAR_WINDOW_PANEL_WIDTH, Math.min(REGULAR_WINDOW_WIDTH, workArea.width))
  const height = Math.max(420, Math.min(REGULAR_WINDOW_HEIGHT, workArea.height))
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
  }
}

/** A normal focusable toplevel. Equal min/max hints make tiling compositors
 *  treat the first map like a fixed-size dialog; the host unlocks it on show. */
export function regularWindowOptions(): BrowserWindowConstructorOptions {
  const bounds = centeredBounds()
  return {
    type: 'normal',
    title: 'Scalpel',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    focusable: true,
    show: false,
    resizable: false,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    ...bounds,
    minWidth: bounds.width,
    maxWidth: bounds.width,
    minHeight: bounds.height,
    maxHeight: bounds.height,
  }
}

/** Release the fixed-size hints only after the compositor has mapped the window. */
export function unlockRegularWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  // Each hint is independent: a compositor rejecting one must not silently
  // prevent the others (notably setResizable) from taking effect.
  const apply = (label: string, fn: () => void): void => {
    try {
      fn()
    } catch (error) {
      reportDiagnostic(`regular-window:${label}`, error)
    }
  }
  apply('resizable', () => win.setResizable(true))
  apply('max-size', () => win.setMaximumSize(0, 0))
  apply('min-size', () => win.setMinimumSize(420, 350))
  apply('always-on-top', () => win.setAlwaysOnTop(true, 'screen-saver'))
  reportBreadcrumb('regular-window resize unlocked', 'debug')
}

function prepareRegularWindow(win: BrowserWindow, unlocked: { value: boolean }): void {
  if (win.isDestroyed()) return
  if (!unlocked.value) {
    unlocked.value = true
    unlockRegularWindow(win)
  }
  try {
    win.setIgnoreMouseEvents(false)
    win.moveTop()
  } catch {
    // The window may be closing during a show/hide race.
  }
}

/** Native Wayland has no electron-overlay-window tracker: use the compositor's
 *  foreign-toplevel data for focus and game reactivation only. */
function nativeRegularWindowBackend(): Backend {
  let win: BrowserWindow | null = null
  const unlocked = { value: false }

  const tracker: WindowTracker = {
    events: { on: () => {} },
    get targetBounds() {
      return win && !win.isDestroyed() ? win.getBounds() : { x: 0, y: 0, width: 0, height: 0 }
    },
    get targetHasFocus() {
      return Boolean(win && !win.isDestroyed() && BrowserWindow.getFocusedWindow() === win)
    },
    gameBounds: () => null,
    attach: () => {},
    setTargetTitles: () => {},
    focusTarget: () => {
      activateWaylandGame()
    },
    activateOverlay: () => {
      if (win && !win.isDestroyed()) win.focus()
    },
    focusOverlay: (target) => {
      if (target && !target.isDestroyed()) target.focus()
    },
    inputAllowed: () => Boolean(readWaylandGameFocus()?.game || tracker.targetHasFocus),
    overlayWindowOptions: regularWindowOptions,
    adoptOverlay: (target) => {
      win = target
    },
    setInputRects: () => {},
    beforeOverlayShow: (target) => prepareRegularWindow(target, unlocked),
  }

  return {
    traits: { compositorFocus: false, windowLocal: true },
    capture: {
      captureGame: async (): Promise<CaptureResult> => ({ frame: null, failure: 'geometry' }),
      gameWindowSource: async () => null,
    },
    cursor: {
      screenPoint: () => screen.getCursorScreenPoint(),
      trackerPoint: () => null,
      warpTo: () => {},
    },
    windowTracker: tracker,
  }
}

/** X11/XWayland keeps the native tracker for game focus and geometry, but the
 *  window itself is a normal focusable toplevel rather than a click-through
 *  overlay surface. */
function x11RegularWindowBackend(): Backend {
  const base = createOverlayWindowBackend('x11')
  const unlocked = { value: false }
  let win: BrowserWindow | null = null
  // Keep the base tracker on the prototype: `targetBounds`/`targetHasFocus` are
  // live getters, and spreading them would freeze stale values at construction.
  const windowTracker: WindowTracker = Object.create(base.windowTracker)
  windowTracker.overlayWindowOptions = regularWindowOptions
  // Start the tracker for game focus without a window: the controller then
  // never moves or hides this window to follow the game.
  windowTracker.attach = (_target, titles) => OverlayController.attachByTitles(undefined, titles)
  windowTracker.adoptOverlay = (target) => {
    win = target
  }
  // The native tracker knows no overlay window, so it cannot focus one.
  windowTracker.activateOverlay = () => {
    if (win && !win.isDestroyed()) win.focus()
  }
  windowTracker.beforeOverlayShow = (target) => prepareRegularWindow(target, unlocked)
  return { ...base, traits: { ...base.traits, windowLocal: true }, windowTracker }
}

/**
 * Native-Wayland regular-window mode still needs the compositor host for the
 * data-control clipboard and toplevel activation. Register only the compositor
 * clipboard — not NativeOverlayServices — so keyboard input keeps using the
 * external ydotool/wtype path and no layer-shell surface is created.
 */
export function initLinuxRegularWindowSupport(): boolean {
  if (!isNativeWayland(currentEnv().argv)) return false
  if (nativeOverlayActive()) return true
  if (!WaylandHost.start()) return false
  registerCompositorClipboard(waylandClipboard)
  return true
}

/** Regular floating window mode. Additive: it never changes X11 or layer-shell
 *  wiring; it only supplies a different Backend to the shared facade. */
export function createRegularWindowBackend(): Backend {
  return isNativeWayland(currentEnv().argv) ? nativeRegularWindowBackend() : x11RegularWindowBackend()
}

/** @internal For tests and diagnostics: width of the side-by-side layout. */
export const regularWindowLayoutWidth = (): number =>
  REGULAR_WINDOW_PANEL_MARGIN + REGULAR_WINDOW_PANEL_WIDTH + REGULAR_WINDOW_SISTER_GAP + REGULAR_WINDOW_SISTER_WIDTH
