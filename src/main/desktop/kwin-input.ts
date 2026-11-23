import { execFile, spawnSync } from 'node:child_process'
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

type KeyEvent = { code: number; pressed: boolean; tries: number }

const MAX_RELEASE_TRIES = 3
let pending: KeyEvent[] = []
let running = false

function keyArgs(batch: KeyEvent[]): string[] {
  return ['key', '--key-delay=0', ...batch.map((k) => `${k.code}:${Number(k.pressed)}`)]
}

/** One ydotool process at a time, in order; keys queued meanwhile go out
 *  together in the next one. */
function drain(): void {
  if (running || pending.length === 0) return
  const batch = pending
  pending = []
  running = true
  execFile('ydotool', keyArgs(batch), { env: ydotoolEnv(), timeout: 500 }, (error) => {
    running = false
    // A failed press is stale by the next try, but a lost release leaves the
    // key held in the game, so releases are retried ahead of newer keys.
    if (error) {
      const retry = batch.filter((k) => !k.pressed && k.tries < MAX_RELEASE_TRIES)
      pending.unshift(...retry.map((k) => ({ ...k, tries: k.tries + 1 })))
    }
    drain()
  })
}

// Keys still queued at exit would otherwise stay held in the game.
process.on('exit', () => {
  if (pending.length) spawnSync('ydotool', keyArgs(pending), { env: ydotoolEnv(), stdio: 'ignore', timeout: 500 })
})

/** Queues a key for ydotoold without blocking the main thread. */
export function sendKWinKey(code: number, pressed: boolean): void {
  pending.push({ code, pressed, tries: 1 })
  drain()
}
