import { type BrowserWindow, screen } from 'electron'
import { OverlayController } from 'electron-overlay-window'
import { getHyprlandGameBounds, hyprlandOverlayActive } from '../hyprland'

/** screenToDipRect is Windows-only. Hyprland already supplies the exact DIP
 * rectangle used by the main overlay, including mixed monitor scaling. */
export function gameDipBounds(win: BrowserWindow | null): Electron.Rectangle | null {
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
