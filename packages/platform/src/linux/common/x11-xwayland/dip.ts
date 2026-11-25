import { screen } from 'electron'
import type { ScreenDip } from '../../../common/screen-dip'

/** Electron 32 exposes neither screenToDipPoint nor screenToDipRect on Linux.
 *  Match electron-overlay-window's native tracker by dividing by the display's
 *  scale factor, so secondary windows and capture crops agree with the overlay. */
function scaleFactorAt(point: { x: number; y: number }): number {
  return screen.getDisplayNearestPoint(point).scaleFactor || 1
}

export const x11ScreenDip: ScreenDip = {
  point: (point) => {
    const factor = scaleFactorAt(point)
    return { x: Math.round(point.x / factor), y: Math.round(point.y / factor) }
  },
  rect: (rect) => {
    const factor = scaleFactorAt({ x: rect.x, y: rect.y })
    return {
      x: Math.round(rect.x / factor),
      y: Math.round(rect.y / factor),
      width: Math.round(rect.width / factor),
      height: Math.round(rect.height / factor),
    }
  },
}
