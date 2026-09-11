import { desktop } from '../desktop'

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
  return desktop.captureGame(opts)
}
