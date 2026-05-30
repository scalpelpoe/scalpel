import { desktopCapturer, screen } from 'electron'
import { OverlayController } from 'electron-overlay-window'
import type { PanelState } from '../../shared/panel-state'
import { getPoeVersion } from '../game-state'
import { getWhiteboardOverlay } from '../whiteboard'
import { PanelDetector } from './detector'
import { type BitmapView, matchPatchFuzzy, votePanels } from './match'
import { PANEL_SAMPLES } from './panel-samples'

let detector: PanelDetector | null = null
let lastPanelState: PanelState = { leftPanelOpen: false, rightPanelOpen: false }

/** Last detected panel state; returned by get-overlay-state for the initial pull. */
export function getCurrentPanelState(): PanelState {
  return lastPanelState
}

/** Cap the captured game-window height so the synchronous toBitmap copy stays
 *  bounded on high-res displays. That copy runs on the main-process event loop,
 *  so an oversized one hitches the overlay's mouse handling. 1080 preserves the
 *  reference patch size (round(h/360) = 3px, as validated in-game) and is a
 *  no-op at <= 1080p. */
const MAX_CAPTURE_HEIGHT = 1080

/** Capture the display the game is on and crop to the game-window rect, returning
 *  BGRA pixels with (0,0) at the window top-left. Null when the whiteboard (the
 *  only consumer) is hidden, the game isn't focused, or no usable frame is
 *  available. Physical-pixel assumptions are validated in-game.
 *  Pass force=true to bypass the whiteboard-visibility gate (e.g. for on-demand
 *  detection by other features); the focus and bounds checks are always enforced. */
async function captureGameWindow(force = false): Promise<BitmapView | null> {
  // The distance overlay is the only consumer; skip the expensive screen grab
  // entirely while the whiteboard is hidden so normal play never pays for it.
  if (!force && !getWhiteboardOverlay()?.isVisible()) return null
  if (!OverlayController.targetHasFocus) return null
  const tb = OverlayController.targetBounds
  if (!tb?.width || !tb.height) return null

  try {
    const display = screen.getDisplayNearestPoint({ x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 })
    const sf = display.scaleFactor
    // Downscale the request when the game window is taller than the cap, shrinking
    // the synchronous toBitmap copy. thumbnailSize is advisory, so the real scale
    // is recomputed from the returned frame below.
    const capScale = Math.min(1, MAX_CAPTURE_HEIGHT / tb.height)
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(display.size.width * sf * capScale),
        height: Math.round(display.size.height * sf * capScale),
      },
    })
    const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0]
    if (!source) return null

    const img = source.thumbnail
    const full = img.getSize()
    if (full.width === 0 || full.height === 0) return null
    const bmp = img.toBitmap() // BGRA, row-major

    // tb (targetBounds) is in physical pixels; display.bounds/size are in DIP.
    // display.bounds * scaleFactor only equals the physical origin for the primary
    // display (origin 0,0); on a secondary scaled display the DIP layout is
    // non-linear in physical space, so that product is wrong and the crop lands
    // off-frame. Convert the window origin to DIP with the per-display-aware
    // screenToDipPoint, locate it inside the display's DIP rect, then scale to the
    // thumbnail (which spans the whole display). thumbnail-px-per-DIP = full / size.
    const winDip = screen.screenToDipPoint({ x: tb.x, y: tb.y })
    const tpdX = full.width / display.size.width
    const tpdY = full.height / display.size.height
    const ox = Math.round((winDip.x - display.bounds.x) * tpdX)
    const oy = Math.round((winDip.y - display.bounds.y) * tpdY)
    // Clamp width/height to the thumbnail to absorb sub-pixel rounding at the far
    // edges (e.g. a fullscreen window flush to the display); a negative origin
    // means the window isn't on the captured display, which is a real failure.
    const w = Math.min(Math.round((tb.width / sf) * tpdX), full.width - ox)
    const h = Math.min(Math.round((tb.height / sf) * tpdY), full.height - oy)
    if (w <= 0 || h <= 0 || ox < 0 || oy < 0) return null

    const out = Buffer.allocUnsafe(w * h * 4)
    for (let y = 0; y < h; y++) {
      const srcStart = ((oy + y) * full.width + ox) * 4
      bmp.copy(out, y * w * 4, srcStart, srcStart + w * 4)
    }
    return { data: out, width: w, height: h }
  } catch (err) {
    if (process.env.SCALPEL_DEBUG_LOG) console.error('[panel-detection] capture failed', err)
    return null
  }
}

/** Start detecting panel state and pushing changes to the whiteboard renderer
 *  (the only consumer). No-op for unsupported versions (PANEL_SAMPLES null) so
 *  PoE2 incurs no cost. The capture is gated on the whiteboard being visible. */
export function startPanelDetection(): void {
  if (detector) return
  if (!PANEL_SAMPLES[getPoeVersion()]) return
  detector = new PanelDetector({
    capture: captureGameWindow,
    samples: () => PANEL_SAMPLES[getPoeVersion()],
    onChange: (state) => {
      lastPanelState = state
      const win = getWhiteboardOverlay()?.getWindow()
      if (win && !win.isDestroyed()) win.webContents.send('panel-state', state)
    },
  })
  detector.start()
}

/** One-shot panel-state detection, bypassing the whiteboard-visibility gate the
 *  continuous detector uses. Captures a single frame and fuzzy-matches the
 *  sample patches (no stabilization fingerprint - this is a cold, on-demand
 *  read). Updates and returns lastPanelState; returns the previous state
 *  unchanged when samples are unavailable for the version or no frame could be
 *  captured (e.g. PoE not focused). Intended for features that need fresh panel
 *  state at a specific moment (e.g. a hotkey press) rather than continuously. */
export async function detectPanelStateOnce(): Promise<PanelState> {
  const samples = PANEL_SAMPLES[getPoeVersion()]
  if (!samples) return lastPanelState
  const frame = await captureGameWindow(true)
  if (!frame) return lastPanelState
  const matched = samples.map((s) => matchPatchFuzzy(frame, s))
  lastPanelState = votePanels(samples, matched)
  return lastPanelState
}

export function stopPanelDetection(): void {
  detector?.stop()
  detector = null
  lastPanelState = { leftPanelOpen: false, rightPanelOpen: false }
}
