import type { HostFeatures, LayerTracker, TrackerEvent } from 'electron-overlay-window'
import type { ConcreteLinuxDesktopPreference } from '../../linux-settings'
import type { LinuxDesktopDefaults } from '../../settings-rules'
import type { CompositorWindowInfo, PlatformEnv } from '../../../types'
import type { NativeOverlayFeatures, NativeOverlayInput } from '../native-overlay'
import type { WindowGeometryProvider } from '../wayland/geometry-provider'
import type { LinuxLayerShellReasonKey } from './support'

/** A desktop-specific probe failure, rendered as a notice under the selector. */
export interface LayerShellProbeFailure {
  readonly reasonKey: LinuxLayerShellReasonKey
  readonly reason: string
}

/** Everything a layer-shell tracker may need, supplied by the shared backend. */
export interface LayerShellTrackerContext {
  readonly titles: string[]
  readonly emit: (event: TrackerEvent) => void
  /** Compositor geometry sources resolved for this desktop. */
  readonly geometryProviders: readonly WindowGeometryProvider[]
}

/**
 * Per-desktop layer-shell integration.
 *
 * All members are optional/superseding hooks: a desktop that exposes the
 * generic wlr protocols needs none of them, and the shared backend keeps its
 * default behavior. Anything KWin-shaped (scripting tracker, ydotool input,
 * ydotoold probe requirement) lives in `linux/desktops/kde-plasma/`.
 */
export interface LayerShellIntegration {
  /** Backend id reported through `NativeOverlayServices` and diagnostics. */
  readonly backendId: 'layer-shell' | 'kwin-layer-shell'
  /** True when this desktop feeds the shared focus cache itself. The generic
   *  zwlr foreign-toplevel reader is then not started at boot. */
  readonly claimsFocusCache?: boolean
  /** False when the desktop publishes focus through its own adapter and must
   *  not also consume layer-surface focus events. Defaults to true. */
  readonly tracksLayerSurfaceFocus?: boolean
  /** Desktop-specific capability requirements. When present it replaces the
   *  generic foreign-toplevel/data-control checks. */
  requirements?(features: HostFeatures, context: { keyboardAvailable?: boolean }): LayerShellProbeFailure | null
  /** Claim the shared focus cache before the tracker exists. */
  claimFocusSource?(): void
  /** Release the claim during rollback. */
  releaseFocusSource?(): void
  /** Build the source of truth for attach, focus and exact geometry. */
  createTracker?(context: LayerShellTrackerContext): LayerTracker
  /** Overrides applied on top of the generic native input implementation. */
  input?(base: NativeOverlayInput): NativeOverlayInput
  /** True while the game, not an overlay surface, owns keyboard focus. */
  gameHasKeyboardFocus?(): boolean
  /** Overrides applied on top of the generic capability flags. */
  features?(base: NativeOverlayFeatures): NativeOverlayFeatures
  /** Stop tracker-specific listeners. Called on rollback and app quit. */
  stop?(): void
}

/** A desktop adapter: shared backends ask for it instead of naming a desktop. */
export interface LinuxDesktopAdapter {
  /** Resolved desktop id; undefined for the generic adapter. */
  readonly desktop?: ConcreteLinuxDesktopPreference
  /** Exact window geometry sources contributed by this desktop. */
  geometryProviders?(): readonly WindowGeometryProvider[]
  /** Auto-default values contributed by this desktop. Explicit choices win. */
  defaults?: LinuxDesktopDefaults
  /** Compositor-backed game display mode for the PoE warning, or null when the
   *  compositor cannot answer confidently. */
  detectGameMode?(
    titles: readonly string[],
    env: PlatformEnv,
    windows?: () => readonly CompositorWindowInfo[],
  ): 'x11' | 'wayland' | null
  /** Layer-shell hooks, when this desktop can host the native overlay. */
  readonly layerShell?: LayerShellIntegration
  /** Focus tracking for non-layer-shell modes (regular window, X11 overlay). */
  startFocusTracking?(): void
}
