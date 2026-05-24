import { join } from 'node:path'
import { BrowserWindow, screen } from 'electron'
import { OVERLAY_WINDOW_OPTS } from 'electron-overlay-window'

/** Shared transparent click-through window used by the secondary-overlay system
 *  to render snap-target ghosts during drag. Sized to the primary display's full
 *  bounds (including the taskbar region) so anchor positions near screen edges
 *  aren't clipped. One instance shared across all registered secondary overlays
 *  - only one drag is in flight at a time, so no coordination is needed.
 *
 *  The window is created+loaded lazily on first activation; from then on it's
 *  never hidden. Each "hide ghost" sends an IPC clearing the rect so the
 *  transparent window paints nothing - this avoids the Windows blank-window
 *  flash on every show/hide cycle. */

let canvasWin: BrowserWindow | null = null
let canvasShown = false

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

function applyCanvasBounds(win: BrowserWindow): void {
  // Span the union of all displays so snap ghosts and the cheat-sheet hover
  // preview are visible when PoE / a secondary overlay sits on a non-primary
  // monitor. The renderer paints fixed-position elements at screen coords and
  // translates by window.screenX/Y, so the canvas just needs to cover whatever
  // screen rect those coords could land in.
  const displays = screen.getAllDisplays()
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const d of displays) {
    minX = Math.min(minX, d.bounds.x)
    minY = Math.min(minY, d.bounds.y)
    maxX = Math.max(maxX, d.bounds.x + d.bounds.width)
    maxY = Math.max(maxY, d.bounds.y + d.bounds.height)
  }
  win.setBounds({
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  })
}

function ensureCanvasWindow(): BrowserWindow {
  if (canvasWin && !canvasWin.isDestroyed()) return canvasWin
  canvasWin = new BrowserWindow({
    ...OVERLAY_WINDOW_OPTS,
    focusable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  // 'screen-saver' lifts the canvas above PoE + taskbar + other floating
  // windows. Same level the main overlay runs at after attach.
  canvasWin.setAlwaysOnTop(true, 'screen-saver')
  applyCanvasBounds(canvasWin)
  canvasWin.setIgnoreMouseEvents(true)
  if (process.env.ELECTRON_RENDERER_URL) {
    void canvasWin.loadURL(`${process.env.ELECTRON_RENDERER_URL}/secondary-overlay-canvas.html`)
  } else {
    void canvasWin.loadFile(join(__dirname, '../renderer/secondary-overlay-canvas.html'))
  }
  return canvasWin
}

/** Pre-create the canvas so its renderer process is warm before a snap ghost
 *  is first needed. Called when a secondary overlay is first shown. */
export function prewarmSnapCanvas(): void {
  ensureCanvasWindow()
}

/** The shared canvas BrowserWindow, or null if it hasn't been created yet.
 *  Used by aroundNativeDialog to temporarily demote alwaysOnTop so native
 *  dialogs render above us. */
export function getSnapCanvasWindow(): BrowserWindow | null {
  return canvasWin && !canvasWin.isDestroyed() ? canvasWin : null
}

/** Show the snap ghost at the given rect. Pass null to clear it. */
export function setSnapGhost(rect: Rect | null): void {
  const win = ensureCanvasWindow()
  if (rect && !canvasShown) {
    // Re-apply bounds right before show: Windows can re-clamp the window when
    // it gains visibility, chopping the bottom off into the taskbar.
    applyCanvasBounds(win)
    win.show()
    canvasShown = true
  }
  win.webContents.send('secondary-overlay-canvas:snap-ghost', rect)
}

/** Send an arbitrary render IPC to the canvas. Lets cheat-sheet-specific (and
 *  future) consumers add their own visual layers (e.g. hover-preview image)
 *  without each spawning their own click-through fullscreen window. */
export function sendCanvasIpc(channel: string, payload: unknown): void {
  const win = ensureCanvasWindow()
  if (!canvasShown) {
    applyCanvasBounds(win)
    win.show()
    canvasShown = true
  }
  win.webContents.send(channel, payload)
}

/** Bring the canvas above other secondary-overlay windows in Z-order. Used by
 *  consumers (e.g. cheat-sheet hover preview) that need their content to
 *  visually overlay the dragged window. The snap ghost intentionally does NOT
 *  call this - it stays behind the dragged window so the user sees what they're
 *  positioning. */
export function moveCanvasTop(): void {
  if (canvasWin && !canvasWin.isDestroyed()) canvasWin.moveTop()
}
