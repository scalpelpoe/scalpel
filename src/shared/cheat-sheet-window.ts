/** Footprint the cheat-sheets overlay shrinks to when minimized: a header-
 *  only strip in the bottom-right corner of its previous bounds. Shared so
 *  the main process (animation target + setMinimumSize floor) and the
 *  renderer (icon switching threshold) agree on what "collapsed" means. */
export const CHEAT_SHEET_MINIMIZED_WIDTH = 220
export const CHEAT_SHEET_MINIMIZED_HEIGHT = 34

/** Pixel slack added to the minimized height when deciding whether the
 *  window is "currently at the minimized footprint". Absorbs OS chrome
 *  jitter, DPI rounding, and the in-flight animation's partial frames. */
export const CHEAT_SHEET_MINIMIZED_SLACK = 4

/** A screen rectangle in DIP. Structurally compatible with the windowing
 *  module's Rect so callers can pass window bounds straight in. */
export interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

/** Clamp `rect` so the whole window stays on `area` (a display's bounds): cap
 *  the size to the area, then pull the origin back inside so no edge spills
 *  off-screen. Used by the cheat-sheet restore path so the un-minimize tween
 *  can't animate the window off the screen - e.g. a stale pre-minimize rect
 *  saved on a monitor that has since changed resolution or been unplugged.
 *  Pure. */
export function clampRectToScreen(rect: ScreenRect, area: ScreenRect): ScreenRect {
  const width = Math.min(rect.width, area.width)
  const height = Math.min(rect.height, area.height)
  const x = Math.min(Math.max(rect.x, area.x), area.x + area.width - width)
  const y = Math.min(Math.max(rect.y, area.y), area.y + area.height - height)
  return { x, y, width, height }
}

/** Target rect for un-minimizing the cheat-sheets window: keep `size`, grow
 *  up-and-left from the current strip's bottom-right corner (the inverse of
 *  the minimize collapse, so an unmoved strip restores to its exact old
 *  bounds), then clamp fully on-screen so a strip parked near the top or
 *  left screen edge can't expand the header out of reach. Pure. */
export function restoreTargetRect(
  cur: ScreenRect,
  size: { width: number; height: number },
  area: ScreenRect,
): ScreenRect {
  return clampRectToScreen(
    { x: cur.x + cur.width - size.width, y: cur.y + cur.height - size.height, width: size.width, height: size.height },
    area,
  )
}
