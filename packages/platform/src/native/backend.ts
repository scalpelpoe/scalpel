import { type BrowserWindow, screen } from 'electron'
import { OVERLAY_WINDOW_OPTS, OverlayController } from 'electron-overlay-window'
import { controllerTracker } from '../controller'
import type { Backend, BackendId } from '../types'
import { captureElectronGame } from './capture'
import { electronGameWindowSource } from './window-source'
import { warpWindowsCursorTo } from './windows-pointer'
import { linkX11Transient } from './x11-transient'

/** Game bounds in Electron DIP from the native tracker's physical bounds. */
function gameBounds(id: BackendId, win: BrowserWindow | null): Electron.Rectangle | null {
  const tb = OverlayController.targetBounds
  if (!tb || tb.width <= 0 || tb.height <= 0) return null
  if (id === 'windows') return screen.screenToDipRect(win, tb)
  if (id !== 'x11') return { x: tb.x, y: tb.y, width: tb.width, height: tb.height }
  // Electron 32 exposes neither screenToDipPoint nor screenToDipRect on Linux.
  // Match the native overlay tracker's Linux conversion so secondary windows
  // and cursor hit testing use the same DIP rectangle as the main overlay.
  const display = screen.getDisplayNearestPoint({ x: tb.x, y: tb.y })
  const scaleFactor = display.scaleFactor || 1
  return {
    x: Math.round(tb.x / scaleFactor),
    y: Math.round(tb.y / scaleFactor),
    width: Math.round(tb.width / scaleFactor),
    height: Math.round(tb.height / scaleFactor),
  }
}

/** electron-overlay-window's native tracker with Electron capture. Cursor
 *  warping is implemented on Windows only. */
export function createNativeBackend(id: Exclude<BackendId, 'hyprland'>): Backend {
  return {
    traits: { compositorFocus: false },
    capture: { captureGame: captureElectronGame, gameWindowSource: electronGameWindowSource },
    cursor: {
      screenPoint: () => screen.getCursorScreenPoint(),
      trackerPoint: () => null,
      warpTo: (point) => {
        if (id === 'windows') warpWindowsCursorTo(point)
      },
    },
    windowTracker: controllerTracker({
      gameBounds: (win = null) => gameBounds(id, win),
      attach: (win, titles) => OverlayController.attachByTitles(win, titles),
      focusOverlay: (win) => win.focus(),
      inputAllowed: () => true,
      overlayWindowOptions: () => ({ ...OVERLAY_WINDOW_OPTS }),
      adoptOverlay: () => {},
      beforeOverlayShow: (win, gameTitle) => {
        if (id !== 'x11') return
        try {
          linkX11Transient(win.getNativeWindowHandle(), gameTitle)
        } catch {
          // Keep the overlay usable if the native X11 backend is unavailable.
        }
      },
    }),
  }
}
