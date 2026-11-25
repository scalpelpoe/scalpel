import { screen } from 'electron'
import type { ScreenDip } from '../common/screen-dip'

/** Electron exposes its DIP conversion helpers only on Windows. */
export const windowsScreenDip: ScreenDip = {
  point: (point) => screen.screenToDipPoint(point),
  rect: (rect, win) => screen.screenToDipRect(win ?? null, rect),
}
