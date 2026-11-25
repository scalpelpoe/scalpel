import { desktopCapturer } from 'electron'
import { OverlayController, waylandNative } from 'electron-overlay-window'
import type { CaptureFailure, CaptureOptions, CaptureResult } from '../types'

const MAX_CAPTURE_HEIGHT = 1080

/** Captures the game's area of the screen through the compositor
 *  (wlr-screencopy), or else through the screen-cast portal. Target bounds
 *  are logical, so the game size is in CSS px already. Like the Hyprland
 *  capture, compositor captures include visible overlays. */
export async function captureLayerShellGame(opts?: CaptureOptions): Promise<CaptureResult> {
  if (!opts?.skipFocusGate && !OverlayController.targetHasFocus) return fail('focus')
  const tb = OverlayController.targetBounds
  if (!tb?.width || !tb.height) return fail('bounds')
  const gameSize = { width: tb.width, height: tb.height }

  try {
    if (waylandNative.canCapture()) {
      const shot = await waylandNative.capture({ x: tb.x, y: tb.y, width: tb.width, height: tb.height })
      if (!shot) return fail('error')
      return {
        frame: { data: shot.data, width: shot.width, height: shot.height, gameSize, scale: shot.width / tb.width },
      }
    }

    // The portal returns only the window the user picked in its dialog.
    const capScale = Math.min(1, MAX_CAPTURE_HEIGHT / tb.height)
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: Math.round(tb.width * capScale), height: Math.round(tb.height * capScale) },
    })
    const source = sources[0]
    if (!source) return fail('no-source')
    const img = source.thumbnail
    const { width, height } = img.getSize()
    if (width === 0 || height === 0) return fail('empty-frame')
    return { frame: { data: img.toBitmap(), width, height, gameSize, scale: width / gameSize.width } }
  } catch (err) {
    if (process.env.SCALPEL_DEBUG_LOG) console.error('[screen-capture] capture failed', err)
    return fail('error')
  }
}

function fail(failure: CaptureFailure): CaptureResult {
  if (process.env.SCALPEL_DEBUG_LOG) console.error('[screen-capture] no frame:', failure)
  return { frame: null, failure }
}
