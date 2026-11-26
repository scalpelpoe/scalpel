import { hyprlandVersionAtLeast, MIN_HYPRLAND } from './policy'

/**
 * Version gate for the Hyprland overlay backend. Older releases lack the
 * `hyprctl eval` API it drives, so they keep the X11 tracker. Unreadable output
 * fails closed for the same reason.
 */
export function hyprlandBackendSupported(hyprlandVersion: () => string): boolean {
  try {
    if (hyprlandVersionAtLeast(hyprlandVersion())) return true
    console.warn(`[hyprland] older than ${MIN_HYPRLAND.join('.')}; using the X11 overlay tracker`)
  } catch (error) {
    console.warn('[hyprland] version query failed; using the X11 overlay tracker:', String(error))
  }
  return false
}
