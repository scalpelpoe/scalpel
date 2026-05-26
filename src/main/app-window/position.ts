import { type Rectangle, screen } from 'electron'

export interface PositionRect {
  x: number
  y: number
  width: number
  height: number
}

interface WorkArea {
  x: number
  y: number
  width: number
  height: number
}

/** Height of a typical window title bar - used to check whether the user can
 *  grab and drag the window to a better spot. */
const TITLE_BAR_HEIGHT = 32

/** Minimum fraction of window area that must overlap a valid display for us to
 *  accept the stored position. Below this threshold we re-clamp. */
const MIN_OVERLAP_FRACTION = 0.15

/** Minimum visible titlebar height (px) required so the user can grab and drag
 *  the window to a better spot. */
const MIN_TITLEBAR_VISIBLE_HEIGHT = 8

/** Minimum visible titlebar width (px) required so the user can grab and drag
 *  the window to a better spot. */
const MIN_TITLEBAR_VISIBLE_WIDTH = 80

/** Return the intersection of two axis-aligned rectangles, or null if they
 *  don't overlap. */
function intersect(a: WorkArea, b: WorkArea): WorkArea | null {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  if (right <= x || bottom <= y) return null
  return { x, y, width: right - x, height: bottom - y }
}

/** Check whether a point is inside a work area. */
function containsPoint(wa: WorkArea, px: number, py: number): boolean {
  return px >= wa.x && px < wa.x + wa.width && py >= wa.y && py < wa.y + wa.height
}

/** Distance from a point to the center of a work area. */
function distToCenter(wa: WorkArea, px: number, py: number): number {
  return Math.hypot(px - (wa.x + wa.width / 2), py - (wa.y + wa.height / 2))
}

/** Wrap Electron's screen.getAllDisplays() so the pure validation function
 *  doesn't need to know about Electron. */
export function getCurrentWorkAreas(): WorkArea[] {
  return screen.getAllDisplays().map((d) => ({
    x: d.workArea.x,
    y: d.workArea.y,
    width: d.workArea.width,
    height: d.workArea.height,
  }))
}

/** Validate and clamp a stored window position so it always lands on a real
 *  display. Returns the rect to use as-is when the position is valid; otherwise
 *  returns a clamped rect on the best display.
 *
 *  This function is pure — it only does geometry and does not access Electron
 *  APIs directly. Pass workAreas from getCurrentWorkAreas() (or from a mock in
 *  tests).
 *
 *  Handles:
 *   - Removed/missing monitors (stored position lands in empty space)
 *   - Negative-coordinate monitors (secondary to the left/above primary)
 *   - Deadzones between L-shaped monitor arrangements
 *   - Partial off-screen positions (clamped back into work area) */
export function validateWindowPosition(stored: PositionRect, workAreas: WorkArea[]): { x: number; y: number } {
  if (workAreas.length === 0) return { x: stored.x, y: stored.y }

  const windowArea = stored.width * stored.height
  if (windowArea <= 0) return { x: stored.x, y: stored.y }

  // Build a rect for the titlebar region - the critical part for dragging.
  const titlebar: WorkArea = {
    x: stored.x,
    y: stored.y,
    width: stored.width,
    height: Math.min(TITLE_BAR_HEIGHT, stored.height),
  }

  // We score each display independently and keep the single best one. A window
  // straddling the seam between two adjacent displays is therefore judged by
  // whichever side it overlaps most, not the combined visible region; in the
  // rare case its titlebar is split below the threshold on every display it
  // would be re-clamped even though it's visible across the seam. Acceptable
  // since contiguous monitors keep such a window fully reachable anyway.
  let bestIntersection: WorkArea | null = null
  let bestArea = 0
  let bestTitlebarArea = 0
  let bestTitlebarWidth = 0
  let bestTitlebarHeight = 0

  for (const wa of workAreas) {
    const full = intersect(wa, { x: stored.x, y: stored.y, width: stored.width, height: stored.height })
    const tb = intersect(wa, titlebar)
    const fullArea = full ? full.width * full.height : 0
    const tbArea = tb ? tb.width * tb.height : 0
    if (fullArea > bestArea || (fullArea === bestArea && tbArea > bestTitlebarArea)) {
      bestIntersection = full
      bestArea = fullArea
      bestTitlebarArea = tbArea
      bestTitlebarWidth = tb ? tb.width : 0
      bestTitlebarHeight = tb ? tb.height : 0
    }
  }

  const overlapFraction = bestArea / windowArea
  if (
    bestIntersection &&
    overlapFraction >= MIN_OVERLAP_FRACTION &&
    bestTitlebarHeight >= MIN_TITLEBAR_VISIBLE_HEIGHT &&
    bestTitlebarWidth >= MIN_TITLEBAR_VISIBLE_WIDTH
  ) {
    return { x: stored.x, y: stored.y }
  }

  // Position is invalid - find the nearest display and clamp inside its work area.
  const centerX = stored.x + stored.width / 2
  const centerY = stored.y + stored.height / 2

  // First try: the display whose work area contains the stored center.
  for (const wa of workAreas) {
    if (containsPoint(wa, centerX, centerY)) {
      return clampToWorkArea(stored, wa)
    }
  }

  // Second try: nearest display by euclidean distance to center.
  let nearest = workAreas[0]
  let nearestDist = Infinity
  for (const wa of workAreas) {
    const d = distToCenter(wa, centerX, centerY)
    if (d < nearestDist) {
      nearest = wa
      nearestDist = d
    }
  }

  return clampToWorkArea(stored, nearest)
}

/** Clamp a window rect so it fits entirely inside a work area. Prefers keeping
 *  the top-left in-bounds; widens to max size if the window is larger than
 *  the work area. */
function clampToWorkArea(rect: PositionRect, wa: WorkArea): { x: number; y: number } {
  return {
    x: Math.max(wa.x, Math.min(rect.x, wa.x + wa.width - rect.width)),
    y: Math.max(wa.y, Math.min(rect.y, wa.y + wa.height - rect.height)),
  }
}

/**
 * Persist the app window's current bounds for restore-on-next-launch.
 * Only writes x/y -- size is managed by the onboarding/settings mode.
 */
export function persistAppWindowPosition(
  win: { getBounds(): Rectangle },
  store: { set(key: string, value: unknown): void },
): void {
  try {
    const { x, y } = win.getBounds()
    store.set('appWindowPosition', { x, y })
  } catch {
    // getBounds on a destroyed window can throw; ignore.
  }
}

/**
 * Restore a previously-persisted window position onto the given window,
 * validating against current displays. Safe to call at any time — does nothing
 * if no position is stored.
 */
export function restoreAppWindowPosition(
  win: { getBounds(): Rectangle; setPosition(x: number, y: number): void },
  store: { get(key: string): unknown },
): void {
  const saved = store.get('appWindowPosition') as { x: number; y: number } | undefined
  if (!saved) return
  const bounds = win.getBounds()
  const workAreas = getCurrentWorkAreas()
  const { x, y } = validateWindowPosition(
    { x: saved.x, y: saved.y, width: bounds.width, height: bounds.height },
    workAreas,
  )
  win.setPosition(x, y)
}
