import { EventEmitter } from 'node:events'
import type { Zone } from '@shared/types'

let currentZone: Zone | null = null
// Default max listeners (10) is generous: three production subscribers today
// (client-log/index.ts -> primary overlay, cheat-sheets.ts, pinned-zone.ts)
// plus headroom. Leaving the default keeps Node's leak warning available as
// a tripwire when something forgets to unsubscribe.
const emitter = new EventEmitter()

/** Latest known zone. Null at startup only. Towns and hideouts are stored
 *  as-is; consumers that want to filter them call isTownOrHideout themselves. */
export function getCurrentZone(): Zone | null {
  return currentZone
}

/** Subscribe to zone-state changes. Fires with the new zone value on every
 *  ingest, including towns and hideouts. Returns an unsubscribe function. */
export function onZoneChanged(cb: (zone: Zone | null) => void): () => void {
  emitter.on('change', cb)
  return () => emitter.off('change', cb)
}

/** Watcher-facing entry point. Called once per parsed Client.txt
 *  "Generating level ..." line. Stores the zone verbatim and broadcasts it. */
export function ingestZoneEvent(parsed: Zone): void {
  currentZone = parsed
  emitter.emit('change', currentZone)
}

/** Vitest-only: clear singleton state + subscribers between cases. */
export function _resetForTests(): void {
  currentZone = null
  emitter.removeAllListeners()
}
