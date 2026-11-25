/** Live PoE windowing-mode detection owned by native trackers.
 *
 *  The settings view still uses the compositor-backed `detectPlatformGameMode`
 *  probe; this module only stores the last reliable answer pushed by a tracker
 *  so diagnostics and future notices can show it without another probe. */
import { reportBreadcrumb } from '../../common/diagnostics'

export type LinuxGameDisplayMode = 'x11' | 'wayland'
export type LinuxGameDisplayModeSource = 'x11-geometry' | 'umbriel' | 'hyprland' | 'sway' | 'niri'
export type LinuxGameDisplayModePreference = 'auto' | 'detect' | LinuxGameDisplayMode

export interface LinuxGameDisplayModeStatus {
  mode: LinuxGameDisplayMode | null
  detected: LinuxGameDisplayMode | null
  source: LinuxGameDisplayModeSource | null
  override: LinuxGameDisplayModePreference
}

let detected: LinuxGameDisplayMode | null = null
let source: LinuxGameDisplayModeSource | null = null
let override: LinuxGameDisplayModePreference = 'auto'
const listeners = new Set<(status: LinuxGameDisplayModeStatus) => void>()

export function toLinuxGameDisplayModePreference(value: unknown): LinuxGameDisplayModePreference {
  return value === 'x11' || value === 'wayland' || value === 'detect' ? value : 'auto'
}

export function getLinuxGameDisplayModeStatus(): LinuxGameDisplayModeStatus {
  return {
    mode: override === 'auto' || override === 'detect' ? detected : override,
    detected,
    source,
    override,
  }
}

function publish(): LinuxGameDisplayModeStatus {
  const status = getLinuxGameDisplayModeStatus()
  for (const listener of listeners) {
    try {
      listener(status)
    } catch {
      // One listener must not break the others.
    }
  }
  return status
}

export function reportLinuxGameDisplayMode(
  mode: LinuxGameDisplayMode,
  detectedSource: LinuxGameDisplayModeSource,
): LinuxGameDisplayModeStatus {
  if (detected === mode && source === detectedSource) return getLinuxGameDisplayModeStatus()
  detected = mode
  source = detectedSource
  reportBreadcrumb(`game window mode=${mode} source=${detectedSource}`, 'debug')
  return publish()
}

export function clearLinuxGameDisplayMode(): LinuxGameDisplayModeStatus {
  if (detected === null && source === null) return getLinuxGameDisplayModeStatus()
  detected = null
  source = null
  return publish()
}

export function setLinuxGameDisplayModeOverride(value: unknown): LinuxGameDisplayModeStatus {
  const next = toLinuxGameDisplayModePreference(value)
  if (override === next) return getLinuxGameDisplayModeStatus()
  override = next
  reportBreadcrumb(`[linux/game-mode] override=${override}`, 'debug')
  return publish()
}

export function onLinuxGameDisplayModeStatus(listener: (status: LinuxGameDisplayModeStatus) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** @internal Test-only reset. */
export function __resetLinuxGameDisplayModeForTests(): void {
  detected = null
  source = null
  override = 'auto'
  listeners.clear()
}
