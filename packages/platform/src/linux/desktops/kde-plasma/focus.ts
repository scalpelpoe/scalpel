import {
  publishCompositorFocus,
  publishRecentWindow,
  setCompositorFocusSource,
} from '@platform/linux/common/wayland/focus-cache'
import { KWinSession, type KWinSnapshot, type KWinWindow } from './session'

/** The layer-shell host is Scalpel's own surface, not a foreign window. KWin
 *  reports it as active when the overlay takes keyboard focus; treating that as
 *  "focus left the game" makes the overlay hide/re-show in a loop. */
function isScalpelOverlayWindow(window: KWinWindow): boolean {
  const identities = [window.desktopFileName, window.resourceClass, window.resourceName, window.caption]
  return identities.some((value) => {
    const normalized = value.trim().toLowerCase()
    return normalized === 'overlay-wayland-host' || normalized.startsWith('scalpel overlay')
  })
}

/** Publish the activated KWin window into the shared Wayland focus cache, so
 *  hotkey gating, lifecycle arming and recent-window hints work on KDE. */
export function publishKWinFocus(snapshot: KWinSnapshot | null): void {
  if (!snapshot || snapshot.active === null) {
    publishCompositorFocus(null)
    return
  }
  const active = snapshot.windows.find((window) => window.id === snapshot.active) ?? null
  // Keep the previous game focus while our own overlay surface is active.
  if (!active || isScalpelOverlayWindow(active)) return
  const appId = active.desktopFileName || active.resourceClass || null
  publishCompositorFocus({
    title: active.caption || null,
    appId,
    className: active.resourceClass || null,
    instance: active.resourceName || null,
    source: 'kde-kwin-script',
  })
  publishRecentWindow({ title: active.caption, appId })
}

let watcher: KWinSession | null = null

/** Regular-window mode still needs compositor focus: the GlobalShortcuts portal
 *  is global and X11 cannot see the active window on KWin. */
export function startKWinFocusTracking(): void {
  if (watcher) return
  setCompositorFocusSource(true)
  watcher = new KWinSession({ onSnapshot: publishKWinFocus })
  watcher.start()
}

/** @internal Test-only reset. */
export function __resetKWinFocusTrackingForTests(): void {
  watcher = null
}
