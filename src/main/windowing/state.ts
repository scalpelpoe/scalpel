import type { BrowserWindow } from 'electron'

/** Per-overlay state held by the windowing system. Internal to this module -
 *  consumers use the SecondaryOverlay facade returned by registerSecondaryOverlay. */
export interface OverlayState {
  spec: import('./index').OverlaySpec
  win: BrowserWindow | null
  // Snap ghost coordination
  snapGhostActive: boolean
  inProgrammaticMove: boolean
  // Pending settle timer for programmatic setBounds (snap commit, PoE-track
  // reposition). Stored per-state so successive setBounds calls (e.g. a live
  // PoE drag firing 'moveresize' on every frame) can replace the prior timer
  // instead of letting it fire early and drop `inProgrammaticMove` while the
  // OS is still delivering synthetic move/moved events from the next call.
  programmaticSettleTimer: ReturnType<typeof setTimeout> | null
  // True between will-resize and resized. Resizing the window from the top
  // or left edges shifts the origin, firing 'move' events that would
  // otherwise look like a drag and trigger the snap ghost.
  isResizing: boolean
  // Alt-tab restore memory (PoE blur hides the window if visible; PoE focus
  // restores it from this flag).
  wasVisibleBeforeFocusLoss: boolean
}

/** All registered secondary overlays, keyed by spec.id. Shared between the
 *  registration/lifecycle code in index.ts and the focus predicates in
 *  focus.ts so both can iterate without dragging in each other's whole
 *  module surface. */
export const overlays = new Map<string, OverlayState>()

// The main overlay window lives in overlay.ts. We need to know about it so
// "is any Scalpel window focused" can include it - injected at boot to avoid
// a circular import.
let mainOverlayGetter: () => BrowserWindow | null = () => null

export function setMainOverlayGetter(get: () => BrowserWindow | null): void {
  mainOverlayGetter = get
}

export function getMainOverlay(): BrowserWindow | null {
  return mainOverlayGetter()
}

// Fired when our secondary-overlay blur handler detects focus has left every
// Scalpel surface (PoE -> overlay -> other-app). main/index.ts wires this to
// suspendHotkeys so global hotkeys don't keep firing in the destination app.
let onLeaveScalpelCb: (() => void) | null = null

export function setOnLeaveScalpel(cb: (() => void) | null): void {
  onLeaveScalpelCb = cb
}

export function fireOnLeaveScalpel(): void {
  onLeaveScalpelCb?.()
}
