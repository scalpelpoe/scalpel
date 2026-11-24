import { hyprlandVersionAtLeast, MIN_HYPRLAND } from './hyprland/policy'
import type { BackendId, PlatformEnv } from './types'

export function currentEnv(): PlatformEnv {
  return { platform: process.platform, env: process.env, argv: process.argv }
}

/** Arguments to relaunch Electron with before any window exists, or null to
 *  keep this process. Under Wayland the app becomes a native Wayland client
 *  when `layerShellSupported` says the compositor can host its overlays, and
 *  otherwise runs through XWayland, unless the user chose an Ozone platform
 *  explicitly. `layerShellSupported` is only called when relaunching. */
export function relaunchArgs(env: PlatformEnv, layerShellSupported: () => boolean): string[] | null {
  if (env.platform !== 'linux' || !env.env.WAYLAND_DISPLAY) return null
  if (env.argv.some((arg) => arg.startsWith('--ozone-platform='))) return null
  return [...env.argv.slice(1), `--ozone-platform=${layerShellSupported() ? 'wayland' : 'x11'}`]
}

/** Picks the backend for this process. A native Wayland client, which
 *  `relaunchArgs` starts on compositors with layer-shell, uses the layer-shell
 *  backend. `hyprlandVersion` returns `hyprctl -j version` output and is only
 *  called inside a Hyprland session under XWayland. Hyprland is selected
 *  explicitly; other compositors are not treated as compatible with its IPC
 *  protocol and keep the X11 tracker. */
export function selectBackend(env: PlatformEnv, hyprlandVersion: () => string): BackendId {
  if (env.platform === 'win32') return 'windows'
  if (env.platform === 'darwin') return 'macos'
  if (env.platform !== 'linux') return 'x11'
  if (env.argv.includes('--ozone-platform=wayland')) return 'layer-shell'
  if (!env.env.HYPRLAND_INSTANCE_SIGNATURE) return 'x11'
  try {
    if (hyprlandVersionAtLeast(hyprlandVersion())) return 'hyprland'
    console.warn(`[hyprland] older than ${MIN_HYPRLAND.join('.')}; using the X11 overlay tracker`)
  } catch (error) {
    console.warn('[hyprland] version query failed; using the X11 overlay tracker:', String(error))
  }
  return 'x11'
}
