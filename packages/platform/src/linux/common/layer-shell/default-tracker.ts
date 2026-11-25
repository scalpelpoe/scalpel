import type { LayerTracker, TrackerEvent } from 'electron-overlay-window'
import { WaylandHost } from 'electron-overlay-window/dist/wayland/host'
import type { WindowGeometryProvider } from '../wayland/geometry-provider'
import { WaylandWindowTracker } from '../wayland/window-tracker'

export interface DefaultLayerShellTrackerContext {
  readonly titles: string[]
  readonly emit: (event: TrackerEvent) => void
  readonly geometryProviders: readonly WindowGeometryProvider[]
}

/**
 * Tracker for desktops that expose the generic wlr protocols (foreign-toplevel
 * for attach/focus, a compositor geometry provider for exact bounds).
 *
 * The native host is started by `OverlayController.useLayerShell()`, after this
 * module's init. Read `WaylandHost.get()` when the tracker is created, never
 * cache it at init time: a cached value is null and the overlay never opens.
 */
export function createDefaultLayerShellTracker(context: DefaultLayerShellTrackerContext): LayerTracker {
  const host = WaylandHost.get()
  if (!host) throw new Error('Wayland host unavailable')
  return new WaylandWindowTracker(host, context.titles, context.emit, {
    geometryProviders: context.geometryProviders,
  })
}
