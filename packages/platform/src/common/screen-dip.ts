import type { BrowserWindow, Point, Rectangle } from 'electron'

/** Converts the native overlay tracker's physical coordinates into Electron
 *  DIP. Each OS supplies its own implementation; shared mechanisms only depend
 *  on this contract. */
export interface ScreenDip {
  point(point: Point): Point
  rect(rect: Rectangle, win?: BrowserWindow | null): Rectangle
}

/** For systems where Electron exposes no conversion API: the tracker bounds
 *  are already in the coordinate space the Electron windows use. */
export const identityScreenDip: ScreenDip = {
  point: (point) => ({ x: point.x, y: point.y }),
  rect: (rect) => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height }),
}
