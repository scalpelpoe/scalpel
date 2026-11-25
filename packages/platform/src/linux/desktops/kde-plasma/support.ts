import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { join } from 'node:path'
import { currentEnv, detectDesktopEnvironment } from '@platform/select'
import type { PlatformEnv } from '@platform/types'

/**
 * KWin/KDE session facts. Kept in the compositor adapter so the generic
 * probe and input code never branch on desktop strings.
 */

/** True for a KDE Plasma Wayland session. X11/XWayland sessions have working
 *  X11 focus and input, so they must not enter the native KWin path. */
export function isKWinSession(env: PlatformEnv = currentEnv()): boolean {
  if (env.platform !== 'linux' || !env.env.WAYLAND_DISPLAY) return false
  return env.env.KDE_FULL_SESSION === 'true' || detectDesktopEnvironment(env) === 'kde'
}

/** ydotoold's socket, matching the daemon's own default search order. */
export function ydotoolSocketPath(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.YDOTOOL_SOCKET) return env.YDOTOOL_SOCKET
  if (env.XDG_RUNTIME_DIR) return join(env.XDG_RUNTIME_DIR, '.ydotool_socket')
  return null
}

/** Environment for ydotool calls, with an explicit socket when one is known. */
export function ydotoolEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const socket = ydotoolSocketPath(env)
  return socket ? { ...env, YDOTOOL_SOCKET: socket } : env
}

/** KDE has no virtual-keyboard protocol; ydotool is the injection path. A
 *  binary on PATH is not enough: ydotoold must be listening and reachable. */
export function kwinKeyboardAvailable(env: PlatformEnv = currentEnv()): boolean {
  const childEnv = ydotoolEnv(env.env)
  const socket = childEnv.YDOTOOL_SOCKET
  if (!socket) return false
  try {
    if (!statSync(socket, { throwIfNoEntry: false })?.isSocket()) return false
  } catch {
    return false
  }
  return spawnSync('ydotool', ['key', '--help'], { env: childEnv, stdio: 'ignore', timeout: 500 }).status === 0
}
