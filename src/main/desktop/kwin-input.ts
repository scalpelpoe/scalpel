import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { join } from 'node:path'

export function kwinWaylandSession(): boolean {
  return (
    process.platform === 'linux' &&
    !!process.env.WAYLAND_DISPLAY &&
    (process.env.XDG_CURRENT_DESKTOP ?? '').split(':').includes('KDE')
  )
}

function ydotoolEnv(): NodeJS.ProcessEnv {
  const socket =
    process.env.YDOTOOL_SOCKET || (process.env.XDG_RUNTIME_DIR && join(process.env.XDG_RUNTIME_DIR, '.ydotool_socket'))
  return socket ? { ...process.env, YDOTOOL_SOCKET: socket } : process.env
}

export function kwinKeyboardAvailable(): boolean {
  const env = ydotoolEnv()
  try {
    if (!statSync(env.YDOTOOL_SOCKET ?? '/tmp/.ydotool_socket', { throwIfNoEntry: false })?.isSocket()) return false
  } catch {
    return false
  }
  return spawnSync('ydotool', ['key', '--help'], { env, stdio: 'ignore', timeout: 500 }).status === 0
}

export function sendKWinKey(code: number, pressed: boolean): boolean {
  const result = spawnSync('ydotool', ['key', '--key-delay=0', `${code}:${Number(pressed)}`], {
    env: ydotoolEnv(),
    stdio: 'ignore',
    timeout: 500,
  })
  return result.status === 0
}
