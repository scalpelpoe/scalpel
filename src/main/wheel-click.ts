// "Wheel click": while the chosen lock key (CapsLock or ScrollLock) is on and
// Path of Exile is focused, each scroll-wheel notch becomes a left click (and
// the scroll itself is swallowed), for fast Ctrl+click stash sorting. Windows
// only, opt-in.
//
// The hook lives in a worker_thread (wheel-click-worker.ts); this side only
// starts/stops it and keeps the shared gate (enabled + game focused + game
// bounds) current. See the worker header for why it can't run here.
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { OverlayController } from 'electron-overlay-window'
import { guardNativeListener, recordMainBreadcrumb, recordMainDiagnostic } from './diagnostics'
import {
  DEFAULT_TOGGLE_KEY,
  SLOT,
  SLOT_COUNT,
  STATUS,
  type WheelClickToggleKey,
  normalizeToggleKey,
  toggleKeyVk,
} from './wheel-click-shared'

interface Running {
  worker: Worker
  state: Int32Array
}

let enabled = false
let toggleKey: WheelClickToggleKey = DEFAULT_TOGGLE_KEY
let running: Running | null = null
let listenersAttached = false
let lastError: string | null = null

function supported(): boolean {
  return process.platform === 'win32'
}

/** Push the current gate into the shared buffer the hook reads. Cheap; called
 *  on every focus/geometry change. */
function syncGate(): void {
  if (!running) return
  const { state } = running
  Atomics.store(state, SLOT.TOGGLE_VK, toggleKeyVk(toggleKey))
  const tb = OverlayController.targetBounds
  if (tb) {
    Atomics.store(state, SLOT.X, Math.round(tb.x))
    Atomics.store(state, SLOT.Y, Math.round(tb.y))
    Atomics.store(state, SLOT.W, Math.round(tb.width))
    Atomics.store(state, SLOT.H, Math.round(tb.height))
  }
  const active = enabled && OverlayController.targetHasFocus && !!tb?.width
  Atomics.store(state, SLOT.ACTIVE, active ? 1 : 0)
}

function attachListeners(): void {
  if (listenersAttached) return
  listenersAttached = true
  const sync = guardNativeListener('wheel-click-sync', () => syncGate())
  for (const event of ['focus', 'blur', 'attach', 'detach', 'moveresize'] as const) {
    OverlayController.events.on(event, sync)
  }
}

function startWorker(): void {
  if (running) return
  const state = new Int32Array(new SharedArrayBuffer(SLOT_COUNT * Int32Array.BYTES_PER_ELEMENT))
  let worker: Worker
  try {
    worker = new Worker(path.join(__dirname, 'wheel-click-worker.js'), { workerData: { buffer: state.buffer } })
  } catch (e) {
    lastError = String(e)
    recordMainDiagnostic('wheel-click-start', e)
    return
  }
  // The thread sits in GetMessageW forever; it must never hold the app open.
  worker.unref()
  const self: Running = { worker, state }
  running = self
  worker.on('message', (msg: { type: string; detail?: string }) => {
    if (msg?.type === 'error') {
      lastError = msg.detail ?? 'unknown'
      recordMainDiagnostic('wheel-click-hook', new Error(lastError))
    }
  })
  worker.on('error', (e) => {
    lastError = String(e)
    recordMainDiagnostic('wheel-click-worker', e)
  })
  worker.on('exit', () => {
    if (running === self) running = null
  })
  syncGate()
  recordMainBreadcrumb('wheel-click worker started')
}

function stopWorker(): void {
  if (!running) return
  const { state } = running
  // Gate off first so nothing is swallowed while the thread winds down (it
  // notices STOP on its next timer tick, <=250ms).
  Atomics.store(state, SLOT.ACTIVE, 0)
  Atomics.store(state, SLOT.STOP, 1)
  // A re-enable before it exits gets a fresh worker + buffer; the old one
  // passes everything through until it's gone.
  running = null
}

export function setWheelClickEnabled(on: boolean): void {
  enabled = on
  if (!supported()) return
  if (on) {
    attachListeners()
    startWorker()
    syncGate()
  } else {
    stopWorker()
  }
}

/** Choose which lock key's toggle state arms the feature. Applies live to a
 *  running hook (the worker reads the VK from shared memory per wheel event). */
export function setWheelClickToggleKey(key: unknown): void {
  toggleKey = normalizeToggleKey(key)
  syncGate()
}

export function stopWheelClick(): void {
  enabled = false
  stopWorker()
}

/** True when the hook is currently turning wheel events into clicks, so other
 *  wheel consumers (stash tab scrolling) should stand down. */
export function wheelClickOwnsWheel(): boolean {
  if (!running) return false
  const { state } = running
  return Atomics.load(state, SLOT.ACTIVE) === 1 && Atomics.load(state, SLOT.TOGGLE_ON) === 1
}

export function getWheelClickDiagnostics(): Record<string, unknown> {
  const state = running?.state
  return {
    enabled,
    toggleKey,
    supported: supported(),
    running: !!running,
    status: state ? Atomics.load(state, SLOT.STATUS) : null,
    statusRunning: state ? Atomics.load(state, SLOT.STATUS) === STATUS.RUNNING : false,
    active: state ? Atomics.load(state, SLOT.ACTIVE) === 1 : false,
    converted: state ? Atomics.load(state, SLOT.CONVERTED) : 0,
    clicks: state ? Atomics.load(state, SLOT.CLICKS) : 0,
    lastError,
  }
}
