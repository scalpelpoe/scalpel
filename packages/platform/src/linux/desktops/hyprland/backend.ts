import { OVERLAY_WINDOW_OPTS, OverlayController } from 'electron-overlay-window'
import { controllerTracker } from '@platform/common/controller'
import { electronGameWindowSource } from '@platform/common/electron-window-source'
import type { Backend } from '@platform/types'
import { captureHyprlandGame } from './capture'
import {
  attachHyprlandOverlay,
  focusHyprlandPanel,
  getHyprlandCursorDip,
  getHyprlandGameBounds,
  getHyprlandPointerPhysical,
  hyprlandInputAllowed,
  nameHyprlandOverlay,
  warpHyprlandCursor,
} from './tracker'

/** Hyprland 0.56+ over XWayland: compositor IPC for game geometry, focus and
 *  the pointer, and `grim` for capture. Requires `grim` on PATH. */
export function createHyprlandBackend(): Backend {
  return {
    traits: { compositorFocus: true },
    capture: { captureGame: captureHyprlandGame, gameWindowSource: electronGameWindowSource },
    cursor: {
      screenPoint: getHyprlandCursorDip,
      trackerPoint: getHyprlandPointerPhysical,
      warpTo: warpHyprlandCursor,
    },
    windowTracker: controllerTracker({
      gameBounds: getHyprlandGameBounds,
      attach: (win, titles) => {
        win.setAlwaysOnTop(true, 'screen-saver')
        // The native tracker hides its attached window on blur and detach itself.
        const hide = () => {
          if (!win.isDestroyed()) win.hide()
        }
        OverlayController.events.on('blur', hide)
        OverlayController.events.on('detach', hide)
        attachHyprlandOverlay(win, titles)
      },
      focusOverlay: focusHyprlandPanel,
      inputAllowed: hyprlandInputAllowed,
      // XWayland utility windows float on their first map. Floating a normal
      // window later is too late to prevent Hyprland disrupting game fullscreen.
      // The title is advertised before the renderer loads the one used by the
      // user's overlay window rule.
      overlayWindowOptions: () => ({ ...OVERLAY_WINDOW_OPTS, type: 'utility', title: 'Scalpel Overlay' }),
      adoptOverlay: nameHyprlandOverlay,
      beforeOverlayShow: () => {},
    }),
  }
}
