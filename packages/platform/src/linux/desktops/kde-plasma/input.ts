import { execFile, spawnSync } from 'node:child_process'
import { reportDiagnostic } from '@platform/common/diagnostics'
import { ydotoolEnv } from './support'

/**
 * KWin keyboard injection through ydotoold.
 *
 * KDE exposes no virtual-keyboard protocol, so the layer-shell adapter uses
 * ydotool for every synthetic key. Events are queued in order and sent one
 * process at a time: games coalesce keys from a single batch and can miss a
 * modifier press, and a lost release would leave a key held forever.
 */

interface KeyEvent {
  code: number
  pressed: boolean
  tries: number
}

const MAX_RELEASE_TRIES = 3
/** Space between separate ydotool calls so the compositor and game register
 *  each event in order. */
const KEY_EVENT_SPACING_MS = 8
const COMBO_EVENT_SPACING_MS = 25

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

let pending: KeyEvent[] = []
let running = false
let exitHookInstalled = false

function keyArgs(events: readonly KeyEvent[]): string[] {
  return ['key', '--key-delay=0', ...events.map((event) => `${event.code}:${Number(event.pressed)}`)]
}

function drain(): void {
  if (running || pending.length === 0) return
  const event = pending.shift()
  if (!event) return
  running = true
  execFile('ydotool', keyArgs([event]), { env: ydotoolEnv(), timeout: 500 }, (error) => {
    running = false
    // A failed press is stale by the next try, but a lost release leaves the
    // key held in the game, so releases are retried ahead of newer keys.
    if (error) {
      reportDiagnostic('kwin-input', error)
      if (!event.pressed && event.tries < MAX_RELEASE_TRIES) {
        pending.unshift({ ...event, tries: event.tries + 1 })
      }
    }
    if (pending.length === 0) return
    setTimeout(drain, KEY_EVENT_SPACING_MS)
  })
}

function installExitHook(): void {
  if (exitHookInstalled) return
  exitHookInstalled = true
  // Keys still queued at exit would otherwise stay held in the game.
  process.once('exit', () => {
    if (!pending.length) return
    spawnSync('ydotool', keyArgs(pending), { env: ydotoolEnv(), stdio: 'ignore', timeout: 500 })
  })
}

/** Queues a key for ydotoold without blocking the main thread. */
export function sendKWinKey(code: number, pressed: boolean): void {
  installExitHook()
  pending.push({ code, pressed, tries: 1 })
  drain()
}

/** Send a whole combo as one coherent sequence: modifiers first, main key last.
 *  Stale modifiers from the triggering hotkey are released first, matching the
 *  generic ydotool path. Codes are evdev keycodes. */
export async function injectKWinCombo(codes: readonly number[]): Promise<void> {
  if (codes.length === 0) return
  const key = codes[codes.length - 1]
  const modifiers = codes.slice(0, -1)
  for (const code of modifiers) {
    sendKWinKey(code, false)
    await sleep(COMBO_EVENT_SPACING_MS)
  }
  for (const code of modifiers) {
    sendKWinKey(code, true)
    await sleep(COMBO_EVENT_SPACING_MS)
  }
  sendKWinKey(key, true)
  await sleep(COMBO_EVENT_SPACING_MS)
  sendKWinKey(key, false)
  await sleep(COMBO_EVENT_SPACING_MS)
  for (const code of [...modifiers].reverse()) {
    sendKWinKey(code, false)
    await sleep(COMBO_EVENT_SPACING_MS)
  }
}

/** @internal Test-only reset. */
export function __resetKWinInputForTests(): void {
  pending = []
  running = false
}
