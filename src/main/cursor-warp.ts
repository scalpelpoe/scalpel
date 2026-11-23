import { desktop } from './desktop'

export function warpCursorTo(point: Electron.Point): void {
  desktop.warpCursorTo(point)
}
