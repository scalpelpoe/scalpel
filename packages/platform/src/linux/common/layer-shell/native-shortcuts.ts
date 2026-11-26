import { setLayerShortcutHandler, type LayerShortcutKey } from 'electron-overlay-window'
import { WaylandHost } from 'electron-overlay-window/dist/wayland/host'
import { reportBreadcrumb } from '../../../common/diagnostics'
import type { GlobalShortcuts } from '../../../types'
import { parseLinuxAccelerator } from '../global-shortcuts/evdev'
import { evdevToUiohook, markNativeShortcutKey } from '../native-input'

type Mods = { ctrlKey: boolean; shiftKey: boolean; altKey: boolean }

const EVDEV_MODIFIERS = {
  ctrl: new Set([29, 97]),
  shift: new Set([42, 54]),
  alt: new Set([56, 100, 108, 112]),
}
const MODIFIER_CODES = new Set([...EVDEV_MODIFIERS.ctrl, ...EVDEV_MODIFIERS.shift, ...EVDEV_MODIFIERS.alt])

type EvdevEvent = Parameters<Parameters<WaylandHost['onEvdev']>[0]>[0]

/**
 * Global shortcuts for a native layer-shell host without an X server or a
 * GlobalShortcuts portal: matched against evdev presses while the game has
 * focus, and against keys typed into an overlay surface. Unlike grabbed
 * shortcuts, the game also receives the key.
 */
export class NativeLayerShortcuts implements GlobalShortcuts {
  private readonly bindings = new Map<
    string,
    { combo: ReturnType<typeof parseLinuxAccelerator>; callback: () => void }
  >()
  private readonly mods: Mods = { ctrlKey: false, shiftKey: false, altKey: false }
  private stopRaw: (() => void) | null = null

  private readonly onEvdev = (event: EvdevEvent): void => {
    if (event.kind !== 'key') return
    const pressed = event.value !== 0
    if (EVDEV_MODIFIERS.ctrl.has(event.code)) this.mods.ctrlKey = pressed
    else if (EVDEV_MODIFIERS.shift.has(event.code)) this.mods.shiftKey = pressed
    else if (EVDEV_MODIFIERS.alt.has(event.code)) this.mods.altKey = pressed
    const keycode = evdevToUiohook(event.code)
    if (!pressed || event.value !== 1 || MODIFIER_CODES.has(event.code)) {
      markNativeShortcutKey(keycode, false)
      return
    }
    markNativeShortcutKey(keycode, this.dispatch(keycode, this.mods))
  }

  constructor() {
    // Fallback for hosts that start later or cannot read evdev.
    process.on('exit', this.dispose)
  }

  /** True while raw evdev can deliver keys; the layer-surface key handler
   *  must then step aside so one press does not dispatch twice. The host
   *  reports readable devices after `evdev on` and on hotplug, so without
   *  any the layer-surface keys stay the fallback. */
  get rawListening(): boolean {
    return this.stopRaw !== null && (WaylandHost.get()?.evdevDevices ?? 0) > 0
  }

  /** Switches to the host's unfiltered evdev stream once the Wayland host is
   *  running. The uiohook facade only delivers keys while the target is
   *  tracked, which would make every shortcut depend on a successful attach. */
  startRawInput(): void {
    if (this.stopRaw) return
    const host = WaylandHost.get()
    if (!host) return
    this.stopRaw = host.onEvdev(this.onEvdev)
    reportBreadcrumb(`native shortcuts raw evdev started devices=${host.evdevDevices}`, 'debug')
  }

  /** Keys typed into an overlay layer surface when evdev is unavailable. */
  handleLayerKey(key: LayerShortcutKey): boolean {
    if (this.rawListening) return false
    return this.dispatch(evdevToUiohook(key.code), {
      ctrlKey: key.mods.ctrl,
      shiftKey: key.mods.shift,
      altKey: key.mods.alt,
    })
  }

  /** Used when backend initialization fails after the listener was attached. */
  dispose = (): void => {
    this.stopRaw?.()
    this.stopRaw = null
    this.bindings.clear()
  }

  /** Runs the shortcut for a key press. Returns whether one matched. */
  dispatch(keycode: number | null, mods: Mods): boolean {
    let matched = false
    for (const [accelerator, { combo, callback }] of this.bindings) {
      if (
        combo?.keycode === keycode &&
        combo.ctrl === mods.ctrlKey &&
        combo.shift === mods.shiftKey &&
        combo.alt === mods.altKey
      ) {
        matched = true
        reportBreadcrumb(
          `native shortcut matched accelerator="${accelerator}" keycode=${keycode} ` +
            `ctrl=${mods.ctrlKey} shift=${mods.shiftKey} alt=${mods.altKey}`,
        )
        try {
          callback()
        } catch (error) {
          reportBreadcrumb(`native shortcut callback failed accelerator="${accelerator}" error=${String(error)}`)
        }
      }
    }
    return matched
  }

  register(accelerator: string, callback: () => void): boolean {
    const combo = parseLinuxAccelerator(accelerator)
    if (!combo || this.bindings.has(accelerator)) return false
    this.bindings.set(accelerator, { combo, callback })
    reportBreadcrumb(`native shortcut registered accelerator="${accelerator}"`, 'debug')
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

/** Installs the layer-surface shortcut handler. Null clears it during rollback. */
export function setNativeLayerShortcutHandler(shortcuts: NativeLayerShortcuts | null): void {
  setLayerShortcutHandler(shortcuts ? (key) => shortcuts.handleLayerKey(key) : null)
}
