import { type KeyCombo, parseAccelerator } from '../hotkey-accelerator'
import { uIOhook } from './input'

type Mods = { ctrlKey: boolean; shiftKey: boolean; altKey: boolean }

/**
 * Global shortcuts without an X server or a GlobalShortcuts portal: matched
 * against evdev presses while the game has focus, and against keys typed into
 * an overlay surface. Unlike grabbed shortcuts, the game also receives the key.
 */
export class NativeShortcuts {
  private readonly bindings = new Map<string, { combo: KeyCombo; callback: () => void }>()

  constructor() {
    uIOhook.on('keydown', (e) => {
      this.dispatch(e.keycode, e)
    })
  }

  /** Runs the shortcut for a key press. Returns whether one matched. */
  dispatch(keycode: number | null, mods: Mods): boolean {
    let matched = false
    for (const { combo, callback } of this.bindings.values()) {
      if (
        combo.keycode === keycode &&
        combo.ctrl === mods.ctrlKey &&
        combo.shift === mods.shiftKey &&
        combo.alt === mods.altKey
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
