import { desktopCapturer, screen } from 'electron'
import { OverlayController } from 'electron-overlay-window'
import type { CaptureOptions, CaptureResult, CaptureFailure } from '../screen-capture/capture'

const MAX_CAPTURE_HEIGHT = 1080

export async function captureElectronGame(opts?: CaptureOptions): Promise<CaptureResult> {
  if (!opts?.skipFocusGate && !OverlayController.targetHasFocus) return fail('focus')
  const tb = OverlayController.targetBounds
  if (!tb?.width || !tb.height) return fail('bounds')

  try {
    const display = screen.getDisplayNearestPoint({ x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 })
    const sf = display.scaleFactor
    const capScale = Math.min(1, MAX_CAPTURE_HEIGHT / tb.height)
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(display.size.width * sf * capScale),
        height: Math.round(display.size.height * sf * capScale),
      },
    })
    // Windows screen sources routinely report an empty display_id, so the
    // fallback is the normal path rather than the exceptional one - which is
    // also why the only way to have no source at all is an empty list.
    const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
    if (!source) return fail('no-source')

    const img = source.thumbnail
    const full = img.getSize()
    if (full.width === 0 || full.height === 0) return fail('empty-frame')
    const bmp = img.toBitmap() // BGRA, row-major

    const winDip = screen.screenToDipPoint({ x: tb.x, y: tb.y })
    const tpdX = full.width / display.size.width
    const tpdY = full.height / display.size.height
    const ox = Math.round((winDip.x - display.bounds.x) * tpdX)
    const oy = Math.round((winDip.y - display.bounds.y) * tpdY)
    const w = Math.min(Math.round((tb.width / sf) * tpdX), full.width - ox)
    const h = Math.min(Math.round((tb.height / sf) * tpdY), full.height - oy)
    if (w <= 0 || h <= 0 || ox < 0 || oy < 0) return fail('geometry')

    const out = Buffer.allocUnsafe(w * h * 4)
    for (let y = 0; y < h; y++) {
      const srcStart = ((oy + y) * full.width + ox) * 4
      bmp.copy(out, y * w * 4, srcStart, srcStart + w * 4)
    }
    const gameSize = { width: Math.round(tb.width / sf), height: Math.round(tb.height / sf) }
    // Captured-frame px per CSS px: frame width spans the full game window's CSS
    // width. Single scalar; assumes a proportional thumbnail (tpdX == tpdY).
    const scale = w / gameSize.width
    return { frame: { data: out, width: w, height: h, gameSize, scale } }
  } catch (err) {
    if (process.env.SCALPEL_DEBUG_LOG) console.error('[screen-capture] capture failed', err)
    return fail('error')
  }
}

/** Every abandoned grab goes through here so none of them can go back to being
 *  a bare `null` with no way to tell it from the other five. */
function fail(failure: CaptureFailure): CaptureResult {
  if (process.env.SCALPEL_DEBUG_LOG) console.error('[screen-capture] no frame:', failure)
  return { frame: null, failure }
}
