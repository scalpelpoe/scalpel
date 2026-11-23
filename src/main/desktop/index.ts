import type { BrowserWindow } from 'electron'
import { type CaptureOptions, type CaptureResult, platform } from '@scalpel/platform'

export type OverlayInteraction = 'dialog' | 'panel' | 'passthrough'

let activeDialog: BrowserWindow | null = null

/** All screen geometry crossing the feature/backend boundary is Electron DIP.
 * Physical pixels stay inside the capture implementations and native tracker. */
export function getGameBounds(win: BrowserWindow | null = null): Electron.Rectangle | null {
  return platform().windowTracker.gameBounds(win)
}

/** One overlay policy shared by menus, annotations, evaluation and plugins.
 * OS work goes through `@scalpel/platform`. */
export const desktop = {
  getGameBounds,
  hasInteractiveDialog(): boolean {
    return !!activeDialog && !activeDialog.isDestroyed() && activeDialog.isVisible()
  },
  getCursorScreenPoint(): Electron.Point | null {
    try {
      return platform().cursor.screenPoint()
    } catch {
      return null
    }
  },
  warpCursorTo(point: Electron.Point): void {
    if (![point.x, point.y].every(Number.isFinite)) return
    platform().cursor.warpTo(point)
  },
  captureGame(opts?: CaptureOptions): Promise<CaptureResult> {
    return platform().capture.captureGame(opts)
  },
  focusOverlay(win: BrowserWindow): void {
    if (win.isDestroyed() || !win.isVisible()) return
    platform().windowTracker.focusOverlay(win)
  },
  focusGame(): void {
    const { windowTracker } = platform()
    if (!windowTracker.inputAllowed()) return
    try {
      windowTracker.focusTarget()
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
