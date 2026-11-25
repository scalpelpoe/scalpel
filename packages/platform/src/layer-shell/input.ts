import type { Point } from 'electron'
import type { NativeInputEvent, waylandNative } from 'electron-overlay-window'
import { Key } from '../input'
import type { InputEvents, InputHook, InputKeyEvent } from '../types'

/** What the evdev input needs from the layer-shell host. */
export type NativeInput = Pick<typeof waylandNative, 'listen' | 'key' | 'probePointer'>

/** The evdev input hook, plus the pointer position it tracks. */
export interface LayerShellInput extends InputHook {
  /** Latest known pointer position in global logical coordinates (DIP). */
  lastPointer(): Point | null
  /** Asks the compositor for the pointer, or forgets the last position when
   *  it does not reveal it, so callers cannot act on a stale one. */
  refreshPointer(): Promise<Point | null>
}

// Key codes are PC scancodes. Below 0x59 they equal evdev codes; extended
// keys differ.
const KEY_TO_EVDEV = new Map<number, number>([
  [Key.PageUp, 104],
  [Key.PageDown, 109],
  [Key.End, 107],
  [Key.Home, 102],
  [Key.ArrowLeft, 105],
  [Key.ArrowUp, 103],
  [Key.ArrowRight, 106],
  [Key.ArrowDown, 108],
  [Key.Insert, 110],
  [Key.Delete, 111],
  [Key.NumpadDivide, 98],
  [Key.NumpadEnter, 96],
  [Key.NumpadEnd, 79],
  [Key.NumpadArrowDown, 80],
  [Key.NumpadPageDown, 81],
  [Key.NumpadArrowLeft, 75],
  [Key.NumpadArrowRight, 77],
  [Key.NumpadHome, 71],
  [Key.NumpadArrowUp, 72],
  [Key.NumpadPageUp, 73],
  [Key.NumpadInsert, 82],
  [Key.NumpadDelete, 83],
  [Key.F13, 183],
  [Key.F14, 184],
  [Key.F15, 185],
  [Key.F16, 186],
  [Key.F17, 187],
  [Key.F18, 188],
  [Key.F19, 189],
  [Key.F20, 190],
  [Key.F21, 191],
  [Key.F22, 192],
  [Key.F23, 193],
  [Key.F24, 194],
  [Key.CtrlRight, 97],
  [Key.AltRight, 100],
  [Key.Meta, 125],
  [Key.MetaRight, 126],
  [Key.PrintScreen, 99],
])

// The numpad navigation codes are the digits with NumLock off; evdev has one
// code per physical key, reported as the digit.
const NUMPAD_NAVIGATION = new Set<number>([
  Key.NumpadEnd,
  Key.NumpadArrowDown,
  Key.NumpadPageDown,
  Key.NumpadArrowLeft,
  Key.NumpadArrowRight,
  Key.NumpadHome,
  Key.NumpadArrowUp,
  Key.NumpadPageUp,
  Key.NumpadInsert,
  Key.NumpadDelete,
])

const EVDEV_TO_KEY = new Map<number, number>(
  [...KEY_TO_EVDEV].filter(([key]) => !NUMPAD_NAVIGATION.has(key)).map(([key, code]) => [code, key]),
)

const LAST_SCANCODE = 0x58

export function keyToEvdev(key: number): number | null {
  return KEY_TO_EVDEV.get(key) ?? (key > 0 && key <= LAST_SCANCODE ? key : null)
}

export function evdevToKey(code: number): number | null {
  return EVDEV_TO_KEY.get(code) ?? (code > 0 && code <= LAST_SCANCODE ? code : null)
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
// evdev BTN_LEFT..BTN_EXTRA to uiohook's button numbers.
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

type Listeners = { [K in keyof InputEvents]: InputEvents[K][] }

/**
 * Global input without an X server. Events come from evdev and keys are typed
 * with a Wayland virtual keyboard, or a uinput keyboard where the compositor
 * has none.
 *
 * Presses are delivered only while the game has keyboard focus, and mouse
 * input only while the pointer is not over an overlay, as an X11 hook only
 * sees input delivered to X11 windows. Mouse positions are the last known
 * pointer position; wheel events with a modifier held refresh it first, for
 * stash scrolling. Listeners never see injected keys.
 */
export function createLayerShellInput(native: NativeInput, overlayPointer: () => Point | null): LayerShellInput {
  const listeners: Listeners = { keydown: [], keyup: [], mousedown: [], mouseup: [], mousemove: [], wheel: [] }
  let stopListening: (() => void) | null = null
  const held = new Set<number>()
  /** Keys this process holds down on the virtual keyboard. */
  const virtualHeld = new Set<number>()
  /** Physically held modifiers this process released for the game. */
  const suppressed = new Set<number>()
  let pointer: { x: number; y: number; at: number } | null = null

  const modifiers = (): Omit<InputKeyEvent, 'keycode'> => ({
    ctrlKey: held.has(KEY_LEFTCTRL) || held.has(KEY_RIGHTCTRL),
    shiftKey: held.has(KEY_LEFTSHIFT) || held.has(KEY_RIGHTSHIFT),
    altKey: held.has(KEY_LEFTALT) || held.has(KEY_RIGHTALT),
    metaKey: held.has(KEY_LEFTMETA) || held.has(KEY_RIGHTMETA),
  })

  const lastPointer = (): Point | null => {
    const over = overlayPointer()
    if (over) return over
    return pointer ? { x: pointer.x, y: pointer.y } : null
  }

  const refreshPointer = async (): Promise<Point | null> => {
    const over = overlayPointer()
    if (over) return over
    const found = await native.probePointer()
    pointer = found ? { ...found, at: Date.now() } : null
    return found
  }

  const sendVirtual = (code: number, pressed: boolean): void => {
    native.key(code, pressed)
    if (pressed) virtualHeld.add(code)
    else virtualHeld.delete(code)
  }

  /**
   * Compositors apply the modifiers of the keyboard that sent a key, so a
   * virtual key does not combine with physically held modifiers. Physical
   * modifiers are pressed on the virtual keyboard too before typing, except
   * those this process released, matching an X11 or Windows global key state.
   * Compositors that share one modifier state between keyboards (KWin with
   * uinput) ignore the extra presses, but also keep released modifiers held.
   */
  const press = (key: number, pressed: boolean): void => {
    const code = keyToEvdev(key)
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

  const handleKey = (type: 'keydown' | 'keyup', code: number): void => {
    if (type === 'keydown') {
      held.add(code)
    } else {
      held.delete(code)
      suppressed.delete(code)
      // A modifier pressed on the virtual keyboard to match a physical one
      // stays down there until the physical key is released.
      if (virtualHeld.has(code)) sendVirtual(code, false)
    }
    const keycode = evdevToKey(code)
    if (keycode === null) return
    const event = { keycode, ...modifiers() }
    for (const listener of listeners[type]) listener(event)
  }

  const handleWheel = (delta: number): void => {
    if (listeners.wheel.length === 0) return
    const mods = modifiers()
    const emit = (at: Point | null): void => {
      // The hook's rotation is positive downwards, evdev's wheel upwards.
      const event = { ...(at ?? { x: 0, y: 0 }), rotation: -delta, ...mods }
      for (const listener of listeners.wheel) listener(event)
    }
    const fresh = pointer && Date.now() - pointer.at < POINTER_PROBE_REUSE_MS
    if (!(mods.ctrlKey || mods.shiftKey || mods.altKey) || fresh) {
      emit(lastPointer())
      return
    }
    void refreshPointer().then(emit)
  }

  const handle = (event: NativeInputEvent): void => {
    switch (event.type) {
      case 'keydown':
      case 'keyup':
        handleKey(event.type, event.code)
        return
      case 'mousedown':
      case 'mouseup': {
        const button = BUTTONS.get(event.code)
        if (!button) return
        const mouse = { ...(lastPointer() ?? { x: 0, y: 0 }), button }
        for (const listener of listeners[event.type]) listener(mouse)
        return
      }
      case 'wheel':
        handleWheel(event.delta)
    }
  }

  const register: { [K in keyof InputEvents]: (listener: InputEvents[K]) => void } = {
    keydown: (listener) => listeners.keydown.push(listener),
    keyup: (listener) => listeners.keyup.push(listener),
    mousedown: (listener) => listeners.mousedown.push(listener),
    mouseup: (listener) => listeners.mouseup.push(listener),
    mousemove: (listener) => listeners.mousemove.push(listener),
    wheel: (listener) => listeners.wheel.push(listener),
  }

  return {
    on: (event, listener) => register[event](listener),
    start: () => {
      stopListening ??= native.listen(handle)
      if (!stopListening) throw new Error('The layer-shell host is not running')
    },
    stop: () => {
      stopListening?.()
      stopListening = null
      for (const code of [...virtualHeld]) sendVirtual(code, false)
      suppressed.clear()
      held.clear()
    },
    keyTap: (key, modifierKeys = []) => {
      for (const modifier of modifierKeys) press(modifier, true)
      press(key, true)
      press(key, false)
      for (const modifier of [...modifierKeys].reverse()) press(modifier, false)
    },
    keyToggle: (key, state) => press(key, state === 'down'),
    seesInjectedKeys: false,
    physicallyHeld: (key) => {
      const code = keyToEvdev(key)
      return code !== null && held.has(code)
    },
    lastPointer,
    refreshPointer,
  }
}
