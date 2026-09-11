import { desktop } from '../desktop'

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

/** Cursor in game CSS px. Bounds and cursor come from the same desktop
 * coordinate system; no feature code calls Windows-only conversion APIs. */
export function getGameCursorPosition(): CursorPoint | null {
  try {
    const bounds = desktop.getGameBounds()
    const cursor = desktop.getCursorScreenPoint()
    return bounds && cursor ? toGameCursor(cursor, bounds, bounds) : null
  } catch (err) {
    if (process.env.SCALPEL_DEBUG_LOG) console.error('[screen-capture] cursor read failed', err)
    return null
  }
}
