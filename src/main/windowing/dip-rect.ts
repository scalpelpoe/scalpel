import { type BrowserWindow, screen } from 'electron'

export interface DipRect {
  x: number
  y: number
  width: number
  height: number
}

/** Convert OverlayController target bounds to DIP for BrowserWindow.setBounds.
 *
 *  `screen.screenToDipRect` is Windows-only in Electron. Calling it on Linux
 *  throws (`is not a function`) and aborts secondary-overlay show — that was
 *  why plugin Pop out did nothing on Linux. On non-Windows, electron-overlay-
 *  window already reports logical coordinates (same assumption as
 *  cheat-sheets `setBoundsToGame`).
 *  https://www.electronjs.org/docs/latest/api/screen#screenscreentodiprectwindow-rect-windows
 */
export function toDipRect(win: BrowserWindow | null, rect: DipRect): DipRect {
  if (process.platform === 'win32' && typeof screen.screenToDipRect === 'function') {
    return screen.screenToDipRect(win, rect)
  }
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}
