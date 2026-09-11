import { type BrowserWindow, screen } from 'electron'
import { OverlayController } from 'electron-overlay-window'
import {
  focusHyprlandPanel,
  getHyprlandGameBounds,
  getHyprlandCursorDip,
  hyprlandInputAllowed,
  hyprlandOverlayActive,
  warpHyprlandCursor,
} from '../hyprland'
import { captureHyprlandGame } from '../screen-capture/hyprland-capture'
import type { CaptureOptions, CaptureResult } from '../screen-capture/capture'
import { captureElectronGame } from './electron-capture'
import { warpWindowsCursorTo } from './windows-pointer'

export type OverlayInteraction = 'dialog' | 'panel' | 'passthrough'

let activeDialog: BrowserWindow | null = null

/** All screen geometry crossing the feature/backend boundary is Electron DIP.
 * Physical pixels stay inside the capture implementations and native tracker. */
export function getGameBounds(win: BrowserWindow | null = null): Electron.Rectangle | null {
  if (hyprlandOverlayActive()) return getHyprlandGameBounds()
  const tb = OverlayController.targetBounds
  if (!tb || tb.width <= 0 || tb.height <= 0) return null
  if (process.platform === 'win32') return screen.screenToDipRect(win, tb)
  const point = screen.screenToDipPoint({ x: tb.x, y: tb.y })
  const display = screen.getDisplayNearestPoint(point)
  return {
    ...point,
    width: Math.round(tb.width / display.scaleFactor),
    height: Math.round(tb.height / display.scaleFactor),
  }
}

/** One platform boundary shared by menus, annotations, evaluation and plugins.
 * Hyprland is explicitly selected; other Wayland compositors are not silently
 * treated as compatible with Hyprland's IPC protocol. */
export const desktop = {
  getGameBounds,
  hasInteractiveDialog(): boolean {
    return !!activeDialog && !activeDialog.isDestroyed() && activeDialog.isVisible()
  },
  getCursorScreenPoint(): Electron.Point | null {
    try {
      return hyprlandOverlayActive() ? getHyprlandCursorDip() : screen.getCursorScreenPoint()
    } catch {
      return null
    }
  },
  warpCursorTo(point: Electron.Point): void {
    if (![point.x, point.y].every(Number.isFinite)) return
    if (hyprlandOverlayActive()) warpHyprlandCursor(point)
    else warpWindowsCursorTo(point)
  },
  captureGame(opts?: CaptureOptions): Promise<CaptureResult> {
    return hyprlandOverlayActive() ? captureHyprlandGame(opts) : captureElectronGame(opts)
  },
  focusOverlay(win: BrowserWindow): void {
    if (win.isDestroyed() || !win.isVisible()) return
    if (hyprlandOverlayActive()) focusHyprlandPanel(win)
    else win.focus()
  },
  focusGame(): void {
    if (hyprlandOverlayActive() && !hyprlandInputAllowed()) return
    try {
      OverlayController.focusTarget()
    } catch (error) {
      console.warn('[desktop] game focus handoff failed:', String(error))
    }
  },
  releaseOverlay(win: BrowserWindow): void {
    if (activeDialog === win) activeDialog = null
    if (!win.isDestroyed() && win.isFocused()) desktop.focusGame()
  },
  applyInteraction(win: BrowserWindow, mode: OverlayInteraction): void {
    if (win.isDestroyed()) return
    if (activeDialog === win && mode !== 'dialog') activeDialog = null
    if (mode === 'dialog') activeDialog = win
    if (mode === 'passthrough') desktop.releaseOverlay(win)
    win.setIgnoreMouseEvents(mode === 'passthrough', { forward: true })
    if (mode === 'dialog') desktop.focusOverlay(win)
  },
}
