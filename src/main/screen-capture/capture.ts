import { desktopCapturer, screen } from 'electron'
import { OverlayController } from 'electron-overlay-window'
import { hyprlandOverlayActive } from '../hyprland'
import { captureHyprlandGame } from './hyprland-capture'

/** A captured game-window frame. `data` is BGRA, row-major, (0,0) at the game
 *  window's top-left. `width`/`height` are the frame's px dimensions (downscaled
 *  from physical when the window is taller than MAX_CAPTURE_HEIGHT). `gameSize`
 *  is the full game window in CSS px; `scale` is captured-frame px per CSS px. */
export interface CaptureFrame {
  data: Buffer
  width: number
  height: number
  gameSize: { width: number; height: number }
  scale: number
}

/** Cap the captured game-window height so the synchronous toBitmap copy stays
 *  fast. toBitmap runs on the main-process event loop, and an oversized copy
 *  hitches overlay mouse handling. 1080 is a no-op at <= 1080p. */
const MAX_CAPTURE_HEIGHT = 1080

/** Which gate closed on a grab that produced nothing. Every one of these used to
 *  be an indistinguishable `null`, which is exactly why the radial backdrop's
 *  intermittent failure took a developer panel to find. */
export type CaptureFailure = 'focus' | 'bounds' | 'no-source' | 'empty-frame' | 'geometry' | 'error'

export type CaptureResult = { frame: CaptureFrame } | { frame: null; failure: CaptureFailure }

export interface CaptureOptions {
  /** Skip the "is the game the foreground window" check.
   *
   *  ONLY for callers that have already established the game had focus at the
   *  moment the user asked for something, and are now racing their own overlay's
   *  show. `OverlayController.targetHasFocus` is derived from an event stream
   *  and flickers around overlay window show/hide - see the comment on
   *  getGameCursorPosition, which dropped this same gate for this same reason
   *  after it made cursor reads "intermittently and spuriously return null".
   *
   *  The privacy invariant the gate exists for is not weakened by that: the only
   *  user of this flag is the radial backdrop, whose capture can only be reached
   *  from inside a radial open, which only happens on a hotkey that the app
   *  macro dispatch already gated on the game being the active context. The
   *  frame is grabbed because the user just pressed a key into the game, not
   *  ambiently.
   *
   *  Every other caller - panel detection's polling, the plugin capture API -
   *  is ambient and must keep the gate. */
  skipFocusGate?: boolean
}

/** Capture the focused game window as a BGRA frame cropped to the window rect.
 *  Null when the game isn't focused or no usable frame is available; use
 *  captureGameWindowResult when you need to know which. */
export async function captureGameWindow(opts?: CaptureOptions): Promise<CaptureFrame | null> {
  return (await captureGameWindowResult(opts)).frame
}

export async function captureGameWindowResult(opts?: CaptureOptions): Promise<CaptureResult> {
  if (hyprlandOverlayActive()) return captureHyprlandGame(opts)
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
