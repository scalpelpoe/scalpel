import { createConnection, type Socket } from 'node:net'
import { join } from 'node:path'
import { getAllGameTitles, matchGameWindow } from '../../../common/game-window-identity'
import { isNativeWayland } from '../display'
import {
  clearCompositorFocus,
  compositorFocusSourceOwned,
  currentRecentWindowHints,
  currentWaylandGameFocus,
  publishCompositorFocus,
  publishRecentWindow,
  subscribeWaylandFocus,
  type WaylandGameFocus,
} from './focus-cache'

/**
 * Generic native-Wayland focus detection for portal hotkeys.
 *
 * The GlobalShortcuts portal is global: an activation says nothing about which
 * window has focus. This binds the standard zwlr foreign-toplevel protocol over
 * a plain Wayland socket and keeps the activated toplevel's title/app id in a
 * small cache. It uses no native addons, no compositor CLI, and no state files,
 * so it is safe in Electron's Node runtime and works across compositors that
 * expose the protocol. When the protocol is unavailable the cache stays empty
 * and hotkeys fall back to the existing X11/Electron focus signals.
 *
 * Compositors without that protocol (KWin) feed the same cache through their
 * own adapter; see `linux/desktops/kde-plasma`.
 */

interface Toplevel {
  title: string | null
  appId: string | null
  active: boolean
}

const DISPLAY_OBJECT = 1
const REGISTRY_OBJECT = 2
const MANAGER_INTERFACE = 'zwlr_foreign_toplevel_manager_v1'
const ACTIVATED_STATE = 2

const DISPLAY_GET_REGISTRY = 1
const REGISTRY_BIND = 0
const MANAGER_TOPLEVEL = 0
const MANAGER_FINISHED = 1
const HANDLE_TITLE = 0
const HANDLE_APP_ID = 1
const HANDLE_STATE = 4
const HANDLE_DONE = 5
const HANDLE_CLOSED = 6

let socket: Socket | null = null
let started = false
let nextObject = REGISTRY_OBJECT + 1
let managerObject: number | null = null
const toplevels = new Map<number, Toplevel>()
let publishedToplevelId: number | null = null

export type { WaylandGameFocus } from './focus-cache'

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value >>> 0, 0)
  return buffer
}

function encodeString(value: string): Buffer {
  const text = Buffer.from(`${value}\0`, 'utf8')
  const padding = Buffer.alloc((4 - (text.length % 4)) % 4)
  return Buffer.concat([u32(text.length), text, padding])
}

function encodeMessage(object: number, opcode: number, ...args: Buffer[]): Buffer {
  const body = Buffer.concat(args)
  const header = Buffer.alloc(8)
  header.writeUInt32LE(object, 0)
  header.writeUInt16LE(opcode, 4)
  header.writeUInt16LE(header.length + body.length, 6)
  return Buffer.concat([header, body])
}

function readString(frame: Buffer, offset: number): { value: string; offset: number } {
  const length = frame.readUInt32LE(offset)
  offset += 4
  const value = frame.toString('utf8', offset, offset + Math.max(0, length - 1))
  offset += length
  return { value, offset: offset + ((4 - (length % 4)) % 4) }
}

function readArray(frame: Buffer, offset: number): { value: Buffer; offset: number } {
  const length = frame.readUInt32LE(offset)
  offset += 4
  const value = frame.subarray(offset, offset + length)
  offset += length
  return { value, offset: offset + ((4 - (length % 4)) % 4) }
}

function evaluate(title: string | null, appId: string | null, titles: readonly string[]) {
  return matchGameWindow({ title, appId }, titles)
}

/** @internal Exported for unit tests and future compositor adapters. */
export function matchesWaylandGameToplevel(
  title: string | null,
  appId: string | null,
  titles: readonly string[] = getAllGameTitles(),
): boolean {
  return evaluate(title, appId, titles).accepted
}

/**
 * The activated toplevel, or null when none is activated.
 *
 * `zwlr` tracks only ordinary toplevels. When a layer-shell surface takes
 * keyboard focus (Scalpel's own overlay, a launcher, a menu), every toplevel
 * reports `activated=false`. That means "focus unknown", not "the game lost
 * focus" - treating it as a blur made the overlay hide and re-show in a loop
 * under Niri. Focus is only dropped when another toplevel activates or the
 * published toplevel closes.
 *
 * @internal Exported for unit tests.
 */
export function activatedEntry<K, V extends { active: boolean }>(items: Iterable<[K, V]>): [K, V] | null {
  for (const item of items) if (item[1].active) return item
  return null
}

/** Ordering slack between our layer surface grabbing the keyboard and the
 *  compositor deactivating the game toplevel on the zwlr connection. */
const FOCUS_CLEAR_GRACE_MS = 250

let layerSurfaceFocused = false
let pendingClear: ReturnType<typeof setTimeout> | null = null

/** Set by the layer-shell backend while one of Scalpel's own layer surfaces
 *  holds the keyboard. That is the only case where "no activated toplevel"
 *  must not be read as a game blur. */
export function setLayerSurfaceFocus(focused: boolean): void {
  if (layerSurfaceFocused === focused) return
  layerSurfaceFocused = focused
  publish()
}

function cancelPendingClear(): void {
  if (!pendingClear) return
  clearTimeout(pendingClear)
  pendingClear = null
}

function publishNoActivatedToplevel(): void {
  if (layerSurfaceFocused) {
    cancelPendingClear()
    return
  }
  if (pendingClear) return
  pendingClear = setTimeout(() => {
    pendingClear = null
    if (layerSurfaceFocused || activatedEntry(toplevels.entries())) return
    publishedToplevelId = null
    publishCompositorFocus(null)
  }, FOCUS_CLEAR_GRACE_MS)
  pendingClear.unref?.()
}

function publish(): void {
  const entry = activatedEntry(toplevels.entries())
  if (!entry) {
    publishNoActivatedToplevel()
    return
  }
  cancelPendingClear()
  const [id, active] = entry
  publishedToplevelId = id
  publishRecentWindow({ title: active.title ?? '', appId: active.appId })
  publishCompositorFocus({
    title: active.title,
    appId: active.appId,
    source: 'zwlr-foreign-toplevel-manager-v1',
  })
}

function bindManager(name: number, version: number): void {
  if (managerObject !== null) return
  managerObject = nextObject++
  socket?.write(
    encodeMessage(
      REGISTRY_OBJECT,
      REGISTRY_BIND,
      u32(name),
      encodeString(MANAGER_INTERFACE),
      u32(Math.min(version, 1)),
      u32(managerObject),
    ),
  )
}

function onMessage(frame: Buffer): void {
  if (frame.length < 8) return
  const object = frame.readUInt32LE(0)
  const opcode = frame.readUInt16LE(4)

  if (object === REGISTRY_OBJECT && opcode === REGISTRY_BIND) {
    // Registry.global uses opcode 0, the same numeric value as Registry.bind;
    // only incoming registry messages can arrive here, so that is the global.
    const name = frame.readUInt32LE(8)
    const iface = readString(frame, 12)
    if (iface.value === MANAGER_INTERFACE) bindManager(name, frame.readUInt32LE(iface.offset))
    return
  }

  if (object === managerObject) {
    if (opcode === MANAGER_TOPLEVEL) {
      const id = frame.readUInt32LE(8)
      toplevels.set(id, { title: null, appId: null, active: false })
    } else if (opcode === MANAGER_FINISHED) {
      managerObject = null
      toplevels.clear()
      publishedToplevelId = null
      cancelPendingClear()
      publishCompositorFocus(null)
    }
    return
  }

  const toplevel = toplevels.get(object)
  if (!toplevel) return
  switch (opcode) {
    case HANDLE_TITLE:
      toplevel.title = readString(frame, 8).value
      publish()
      break
    case HANDLE_APP_ID:
      toplevel.appId = readString(frame, 8).value
      publish()
      break
    case HANDLE_STATE: {
      const states = readArray(frame, 8).value
      toplevel.active = false
      for (let offset = 0; offset + 4 <= states.length; offset += 4) {
        if (states.readUInt32LE(offset) === ACTIVATED_STATE) toplevel.active = true
      }
      publish()
      break
    }
    case HANDLE_DONE:
      publish()
      break
    case HANDLE_CLOSED:
      toplevels.delete(object)
      if (publishedToplevelId === object) {
        // The focused window went away (game quit). Drop the cached focus, then
        // re-publish if another toplevel is already activated.
        publishedToplevelId = null
        cancelPendingClear()
        publishCompositorFocus(null)
      }
      publish()
      break
    default:
      break
  }
}

function waylandSocketPath(): string | null {
  if (process.platform !== 'linux') return null
  const display = process.env.WAYLAND_DISPLAY
  if (!display) return null
  if (display.startsWith('/')) return display
  const runtime = process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? ''}`
  return join(runtime, display)
}

function reset(): void {
  socket = null
  managerObject = null
  toplevels.clear()
  publishedToplevelId = null
  cancelPendingClear()
  clearCompositorFocus()
}

/** Begin tracking the compositor's activated toplevel. Safe to call repeatedly;
 *  failures leave focus detection disabled rather than affecting other code. */
export function startWaylandFocusTracking(): void {
  if (started || compositorFocusSourceOwned()) return
  const path = waylandSocketPath()
  if (!path) return
  started = true

  const connection = createConnection(path)
  socket = connection
  let pending = Buffer.alloc(0)

  const onError = (): void => reset()
  connection.on('error', onError)
  connection.on('close', () => {
    reset()
    started = false
  })
  connection.on('data', (chunk: Buffer) => {
    pending = Buffer.concat([pending, chunk])
    while (pending.length >= 8) {
      const size = pending.readUInt16LE(6)
      if (size < 8) {
        pending = Buffer.alloc(0)
        return
      }
      if (pending.length < size) return
      const frame = pending.subarray(0, size)
      pending = pending.subarray(size)
      try {
        onMessage(frame)
      } catch {
        // Malformed or unsupported protocol event: ignore this frame only.
      }
    }
  })
  connection.on('connect', () => {
    connection.write(encodeMessage(DISPLAY_OBJECT, DISPLAY_GET_REGISTRY, u32(REGISTRY_OBJECT)))
  })
}

function ensureTracking(): void {
  if (!started && !compositorFocusSourceOwned()) startWaylandFocusTracking()
}

/** Cached activated toplevel, or null when native Wayland focus is unknown. */
export function readWaylandGameFocus(): WaylandGameFocus | null {
  ensureTracking()
  return currentWaylandGameFocus()
}

/** Most recent activated windows as paste-ready `title|appId` strings: current
 *  first, previous second. Empty when no native Wayland toplevel was observed. */
export function readRecentWindowHints(): readonly string[] {
  ensureTracking()
  return currentRecentWindowHints()
}

/** Subscribe to Wayland activated-toplevel changes. Fires only when the
 *  published focus snapshot actually changes. Returns an unsubscribe function. */
export function onWaylandGameFocusChange(listener: (focus: WaylandGameFocus | null) => void): () => void {
  ensureTracking()
  return subscribeWaylandFocus(listener)
}

/** Small gate for hotkeys: only true in native-Wayland mode when the compositor
 *  reports a game toplevel as focused. The host app's existing focus gate still
 *  applies; this is an additional signal for compositor-driven sessions. */
export function isWaylandGameFocused(argv: readonly string[] = process.argv): boolean {
  return isNativeWayland(argv) && !!readWaylandGameFocus()?.game
}
