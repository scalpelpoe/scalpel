import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  explicitLinuxDisplayMode,
  ozoneArgsForMode,
  ozoneModeFromArgs,
  toLinuxDisplayMode,
} from './linux/common/display'
import { linuxBackendSupport } from './linux/desktops/backend-policy'
import type { BackendId, PlatformEnv, RuntimeDesktop } from './types'

export type OperatingSystem = 'windows' | 'macos' | 'linux' | 'unknown'

/** Desktop environments and session types detected on Linux. Compositor sockets
 *  win over the desktop name, a named desktop wins over the session type, and
 *  `wayland`/`x11` are the generic fallbacks. */
export type DesktopEnvironment =
  | 'hyprland'
  | 'kde'
  | 'niri'
  | 'sway'
  | 'umbriel'
  | 'gnome'
  | 'xfce'
  | 'wayland'
  | 'x11'
  | 'unknown'

export function currentEnv(): PlatformEnv {
  return {
    platform: process.platform,
    env: process.env,
    argv: process.argv,
    runtimeDesktop: detectRuntimeDesktop(process.env),
  }
}

/** Runtime fallbacks for sessions that do not set XDG_CURRENT_DESKTOP, or set
 *  it to a generic value. Injected so detection stays deterministic in tests. */
export interface RuntimeDesktopProbe {
  /** True when the compositor's control socket exists in XDG_RUNTIME_DIR. */
  socket(kind: Exclude<RuntimeDesktop, 'umbriel'>, env: NodeJS.ProcessEnv): boolean
  /** True when the Umbriel control CLI reaches a running compositor. It has no
   *  discoverable socket name, so the CLI answering is the proof. */
  umbrielRunning(env: NodeJS.ProcessEnv): boolean
}

function runtimeEntries(env: NodeJS.ProcessEnv): string[] {
  const dir = env.XDG_RUNTIME_DIR
  if (!dir) return []
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

const defaultRuntimeProbe: RuntimeDesktopProbe = {
  socket(kind, env) {
    const dir = env.XDG_RUNTIME_DIR
    if (!dir) return false
    const entries = runtimeEntries(env)
    if (kind === 'niri') return entries.some((name) => /^niri\.wayland-.*\.sock$/.test(name))
    if (kind === 'sway') return entries.some((name) => /^sway-ipc\..*\.sock$/.test(name))
    // Hyprland keeps its socket in `hypr/<instance-signature>/.socket.sock`.
    const signature = env.HYPRLAND_INSTANCE_SIGNATURE
    if (signature) return existsSync(join(dir, 'hypr', signature, '.socket.sock'))
    try {
      return readdirSync(join(dir, 'hypr')).some((name) => existsSync(join(dir, 'hypr', name, '.socket.sock')))
    } catch {
      return false
    }
  },
  umbrielRunning(env) {
    try {
      execFileSync('umbriel', ['windows', '--json'], {
        timeout: 750,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        env,
      })
      return true
    } catch {
      return false
    }
  },
}

let runtimeCache: { dir: string; value: RuntimeDesktop | null } | null = null

/** Compositor proven by runtime facts rather than environment names. Probing
 *  is stable for the process lifetime, so the result is cached per runtime dir. */
export function detectRuntimeDesktop(env: NodeJS.ProcessEnv = process.env): RuntimeDesktop | null {
  const dir = env.XDG_RUNTIME_DIR ?? ''
  if (runtimeCache?.dir === dir) return runtimeCache.value
  const value = probeRuntimeDesktop(env, defaultRuntimeProbe)
  runtimeCache = { dir, value }
  return value
}

/** Socket order matters when leftovers linger: the specific compositor beats
 *  the Umbriel CLI, which only answers when its compositor is running.
 *  @internal Exported for tests. */
export function probeRuntimeDesktop(env: NodeJS.ProcessEnv, probe: RuntimeDesktopProbe): RuntimeDesktop | null {
  if (probe.socket('niri', env)) return 'niri'
  if (probe.socket('sway', env)) return 'sway'
  if (probe.socket('hyprland', env)) return 'hyprland'
  if (probe.umbrielRunning(env)) return 'umbriel'
  return null
}

/** @internal Test-only reset. */
export function __resetRuntimeDesktopCacheForTests(): void {
  runtimeCache = null
}

export function detectOperatingSystem(env: PlatformEnv): OperatingSystem {
  if (env.platform === 'win32') return 'windows'
  if (env.platform === 'darwin') return 'macos'
  if (env.platform === 'linux') return 'linux'
  return 'unknown'
}

/** Detection prefers compositor proof (socket env vars, then runtime sockets
 *  and the Umbriel CLI) over desktop names, because XDG_CURRENT_DESKTOP is
 *  frequently unset or generic. Backend selection still verifies a compositor
 *  before choosing its backend. */
export function detectDesktopEnvironment(env: PlatformEnv): DesktopEnvironment {
  if (detectOperatingSystem(env) !== 'linux') return 'unknown'
  if (env.env.HYPRLAND_INSTANCE_SIGNATURE) return 'hyprland'
  if (env.env.NIRI_SOCKET) return 'niri'
  if (env.env.SWAYSOCK) return 'sway'
  if (env.runtimeDesktop) return env.runtimeDesktop

  const names = [env.env.XDG_CURRENT_DESKTOP, env.env.XDG_SESSION_DESKTOP, env.env.DESKTOP_SESSION]
    .filter((name): name is string => !!name)
    .join(':')
    .toLowerCase()
  if (names.includes('kde') || names.includes('plasma')) return 'kde'
  // Plasma marks its session even when the XDG names are generic.
  if (env.env.KDE_FULL_SESSION === 'true' || env.env.KDE_SESSION_VERSION) return 'kde'
  if (names.includes('niri')) return 'niri'
  if (names.includes('sway')) return 'sway'
  if (names.includes('umbriel')) return 'umbriel'
  if (names.includes('hyprland')) return 'hyprland'
  if (names.includes('gnome')) return 'gnome'
  if (names.includes('xfce')) return 'xfce'
  if (env.env.WAYLAND_DISPLAY) return 'wayland'
  if (env.env.DISPLAY) return 'x11'
  return 'unknown'
}

/** Arguments to relaunch Electron with before any window exists, or null to
 *  keep this process. A real `--ozone-platform=` flag is authoritative; an
 *  app-managed flag from a previous relaunch is not, so a saved preference can
 *  still change the mode. The caller marks managed relaunches via
 *  `MANAGED_OZONE_ENV`. */
export function relaunchArgs(env: PlatformEnv, savedMode?: unknown): string[] | null {
  if (detectOperatingSystem(env) !== 'linux' || !env.env.WAYLAND_DISPLAY) return null
  if (explicitLinuxDisplayMode(env.argv, env.env)) return null

  const desired = toLinuxDisplayMode(savedMode)
  if (ozoneModeFromArgs(env.argv) === desired) return null
  return ozoneArgsForMode(env.argv.slice(1), desired)
}

/** Picks the backend for this process. `hyprlandVersion` returns
 *  `hyprctl -j version` output and is only called inside a Hyprland session.
 *  Desktop-specific gates (for example Hyprland's minimum release) live behind
 *  the desktop registry; everything else keeps the X11 tracker. */
export function selectBackend(
  env: PlatformEnv,
  hyprlandVersion: () => string,
): Exclude<BackendId, 'layer-shell' | 'kwin-layer-shell' | 'window'> {
  const os = detectOperatingSystem(env)
  if (os === 'windows') return 'windows'
  if (os === 'macos') return 'macos'
  if (os !== 'linux') return 'x11'
  return linuxBackendSupport(detectDesktopEnvironment(env), hyprlandVersion) ?? 'x11'
}
