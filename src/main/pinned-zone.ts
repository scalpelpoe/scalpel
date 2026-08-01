import type { OverlayAnchor } from '@shared/types'
import { forwardZoneChangesTo, sendCurrentZoneTo } from './client-log'
import { registerSecondaryOverlay, type SecondaryOverlay } from './windowing'

const DEFAULT_ANCHOR: OverlayAnchor = {
  fracX: 0,
  fracY: 0.08,
  fracW: 0.22,
  fracH: 0.001,
}

let overlay: SecondaryOverlay | null = null
let storedAnchorGetter: () => OverlayAnchor | undefined = () => undefined
let onAnchorChangedFn: ((a: OverlayAnchor) => void) | undefined
/** Tracks the user's pin setting. The renderer-driven `set-visible` path
 *  consults this so a stale match-list event can't reveal the overlay after
 *  the user has explicitly toggled pinning off. */
let pinnedEnabled = false
/** The renderer's last self-report - true when it rendered at least one
 *  matching sheet for the current (sticky) zone. This is the gateShow source
 *  of truth: a shown transparent window with no content still captures mouse
 *  input over its whole bounds (issue #464), so every show path must check
 *  this before actually revealing the window. */
let rendererVisible = false

export function registerPinnedZoneOverlay(deps: {
  storedAnchor: () => OverlayAnchor | undefined
  onAnchorChanged: (a: OverlayAnchor) => void
}): SecondaryOverlay {
  storedAnchorGetter = deps.storedAnchor
  onAnchorChangedFn = deps.onAnchorChanged
  overlay = registerSecondaryOverlay({
    id: 'pinned-zone',
    htmlEntry: 'pinned-zone.html',
    defaultAnchor: () => DEFAULT_ANCHOR,
    storedAnchor: () => storedAnchorGetter(),
    onAnchorChanged: (a) => onAnchorChangedFn?.(a),
    onFirstShow: (win) => sendCurrentZoneTo(win),
    gateShow: () => rendererVisible,
  })
  // The pinned zone map is a persistent pinned surface: Esc must never
  // dismiss it (it would stay gone until the next zone change). It hides
  // via unpinning, a no-match zone, or PoE blur - not the Esc sweep.
  overlay.setPersistOverOthers(true)
  forwardZoneChangesTo(() => overlay?.getWindow() ?? null)
  return overlay
}

export function getPinnedZoneOverlay(): SecondaryOverlay | null {
  return overlay
}

/** Called from settings-write when cheatSheets.pinned changes. */
export function applyPinnedZoneEnabled(enabled: boolean): void {
  pinnedEnabled = enabled
  if (!overlay) return
  if (enabled) {
    overlay.show()
  } else {
    overlay.hide()
  }
}

/** Called from the renderer (via IPC) when the match list changes. Forces
 *  the window hidden when no zone matches, even if the user has pin enabled.
 *  Never reveals the window when the user has pinning disabled - that intent
 *  is authoritative.
 *
 *  Uses hideKeepingRestore (not the regular hide) for the no-matches path
 *  because the hide here is content-driven, not user-driven. The regular
 *  hide clears the alt-tab restore memory; if that happens while PoE is
 *  blurred, the next refocus won't re-show the window even after the user
 *  re-enters a matching zone - the pinned-zone-only path is uniquely
 *  vulnerable because no other overlay self-hides from its renderer. */
export function setPinnedZoneRendererVisible(visible: boolean): void {
  rendererVisible = visible
  if (!overlay) return
  if (visible && !pinnedEnabled) return
  if (visible) {
    overlay.show()
  } else {
    overlay.hideKeepingRestore()
  }
}

/** Called from the renderer when its content height changes. Updates the
 *  window's height while keeping its x/y/width persisted bounds. Uses the
 *  size-only programmatic path (single setBounds, no cross-display double-
 *  apply) - the double-apply otherwise compounds the DPI conversion at 1.5x
 *  Windows scale, turning the ResizeObserver feedback into runaway growth. */
export function setPinnedZoneContentHeight(height: number): void {
  const win = overlay?.getWindow()
  if (!win || win.isDestroyed()) return
  const cur = win.getBounds()
  overlay?.setSizeProgrammatic(cur.width, Math.max(1, Math.round(height)))
}
