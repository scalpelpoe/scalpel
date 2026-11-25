import type { LinuxGameDisplayMode, LinuxGameDisplayModeSource } from '../game-display-mode'
import type { WindowBounds } from './window-geometry'

/**
 * Exact game-window geometry from a compositor-specific source. Generic Wayland
 * cannot expose another client's global position, so compositors that can answer
 * that question plug in here; everything else keeps the X11/foreign-toplevel
 * fallback.
 */
export type GeometryConfidence = 'focused' | 'visible' | 'hidden'

/** Preferred providers run before the X11 hook; fallback providers run only
 *  when X11 cannot see the game. */
export type GeometryProviderPhase = 'preferred' | 'fallback'

export interface WindowGeometryInfo {
  readonly bounds: WindowBounds
  /** True when the bounds are already in layer-shell logical/DIP space. */
  readonly logical: boolean
  readonly mode?: LinuxGameDisplayMode | null
  readonly fullscreen?: boolean
  readonly outputs?: readonly string[]
  /** Stable provider-side target id, used to stop switching between windows
   *  that share the same title. */
  readonly identity?: string
  readonly confidence?: GeometryConfidence
  /** Compact provider-specific trace for debug breadcrumbs only. */
  readonly detail?: string
  /** Identity strength from the shared matcher; higher means safer to pin. */
  readonly identityScore?: number
}

export interface WindowGeometryProvider {
  /** Breadcrumb identifier, e.g. `sway`. */
  readonly id: string
  /** Diagnostics source for a mode reported from this provider. */
  readonly reportSource: LinuxGameDisplayModeSource
  /** Defaults to `preferred` for existing providers. */
  readonly phase?: GeometryProviderPhase
  read(titles: readonly string[]): WindowGeometryInfo | null
}
