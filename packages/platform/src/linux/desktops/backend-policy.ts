import type { DesktopEnvironment } from '@platform/select'
import { hyprlandBackendSupported } from './hyprland/adapter'

/**
 * Desktop-specific backend policy the OS router consults after detection.
 *
 * Keeps compositor version checks out of `select.ts`: the router only asks
 * "does this detected desktop provide its own backend?".
 */
export function linuxBackendSupport(desktop: DesktopEnvironment, hyprlandVersion: () => string): 'hyprland' | null {
  if (desktop !== 'hyprland') return null
  return hyprlandBackendSupported(hyprlandVersion) ? 'hyprland' : null
}
