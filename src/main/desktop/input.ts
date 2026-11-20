import type { NativeInputEvent } from 'electron-overlay-window'
import {
  EventType,
  uIOhook as hook,
  type UiohookKeyboardEvent,
  type UiohookMouseEvent,
  type UiohookWheelEvent,
  UiohookKey,
  WheelDirection,
} from 'uiohook-napi'
import { layerShellServices } from './layer-shell-state'

/**
 * uiohook's API over the input backend of the session. Under layer-shell,
 * events come from evdev and keys are typed with a Wayland virtual keyboard,
 * so nothing goes through XWayland; elsewhere this is uiohook itself.
 *
 * Under layer-shell, presses are delivered only while the game has keyboard
 * focus, and mouse input only while the pointer is not over an overlay, as
 * uiohook only sees input delivered to X11 windows. Mouse positions are the
 * last known pointer position; wheel events with a modifier held refresh it
 * first, for stash scrolling.
 */

interface HookEvents {
  keydown: (e: UiohookKeyboardEvent) => void
  keyup: (e: UiohookKeyboardEvent) => void
  mousedown: (e: UiohookMouseEvent) => void
  mouseup: (e: UiohookMouseEvent) => void
  mousemove: (e: UiohookMouseEvent) => void
  wheel: (e: UiohookWheelEvent) => void
}

type EventName = keyof HookEvents

// uiohook keycodes are PC scancodes. Below 0x59 they equal evdev codes;
// extended keys differ.
const UIOHOOK_TO_EVDEV = new Map<number, number>([
  [UiohookKey.PageUp, 104],
  [UiohookKey.PageDown, 109],
  [UiohookKey.End, 107],
  [UiohookKey.Home, 102],
  [UiohookKey.ArrowLeft, 105],
  [UiohookKey.ArrowUp, 103],
  [UiohookKey.ArrowRight, 106],
  [UiohookKey.ArrowDown, 108],
  [UiohookKey.Insert, 110],
  [UiohookKey.Delete, 111],
  [UiohookKey.NumpadDivide, 98],
  [UiohookKey.NumpadEnter, 96],
  [UiohookKey.NumpadEnd, 79],
  [UiohookKey.NumpadArrowDown, 80],
  [UiohookKey.NumpadPageDown, 81],
  [UiohookKey.NumpadArrowLeft, 75],
  [UiohookKey.NumpadArrowRight, 77],
  [UiohookKey.NumpadHome, 71],
  [UiohookKey.NumpadArrowUp, 72],
  [UiohookKey.NumpadPageUp, 73],
  [UiohookKey.NumpadInsert, 82],
  [UiohookKey.NumpadDelete, 83],
  [UiohookKey.F13, 183],
  [UiohookKey.F14, 184],
  [UiohookKey.F15, 185],
  [UiohookKey.F16, 186],
  [UiohookKey.F17, 187],
  [UiohookKey.F18, 188],
  [UiohookKey.F19, 189],
  [UiohookKey.F20, 190],
  [UiohookKey.F21, 191],
  [UiohookKey.F22, 192],
  [UiohookKey.F23, 193],
  [UiohookKey.F24, 194],
  [UiohookKey.CtrlRight, 97],
  [UiohookKey.AltRight, 100],
  [UiohookKey.Meta, 125],
  [UiohookKey.MetaRight, 126],
  [UiohookKey.PrintScreen, 99],
])

// The numpad navigation codes are the digits with NumLock off; evdev has one
// code per physical key, reported as the digit.
const NUMPAD_NAVIGATION = new Set<number>([
  UiohookKey.NumpadEnd,
  UiohookKey.NumpadArrowDown,
  UiohookKey.NumpadPageDown,
  UiohookKey.NumpadArrowLeft,
  UiohookKey.NumpadArrowRight,
  UiohookKey.NumpadHome,
  UiohookKey.NumpadArrowUp,
  UiohookKey.NumpadPageUp,
  UiohookKey.NumpadInsert,
  UiohookKey.NumpadDelete,
])

const EVDEV_TO_UIOHOOK = new Map<number, number>(
  [...UIOHOOK_TO_EVDEV].filter(([key]) => !NUMPAD_NAVIGATION.has(key)).map(([key, code]) => [code, key]),
)

const LAST_SCANCODE = 0x58

export function uiohookToEvdev(key: number): number | null {
  return UIOHOOK_TO_EVDEV.get(key) ?? (key > 0 && key <= LAST_SCANCODE ? key : null)
}

export function evdevToUiohook(code: number): number | null {
  return EVDEV_TO_UIOHOOK.get(code) ?? (code > 0 && code <= LAST_SCANCODE ? code : null)
}

const KEY_LEFTCTRL = 29
const KEY_RIGHTCTRL = 97
const KEY_LEFTSHIFT = 42
const KEY_RIGHTSHIFT = 54
const KEY_LEFTALT = 56
const KEY_RIGHTALT = 100
const KEY_LEFTMETA = 125
const KEY_RIGHTMETA = 126
const MODIFIERS = new Set([
  KEY_LEFTCTRL,
  KEY_RIGHTCTRL,
  KEY_LEFTSHIFT,
  KEY_RIGHTSHIFT,
  KEY_LEFTALT,
  KEY_RIGHTALT,
  KEY_LEFTMETA,
  KEY_RIGHTMETA,
])
const BUTTONS = new Map([
  [0x110, 1],
  [0x111, 2],
  [0x112, 3],
  [0x113, 4],
  [0x114, 5],
])
// A stash scroll burst happens with the pointer still; probing once per burst
// avoids flickering pointer focus away from the game on every detent.
const POINTER_PROBE_REUSE_MS = 1000

const listeners: { [K in EventName]: HookEvents[K][] } = {
  keydown: [],
  keyup: [],
  mousedown: [],
  mouseup: [],
  mousemove: [],
  wheel: [],
}
let backend: 'uiohook' | 'native' | null = null
let stopNative: (() => void) | null = null
const held = new Set<number>()
/** Keys this process holds down on the virtual keyboard. */
const virtualHeld = new Set<number>()
/** Physically held modifiers this process released for the game. */
const suppressed = new Set<number>()
let pointer: { x: number; y: number; at: number } | null = null

function modifiers(): Pick<UiohookKeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'> {
  return {
    ctrlKey: held.has(KEY_LEFTCTRL) || held.has(KEY_RIGHTCTRL),
    shiftKey: held.has(KEY_LEFTSHIFT) || held.has(KEY_RIGHTSHIFT),
    altKey: held.has(KEY_LEFTALT) || held.has(KEY_RIGHTALT),
    metaKey: held.has(KEY_LEFTMETA) || held.has(KEY_RIGHTMETA),
  }
}

function emit<K extends EventName>(name: K, event: Parameters<HookEvents[K]>[0]): void {
  for (const listener of listeners[name]) (listener as (e: typeof event) => void)(event)
}

/** Latest known pointer position in global logical coordinates. */
export function lastPointer(): { x: number; y: number } | null {
  const over = layerShellServices()?.overlayPointer()
  if (over) return over
  return pointer ? { x: pointer.x, y: pointer.y } : null
}

/** Finds the pointer with the compositor. Null outside layer-shell, or when
 *  the compositor does not reveal it, which also forgets the last position so
 *  callers cannot act on a stale one. */
export async function refreshPointer(): Promise<{ x: number; y: number } | null> {
  const services = layerShellServices()
  if (!services) return null
  const over = services.overlayPointer()
  if (over) return over
  const found = await services.native.probePointer()
  pointer = found ? { ...found, at: Date.now() } : null
  return found
}

function handleNative(event: NativeInputEvent): void {
  const time = Date.now()
  if (event.type === 'keydown' || event.type === 'keyup') {
    if (event.type === 'keydown') held.add(event.code)
    else held.delete(event.code)
    // A modifier pressed on the virtual keyboard to match a physical one
    // stays down there until the physical key is released.
    if (event.type === 'keyup') {
      suppressed.delete(event.code)
      if (virtualHeld.has(event.code)) {
        virtualHeld.delete(event.code)
        layerShellServices()?.native.key(event.code, false)
      }
    }
    const keycode = evdevToUiohook(event.code)
    if (keycode === null) return
    const type = event.type === 'keydown' ? EventType.EVENT_KEY_PRESSED : EventType.EVENT_KEY_RELEASED
    emit(event.type, { type, time, keycode, ...modifiers() })
    return
  }
  if (event.type === 'mousedown' || event.type === 'mouseup') {
    const button = BUTTONS.get(event.code)
    if (!button) return
    const at = lastPointer() ?? { x: 0, y: 0 }
    const type = event.type === 'mousedown' ? EventType.EVENT_MOUSE_PRESSED : EventType.EVENT_MOUSE_RELEASED
    emit(event.type, { type, time, button, clicks: 1, ...at, ...modifiers() })
    return
  }
  if (event.type !== 'wheel' || listeners.wheel.length === 0) return
  const { delta, horizontal } = event
  const mods = modifiers()
  const wheel = (at: { x: number; y: number } | null) =>
    emit('wheel', {
      type: EventType.EVENT_MOUSE_WHEEL,
      time,
      ...mods,
      ...(at ?? { x: 0, y: 0 }),
      clicks: 1,
      amount: 3,
      direction: horizontal ? WheelDirection.HORIZONTAL : WheelDirection.VERTICAL,
      // uiohook's rotation is positive downwards, evdev's wheel upwards.
      rotation: -delta,
    })
  const fresh = pointer && time - pointer.at < POINTER_PROBE_REUSE_MS
  if (!(mods.ctrlKey || mods.shiftKey || mods.altKey) || fresh) {
    wheel(lastPointer())
    return
  }
  void refreshPointer().then(wheel)
}

function attachUiohook(): void {
  if (backend === 'uiohook') return
  backend = 'uiohook'
  hook.on('keydown', (e) => emit('keydown', e))
  hook.on('keyup', (e) => emit('keyup', e))
  hook.on('mousedown', (e) => emit('mousedown', e))
  hook.on('mouseup', (e) => emit('mouseup', e))
  hook.on('mousemove', (e) => emit('mousemove', e))
  hook.on('wheel', (e) => emit('wheel', e))
}

function sendVirtual(code: number, pressed: boolean): void {
  layerShellServices()?.native.key(code, pressed)
  if (pressed) virtualHeld.add(code)
  else virtualHeld.delete(code)
}

/**
 * Compositors apply the modifiers of the keyboard that sent a key, so a
 * virtual key does not combine with physically held modifiers. Physical
 * modifiers are pressed on the virtual keyboard too before typing, except
 * those this process released, matching an X11 or Windows global key state.
 */
function pressNative(key: number, pressed: boolean): void {
  const code = uiohookToEvdev(key)
  if (code === null) return
  if (MODIFIERS.has(code)) {
    if (pressed) {
      suppressed.delete(code)
      if (!virtualHeld.has(code)) sendVirtual(code, true)
      return
    }
    if (held.has(code)) suppressed.add(code)
    if (virtualHeld.has(code)) sendVirtual(code, false)
    return
  }
  if (pressed) {
    for (const modifier of held) {
      if (MODIFIERS.has(modifier) && !suppressed.has(modifier) && !virtualHeld.has(modifier)) {
        sendVirtual(modifier, true)
      }
    }
  }
  sendVirtual(code, pressed)
}

function releaseVirtual(): void {
  for (const code of [...virtualHeld]) sendVirtual(code, false)
  suppressed.clear()
}

export const uIOhook = {
  on<K extends EventName>(name: K, listener: HookEvents[K]): void {
    listeners[name].push(listener)
  },
  start(): void {
    const services = layerShellServices()
    if (services) {
      backend = 'native'
      stopNative ??= services.native.listen(handleNative)
      if (!stopNative) throw new Error('The layer-shell host is not running')
      return
    }
    attachUiohook()
    hook.start()
  },
  stop(): void {
    if (backend === 'native') {
      stopNative?.()
      stopNative = null
      releaseVirtual()
      held.clear()
      return
    }
    hook.stop()
  },
  keyTap(key: number, modifierKeys: number[] = []): void {
    if (!layerShellServices()) {
      hook.keyTap(key, modifierKeys)
      return
    }
    for (const mod of modifierKeys) pressNative(mod, true)
    pressNative(key, true)
    pressNative(key, false)
    for (const mod of [...modifierKeys].reverse()) pressNative(mod, false)
  },
  keyToggle(key: number, toggle: 'down' | 'up'): void {
    if (!layerShellServices()) hook.keyToggle(key, toggle)
    else pressNative(key, toggle === 'down')
  },
  /** Whether listeners also see the keys this process types. uiohook does;
   *  evdev only sees physical devices. */
  seesInjectedKeys(): boolean {
    return backend !== 'native'
  },
  /** Whether the user holds a key, or null where injected keys make that
   *  unknowable. */
  physicallyHeld(key: number): boolean | null {
    if (backend !== 'native') return null
    const code = uiohookToEvdev(key)
    return code !== null && held.has(code)
  },
}
