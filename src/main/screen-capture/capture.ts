import { getGameTitleForVariant, type CaptureFrame, type CaptureOptions, type CaptureResult } from '@scalpel/platform'
import { desktop } from '../desktop'
import { getPoeVersion } from '../game-state'

export type { CaptureFailure, CaptureFrame, CaptureOptions, CaptureResult } from '@scalpel/platform'

/** Capture the focused game window as a BGRA frame cropped to the window rect.
 *  Null when the game isn't focused or no usable frame is available; use
 *  captureGameWindowResult when you need to know which. */
export async function captureGameWindow(opts?: CaptureOptions): Promise<CaptureFrame | null> {
  return (await captureGameWindowResult(opts)).frame
}

export async function captureGameWindowResult(opts?: CaptureOptions): Promise<CaptureResult> {
  return desktop.captureGame({ ...opts, title: getGameTitleForVariant(getPoeVersion()) })
}
