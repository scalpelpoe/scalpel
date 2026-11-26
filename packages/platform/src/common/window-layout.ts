/** Shared geometry for the regular floating window mode. The host and renderer
 *  must agree on these: the window has no game sidebar to dock against. */

export const REGULAR_WINDOW_PANEL_WIDTH = 540
export const REGULAR_WINDOW_PANEL_TOP = 8
export const REGULAR_WINDOW_PANEL_MARGIN = 8
export const REGULAR_WINDOW_SISTER_WIDTH = 130
export const REGULAR_WINDOW_SISTER_GAP = 6

export const REGULAR_WINDOW_WIDTH =
  REGULAR_WINDOW_PANEL_MARGIN +
  REGULAR_WINDOW_PANEL_WIDTH +
  REGULAR_WINDOW_SISTER_GAP +
  REGULAR_WINDOW_SISTER_WIDTH +
  REGULAR_WINDOW_PANEL_MARGIN

/** Initial height only; the host unlocks resizing after the first map. */
export const REGULAR_WINDOW_HEIGHT = 640
