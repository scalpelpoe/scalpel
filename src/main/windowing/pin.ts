import { readOverlayPinned, writeOverlayPinned } from './pin-store'
import { type OverlayState, overlays } from './state'

/** Seed userPinned from the persisted pin map. Called once per overlay at
 *  registration so a pin survives restarts without any owner-side wiring. */
export function seedUserPinned(state: OverlayState): void {
  state.userPinned = readOverlayPinned(state.spec.id)
}

function findByWebContents(wcId: number): OverlayState | null {
  for (const state of overlays.values()) {
    const win = state.win
    if (win && !win.isDestroyed() && win.webContents.id === wcId) return state
  }
  return null
}

/** Pin state for the overlay window that sent an IPC message. False when the
 *  sender is not a registered secondary overlay (main overlay, app window). */
export function getOverlayPinnedForWebContents(wcId: number): boolean {
  return findByWebContents(wcId)?.userPinned ?? false
}

/** Flip + persist the pin for the sending overlay window. No-op for
 *  non-overlay senders. */
export function setOverlayPinnedForWebContents(wcId: number, pinned: boolean): void {
  const state = findByWebContents(wcId)
  if (!state) return
  state.userPinned = pinned
  writeOverlayPinned(state.spec.id, pinned)
}
