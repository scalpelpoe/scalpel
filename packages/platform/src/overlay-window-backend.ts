import { type BrowserWindow, screen } from 'electron'
import { OVERLAY_WINDOW_OPTS, OverlayController } from 'electron-overlay-window'
import { reportLinuxGameDisplayMode } from './linux/common/game-display-mode'
import { x11ScreenDip } from './linux/common/x11-xwayland/dip'
import { linkX11Transient } from './linux/common/x11-xwayland/transient'
import { windowsScreenDip } from './ms-windows/dip'
import { warpWindowsCursorTo } from './ms-windows/cursor'
import type { Backend } from './types'
import { controllerTracker } from './common/controller'
import { captureElectronGame } from './common/electron-capture'
import { electronGameWindowSource } from './common/electron-window-source'
import { identityScreenDip, type ScreenDip } from './common/screen-dip'

/** Electron-capture overlay backends: the native tracker with per-OS DIP/cursor. */
export type OverlayWindowBackendId = 'windows' | 'macos' | 'x11'

/** electron-overlay-window's native tracker with Electron capture. OS-only
 *  details are supplied by the per-OS modules so this shared backend has no
 *  platform API of its own. Cursor warping is implemented on Windows only. */
export function createOverlayWindowBackend(id: OverlayWindowBackendId): Backend {
  const dip: ScreenDip = id === 'windows' ? windowsScreenDip : id === 'x11' ? x11ScreenDip : identityScreenDip

  const windowTracker = controllerTracker({
    gameBounds: (win: BrowserWindow | null = null) => {
      const tb = OverlayController.targetBounds
      if (!tb || tb.width <= 0 || tb.height <= 0) return null
      return dip.rect(tb, win)
    },
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
  })

  if (id === 'x11') {
    // The native X11 tracker only sees X11/XWayland game windows, so an attach
    // is a reliable "game mode=x11" signal. Report it here in the platform
    // package; app code stays backend-agnostic and the state module dedupes it.
    windowTracker.events.on('attach', () => reportLinuxGameDisplayMode('x11', 'x11-geometry'))
  }

  return {
    traits: { compositorFocus: false },
    capture: {
      captureGame: (opts) => captureElectronGame(opts, dip),
      gameWindowSource: electronGameWindowSource,
    },
    cursor: {
      screenPoint: () => screen.getCursorScreenPoint(),
      trackerPoint: () => null,
      warpTo: (point) => {
        if (id === 'windows') warpWindowsCursorTo(point)
      },
    },
    windowTracker,
  }
}
