import type { BrowserWindow } from 'electron'
import { parseClientLogLine } from './parse-client-log'
import { resolveClientLogPath } from './path-resolver'
import { startWatcher } from './watcher'
import { getCurrentZone, ingestZoneEvent, onZoneChanged } from './zone-state'

let started = false

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
    const parsed = parseClientLogLine(line)
    if (parsed) ingestZoneEvent(parsed)
  })
  forwardZoneChangesTo(() => overlayWindow)
  sendCurrentZoneTo(overlayWindow)
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
