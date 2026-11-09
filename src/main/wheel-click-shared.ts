// Shared between the main-thread controller (wheel-click.ts) and the hook
// worker (wheel-click-worker.ts). Kept free of electron/koffi imports so both
// sides - and the unit tests - can load it.

/** Int32 slots in the SharedArrayBuffer the two threads coordinate through.
 *  The worker spends its whole life blocked inside GetMessageW, so it never
 *  services postMessage; everything the hook needs to decide synchronously is
 *  read from here with Atomics. */
export const SLOT = {
  /** 1 while the feature is enabled AND the attached game has focus (main writes). */
  ACTIVE: 0,
  /** Game window bounds, physical px (main writes). */
  X: 1,
  Y: 2,
  W: 3,
  H: 4,
  /** 1 asks the worker to unhook and exit (main writes). */
  STOP: 5,
  /** Lifecycle, see STATUS (worker writes). */
  STATUS: 6,
  /** Toggle-key lock state as of the last wheel event the hook saw (worker writes). */
  TOGGLE_ON: 7,
  /** Wheel events converted to clicks / clicks sent, for diagnostics (worker writes). */
  CONVERTED: 8,
  CLICKS: 9,
  /** Virtual-key code of the lock key whose toggle state arms the feature (main writes). */
  TOGGLE_VK: 10,
} as const

export const SLOT_COUNT = 11

export type WheelClickToggleKey = 'CapsLock' | 'ScrollLock'

export const DEFAULT_TOGGLE_KEY: WheelClickToggleKey = 'CapsLock'

const VK_CAPITAL = 0x14
const VK_SCROLL = 0x91

/** Lock key -> Win32 virtual-key code. Anything unrecognised (a hand-edited
 *  settings file, a key removed in a later version) falls back to CapsLock. */
export function toggleKeyVk(key: string | undefined): number {
  return key === 'ScrollLock' ? VK_SCROLL : VK_CAPITAL
}

/** Validate a stored/incoming toggle key value. */
export function normalizeToggleKey(key: unknown): WheelClickToggleKey {
  return key === 'ScrollLock' ? 'ScrollLock' : DEFAULT_TOGGLE_KEY
}

export const STATUS = {
  STARTING: 0,
  RUNNING: 1,
  STOPPED: 2,
  FAILED: -1,
} as const

/** One standard wheel notch. Hi-res / free-spin wheels report fractions of it. */
export const WHEEL_DELTA = 120

/** Partial notches older than this are dropped, so a stray sub-notch nudge
 *  can't combine with a scroll seconds later into a surprise click. */
export const ACCUMULATOR_IDLE_MS = 1000

/** Upper bound on clicks emitted for a single wheel event. A free-spinning
 *  wheel can coalesce several notches into one event; a corrupt delta must not
 *  turn into a click storm. */
export const MAX_CLICKS_PER_EVENT = 5

export interface NotchAccumulator {
  /** Absolute wheel delta carried over from earlier events, always < WHEEL_DELTA. */
  carry: number
  lastAt: number
}

/** Fold one wheel event into the accumulator and return how many full
 *  notches - therefore clicks - it completes. Direction is ignored: scrolling
 *  either way clicks. One click per full 120-unit notch keeps a hi-res wheel
 *  (several small events per physical notch) at one click per notch. */
export function takeNotches(acc: NotchAccumulator, delta: number, now: number): number {
  if (now - acc.lastAt > ACCUMULATOR_IDLE_MS) acc.carry = 0
  acc.lastAt = now
  const total = acc.carry + Math.abs(delta)
  const notches = Math.floor(total / WHEEL_DELTA)
  acc.carry = total - notches * WHEEL_DELTA
  return Math.min(notches, MAX_CLICKS_PER_EVENT)
}

/** Signed wheel delta from MSLLHOOKSTRUCT.mouseData (high word, signed). */
export function wheelDeltaFromMouseData(mouseData: number): number {
  return (mouseData | 0) >> 16
}

export function pointInBounds(x: number, y: number, b: { x: number; y: number; w: number; h: number }): boolean {
  return b.w > 0 && b.h > 0 && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h
}
