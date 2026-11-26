import type { PlatformWindowingMode } from '../../../common/platform-settings'
import type { LinuxDisplayMode } from '../display'
import { nativeOverlayActive, nativeOverlayBackendId } from '../native-overlay'

/** What the layer-shell implementation can currently offer. Runtime probe/host
 *  registration can make this available; until then callers get an honest
 *  unavailable default. Tests can inject a capability without OS probing. */
export interface LinuxLayerShellCapability {
  readonly available: boolean
  /** Message key explaining an unavailable host/protocol. */
  readonly reasonKey?: string
  /** Active native overlay backend id when layer-shell is available. */
  readonly backendId?: string
}

export interface LinuxWindowingFacts {
  /** Selected display preference. Auto follows this, including a pending restart. */
  readonly displayMode: LinuxDisplayMode
  /** Whether this process is actually running with native Wayland Ozone. */
  readonly nativeWayland: boolean
  readonly layerShell: LinuxLayerShellCapability
  /** Suggestion from the editable desktop map, used only by Auto. */
  readonly defaultMode?: Exclude<PlatformWindowingMode, 'auto'>
}

export type LinuxWindowingWarning = 'native-wayland-required' | 'layer-shell-unavailable'

export interface LinuxWindowingResolution {
  readonly mode: Exclude<PlatformWindowingMode, 'auto'>
  readonly warning?: LinuxWindowingWarning
  readonly reasonKey?: string
}

export function toLinuxWindowingMode(value: unknown): PlatformWindowingMode {
  return value === 'auto' || value === 'x11' || value === 'window' || value === 'layer-shell' ? value : 'auto'
}

/** Set during boot when Auto resolved to the regular-window fallback. Backend
 *  selection reads this instead of the host app branching on a backend id. */
let regularWindowMode = false

export function setLinuxRegularWindowMode(active: boolean): void {
  regularWindowMode = active
}

export function linuxRegularWindowMode(): boolean {
  return regularWindowMode
}

/** @internal Test-only reset. */
export function __resetLinuxRegularWindowModeForTests(): void {
  regularWindowMode = false
}

// Boot probes the compositor once and caches the answer here. Settings renders
// must never spawn the helper process just to draw a selector.
let probedCapability: LinuxLayerShellCapability | null = null

export function setLinuxLayerShellCapability(capability: LinuxLayerShellCapability | null): void {
  probedCapability = capability
}

/** Default capability from runtime state. The probed answer is authoritative
 *  until a backend registers; an unavailable probe is never overridden by the
 *  presence of an unrelated native overlay backend. */
export function defaultLinuxLayerShellCapability(): LinuxLayerShellCapability {
  const id = nativeOverlayBackendId()
  const registered =
    nativeOverlayActive() && (id === 'layer-shell' || id === 'kwin-layer-shell')
      ? { available: true, backendId: id ?? undefined }
      : null
  if (probedCapability?.available === false) return probedCapability
  if (probedCapability?.available) return { ...probedCapability, ...(registered ?? {}) }
  return registered ?? { available: false, reasonKey: 'settings_linux_unavailable_hint' }
}

/** @internal Test-only reset. */
export function __resetLinuxLayerShellCapabilityForTests(): void {
  probedCapability = null
}

/** Pure resolver: never probes the host, never chooses a backend implementation.
 *  It only maps a persisted preference plus injected facts to the user-visible
 *  effective mode and any warning the settings view should show. */
export function resolveLinuxWindowingMode(
  preference: PlatformWindowingMode,
  facts: LinuxWindowingFacts,
): LinuxWindowingResolution {
  const wantsWayland = facts.displayMode === 'wayland' || facts.nativeWayland
  const layerShellReady = wantsWayland && facts.layerShell.available

  if (preference === 'x11') return { mode: 'x11' }
  if (preference === 'window') return { mode: 'window' }

  if (preference === 'layer-shell') {
    if (!wantsWayland) return { mode: 'x11', warning: 'native-wayland-required' }
    if (!facts.layerShell.available) {
      return {
        mode: 'window',
        warning: 'layer-shell-unavailable',
        reasonKey: facts.layerShell.reasonKey,
      }
    }
    return { mode: 'layer-shell' }
  }

  // Auto is advisory: the desktop map supplies a suggestion, but capability
  // facts still decide what can actually be used. On native Wayland a failed
  // layer-shell host falls back to a regular window; on X11 the native overlay
  // tracker remains the default.
  if (facts.defaultMode === 'x11') return { mode: 'x11' }
  if (facts.defaultMode === 'window') return { mode: 'window' }
  if (facts.defaultMode === 'layer-shell') {
    if (wantsWayland && facts.layerShell.available) return { mode: 'layer-shell' }
    return { mode: wantsWayland ? 'window' : 'x11' }
  }
  if (layerShellReady) return { mode: 'layer-shell' }
  return { mode: wantsWayland ? 'window' : 'x11' }
}
