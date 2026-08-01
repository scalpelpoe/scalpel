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
  // Hide paths that respect this flag leave the overlay visible instead of
  // hiding it when another surface opens. Currently honored by the Esc "hide
  // any visible secondary" sweep (focus.ts); other hide sites that should
  // spare a persisting overlay must check it explicitly. Set and cleared by
  // the owner (the whiteboard sets it true in passthrough, false in edit).
  // The pinned-zone overlay sets it true permanently at registration, since
  // it has no edit/passthrough mode to toggle between.
  persistOverOthers: boolean
  // User-facing pin (the Chrome header toggle): exempts the overlay from the
  // Esc hide sweep, exactly like persistOverOthers but user-owned so the two
  // never fight (the whiteboard toggles persistOverOthers by mode). Seeded
  // from the persisted pin store at registration; see windowing/pin.ts.
  userPinned: boolean
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

// Auxiliary Scalpel-owned windows that aren't registered as secondary overlays
// (the cheat-sheet hover preview, in particular). The windowing module's focus
// predicates and PoE-leave hooks need to see them, but they're owned by other
// modules - so each module injects a getter at boot.
const auxiliaryWindowGetters: Array<() => BrowserWindow | null> = []

export function registerAuxiliaryScalpelWindow(getter: () => BrowserWindow | null): () => void {
  auxiliaryWindowGetters.push(getter)
  return () => {
    const i = auxiliaryWindowGetters.indexOf(getter)
    if (i >= 0) auxiliaryWindowGetters.splice(i, 1)
  }
}

export function getAuxiliaryScalpelWindows(): BrowserWindow[] {
  const result: BrowserWindow[] = []
  for (const get of auxiliaryWindowGetters) {
    const w = get()
    if (w && !w.isDestroyed()) result.push(w)
  }
  return result
}

// Fired when PoE blurs (user alt-tabs out) or detaches (PoE exits). Lets
// modules with their own non-overlay-registered windows participate in the
// cleanup paths (clear content, hide image, etc.) without focus.ts having to
// import them.
const poeLeaveHooks: Array<() => void> = []

export function registerOnPoeLeave(cb: () => void): () => void {
  poeLeaveHooks.push(cb)
  return () => {
    const i = poeLeaveHooks.indexOf(cb)
    if (i >= 0) poeLeaveHooks.splice(i, 1)
  }
}

export function firePoeLeaveHooks(): void {
  for (const cb of poeLeaveHooks) {
    try {
      cb()
    } catch {
      // hooks must not break alt-tab/exit cleanup for siblings
    }
  }
}
