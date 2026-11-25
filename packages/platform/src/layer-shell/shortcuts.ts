import { Key } from '../input'
import type { GlobalShortcuts, InputHook } from '../types'

export interface Combo {
  keycode: number
  ctrl: boolean
  shift: boolean
  alt: boolean
}

type Modifiers = { ctrlKey: boolean; shiftKey: boolean; altKey: boolean }

const NAMED_KEYS: Record<string, number> = {
  Space: Key.Space,
  Tab: Key.Tab,
  Escape: Key.Escape,
  Esc: Key.Escape,
  Delete: Key.Delete,
  Insert: Key.Insert,
  Home: Key.Home,
  End: Key.End,
  PageUp: Key.PageUp,
  PageDown: Key.PageDown,
  Up: Key.ArrowUp,
  Down: Key.ArrowDown,
  Left: Key.ArrowLeft,
  Right: Key.ArrowRight,
  Enter: Key.Enter,
  Return: Key.Enter,
  Backspace: Key.Backspace,
  num0: Key.Numpad0,
  num1: Key.Numpad1,
  num2: Key.Numpad2,
  num3: Key.Numpad3,
  num4: Key.Numpad4,
  num5: Key.Numpad5,
  num6: Key.Numpad6,
  num7: Key.Numpad7,
  num8: Key.Numpad8,
  num9: Key.Numpad9,
  numdec: Key.NumpadDecimal,
  numadd: Key.NumpadAdd,
  numsub: Key.NumpadSubtract,
  nummult: Key.NumpadMultiply,
  numdiv: Key.NumpadDivide,
}

const KEYS_BY_NAME = new Map<string, number>(Object.entries(Key))

function keyCode(name: string): number | null {
  if (/^[A-Z0-9]$/i.test(name)) return KEYS_BY_NAME.get(name.toUpperCase()) ?? null
  if (/^F([1-9]|1\d|2[0-4])$/.test(name)) return KEYS_BY_NAME.get(name) ?? null
  return NAMED_KEYS[name] ?? null
}

/** Parses the Electron accelerators `GlobalShortcuts.register` accepts, or
 *  null for keys it cannot bind. */
export function parseAccelerator(accelerator: string): Combo | null {
  const parts = accelerator.replace(/\s+/g, '').split('+')
  const key = parts.pop()
  if (!key) return null
  const combo = { keycode: 0, ctrl: false, shift: false, alt: false }
  for (const modifier of parts) {
    if (modifier === 'Shift') combo.shift = true
    else if (modifier === 'Alt' || modifier === 'Option') combo.alt = true
    else if (['CommandOrControl', 'CmdOrCtrl', 'Control', 'Ctrl', 'Command', 'Cmd'].includes(modifier)) {
      combo.ctrl = true
    } else return null
  }
  const keycode = keyCode(key)
  return keycode ? { ...combo, keycode } : null
}

/**
 * Global shortcuts without an X server or a GlobalShortcuts portal: matched
 * against evdev presses while the game has focus, and against keys typed into
 * an overlay surface through `dispatch`. Unlike grabbed shortcuts, the game
 * also receives the key.
 */
export class NativeShortcuts implements GlobalShortcuts {
  private readonly bindings = new Map<string, { combo: Combo; callback: () => void }>()

  constructor(input: Pick<InputHook, 'on'>) {
    input.on('keydown', (event) => {
      this.dispatch(event.keycode, event)
    })
  }

  /** Runs the shortcuts bound to a key press. Returns whether one matched. */
  dispatch(keycode: number | null, modifiers: Modifiers): boolean {
    let matched = false
    for (const { combo, callback } of this.bindings.values()) {
      if (
        combo.keycode === keycode &&
        combo.ctrl === modifiers.ctrlKey &&
        combo.shift === modifiers.shiftKey &&
        combo.alt === modifiers.altKey
      ) {
        matched = true
        callback()
      }
    }
    return matched
  }

  register(accelerator: string, callback: () => void): boolean {
    const combo = parseAccelerator(accelerator)
    if (!combo || this.bindings.has(accelerator)) return false
    this.bindings.set(accelerator, { combo, callback })
    return true
  }

  unregister(accelerator: string): void {
    this.bindings.delete(accelerator)
  }

  unregisterAll(): void {
    this.bindings.clear()
  }

  isRegistered(accelerator: string): boolean {
    return this.bindings.has(accelerator)
  }
}
