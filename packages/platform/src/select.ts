import { hyprlandVersionAtLeast, MIN_HYPRLAND } from './hyprland/policy'
import type { BackendId, PlatformEnv } from './types'

export function currentEnv(): PlatformEnv {
  return { platform: process.platform, env: process.env, argv: process.argv }
}

/** Picks the backend for this process. `hyprlandVersion` returns
 *  `hyprctl -j version` output and is only called inside a Hyprland session.
 *  Hyprland is selected explicitly; other Wayland compositors are not treated
 *  as compatible with its IPC protocol and keep the X11 tracker. */
export function selectBackend(env: PlatformEnv, hyprlandVersion: () => string): BackendId {
  if (env.platform === 'win32') return 'windows'
  if (env.platform === 'darwin') return 'macos'
  if (env.platform !== 'linux' || !env.env.HYPRLAND_INSTANCE_SIGNATURE) return 'x11'
  try {
    if (hyprlandVersionAtLeast(hyprlandVersion())) return 'hyprland'
    console.warn(`[hyprland] older than ${MIN_HYPRLAND.join('.')}; using the X11 overlay tracker`)
  } catch (error) {
    console.warn('[hyprland] version query failed; using the X11 overlay tracker:', String(error))
  }
  return 'x11'
}
