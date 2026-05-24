import type { OverlayAnchor } from '../shared/types'
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
  })
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
 *  is authoritative. */
export function setPinnedZoneRendererVisible(visible: boolean): void {
  if (!overlay) return
  if (visible && !pinnedEnabled) return
  if (visible) {
    overlay.show()
  } else {
    overlay.hide()
  }
}

/** Called from the renderer when its content height changes. Updates the
 *  window's height while keeping its x/y/width persisted bounds. Uses the
 *  programmatic path so anchor-persist listeners stay quiet. */
export function setPinnedZoneContentHeight(height: number): void {
  const win = overlay?.getWindow()
  if (!win || win.isDestroyed()) return
  const cur = win.getBounds()
  overlay?.setBoundsProgrammatic({ x: cur.x, y: cur.y, width: cur.width, height: Math.max(1, Math.round(height)) })
}
