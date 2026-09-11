import { desktop } from './desktop'
export { warpWith } from './desktop/windows-pointer'

export function warpCursorTo(point: Electron.Point): void {
  desktop.warpCursorTo(point)
}
