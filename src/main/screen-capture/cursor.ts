import { screen } from 'electron'
import { OverlayController } from 'electron-overlay-window'

export interface CursorPoint {
  x: number
  y: number
}

/** Cursor position relative to the game window's top-left, in game CSS px.
 *  All three inputs are already DIP / CSS px. Null when the cursor is outside
 *  the window. Pure so the geometry is testable without electron. */
export function toGameCursor(
  cursorDip: CursorPoint,
  windowDip: CursorPoint,
  gameSize: { width: number; height: number },
): CursorPoint | null {
  const x = cursorDip.x - windowDip.x
  const y = cursorDip.y - windowDip.y
  if (x < 0 || y < 0 || x > gameSize.width || y > gameSize.height) return null
  return { x, y }
}

/** Read the live cursor position in game CSS px. Null when the game has no
 *  bounds yet, or the cursor is outside the game window.
 *  getCursorScreenPoint returns DIP; targetBounds is physical. screenToDipRect
 *  converts the whole rect (origin and size) to DIP in a single native call, so
 *  there's no separate scale-factor lookup to get wrong on a mixed-DPI, multi-
 *  monitor setup (unlike the getDisplayNearestPoint-based math in capture.ts,
 *  which has the same class of bug tracked separately). Win32-only API.
 *  Deliberately does not gate on targetHasFocus: captureGameWindow needs that
 *  gate because it grabs pixels off the screen and must not do so while the
 *  game isn't the focused window, but a cursor read only needs the game
 *  window's bounds, and the bounds-containment check below already covers the
 *  cursor-is-elsewhere case. The focus flag flickers around overlay window
 *  show/hide, so gating on it here caused reads to intermittently and
 *  spuriously return null. */
export function getGameCursorPosition(): CursorPoint | null {
  const tb = OverlayController.targetBounds
  if (!tb?.width || !tb.height) return null
  try {
    const windowDip = screen.screenToDipRect(null, tb)
    const gameSize = { width: windowDip.width, height: windowDip.height }
    return toGameCursor(screen.getCursorScreenPoint(), windowDip, gameSize)
  } catch (err) {
    if (process.env.SCALPEL_DEBUG_LOG) console.error('[screen-capture] cursor read failed', err)
    return null
  }
}
