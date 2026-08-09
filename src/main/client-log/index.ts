import type { BrowserWindow } from 'electron'
import { parseClientLogLine } from './parse-client-log'
import { resolveClientLogPath } from './path-resolver'
import { hasLogLineSubscribers, pushLogLine } from './tail-buffer'
import { startWatcher } from './watcher'
import { getCurrentZone, ingestZoneEvent, onZoneChanged } from './zone-state'

let started = false
const logLineWinGetters: Array<() => BrowserWindow | null> = []
const rawLineListeners: Array<(line: string) => void> = []

/** Boot the Client.txt watcher and pipe zone changes to the overlay
 *  webContents. Idempotent (re-attach events shouldn't restart the
 *  watcher). Silent on resolve failure - the watcher just doesn't start
 *  and the toggle never renders. */
export function startClientLogWatcher(overlayWindow: BrowserWindow): void {
  if (started) return
  const path = resolveClientLogPath()
  if (!path) return
  started = true
  startWatcher(path, (line) => {
    emitLogLine(line)
    for (const cb of rawLineListeners) {
      try {
        cb(line)
      } catch (err) {
        console.error('[FilterScalpel] client-log listener failed:', err)
      }
    }
    const parsed = parseClientLogLine(line)
    if (parsed) ingestZoneEvent(parsed)
  })
  forwardZoneChangesTo(() => overlayWindow)
  forwardLogLinesTo(() => overlayWindow)
  sendCurrentZoneTo(overlayWindow)
}

/** Subscribe to every raw Client.txt line (main-process listeners). */
export function onClientLogLine(cb: (line: string) => void): () => void {
  rawLineListeners.push(cb)
  return () => {
    const i = rawLineListeners.indexOf(cb)
    if (i >= 0) rawLineListeners.splice(i, 1)
  }
}

export { getCurrentZone, onZoneChanged } from './zone-state'

/** Wire a window to receive `zone-changed` IPCs on every Client.txt zone
 *  change. The getter lets the secondary-overlay system register its forwarder
 *  before the window is lazily created on first show. Used by every overlay
 *  that reacts to the player's zone. */
export function forwardZoneChangesTo(getWin: () => BrowserWindow | null): void {
  onZoneChanged((zone) => {
    const win = getWin()
    if (!win || win.isDestroyed()) return
    win.webContents.send('zone-changed', zone)
  })
}

/** Send the current zone to a window once. Pair with `onFirstShow` so the
 *  renderer reflects state immediately rather than waiting for the next
 *  Client.txt event. */
export function sendCurrentZoneTo(win: BrowserWindow): void {
  if (!win.isDestroyed()) win.webContents.send('zone-changed', getCurrentZone())
}

/** Wire a window to receive `client-log:line` IPCs for every raw Client.txt
 *  line, gated on at least one active subscriber (see tail-buffer ref-count).
 *  Mirrors forwardZoneChangesTo. */
export function forwardLogLinesTo(getWin: () => BrowserWindow | null): void {
  logLineWinGetters.push(getWin)
}

function emitLogLine(line: string): void {
  pushLogLine(line)
  if (!hasLogLineSubscribers()) return
  for (const getWin of logLineWinGetters) {
    const win = getWin()
    if (!win || win.isDestroyed()) continue
    win.webContents.send('client-log:line', line)
  }
}

/** Test-only: reset the started guard and clear log-line forwarders so each
 *  test re-arms the watcher callback and starts from a clean getter list. */
export function _resetForTests(): void {
  started = false
  logLineWinGetters.length = 0
  rawLineListeners.length = 0
}
