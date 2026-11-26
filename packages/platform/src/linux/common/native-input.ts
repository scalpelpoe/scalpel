import { waylandNative } from 'electron-overlay-window'
import { WaylandHost } from 'electron-overlay-window/dist/wayland/host'
import {
  EventType,
  uIOhook as hook,
  type UiohookKeyboardEvent,
  UiohookKey,
  type UiohookMouseEvent,
  type UiohookWheelEvent,
  WheelDirection,
} from 'uiohook-napi'
import type { NativeInputEvent } from './native-overlay'
import { reportBreadcrumb, reportDiagnostic } from '../../common/diagnostics'
import type { InputEvents, InputHook, PlatformEnv } from '../../types'
import { isNativeWayland } from './display'
import { getLinuxInputBackend } from './input-backend'
import { preferredTool, tapCombo, tapWithTool, toggleWithTool, type InjectionTool } from './key-injection'
import { nativeOverlayServices } from './native-overlay'

export { UiohookKey }

type EventName = keyof InputEvents

const rawShortcutKeys = new Map<number, number>()
const RAW_SHORTCUT_MAX_AGE_MS = 5000

export function markNativeShortcutKey(keycode: number | null, handled: boolean): void {
  if (keycode === null) return
  if (handled) rawShortcutKeys.set(keycode, Date.now())
  else rawShortcutKeys.delete(keycode)
}

export function nativeShortcutHandles(keycode: number): boolean {
  const at = rawShortcutKeys.get(keycode)
  if (at === undefined) return false
  if (Date.now() - at > RAW_SHORTCUT_MAX_AGE_MS) {
    rawShortcutKeys.delete(keycode)
    return false
  }
  return true
}

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
const POINTER_PROBE_REUSE_MS = 1000

type ListenerMap = { [K in EventName]: Array<InputEvents[K]> }

const listeners: ListenerMap = {
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
const virtualHeld = new Set<number>()
const suppressed = new Set<number>()
let pointer: { x: number; y: number; at: number } | null = null
let lastResolvedTool: ResolvedTool | null = null

function logResolved(tool: ResolvedTool, reason: string): void {
  if (lastResolvedTool === tool) return
  lastResolvedTool = tool
  reportBreadcrumb(`[linux/input] resolved=${tool} reason=${reason}`)
}

function explicitTool(): InjectionTool | null {
  const selected = getLinuxInputBackend()
  return selected === 'ydotool' || selected === 'wtype' ? selected : null
}

type ResolvedTool = InjectionTool | 'uiohook' | 'compositor' | 'unavailable'

function resolveExternalTool(nativeWayland: boolean): ResolvedTool {
  if (!nativeWayland) {
    logResolved('uiohook', 'not-native-wayland')
    return 'uiohook'
  }
  const preference = getLinuxInputBackend()
  if (preference === 'uiohook') {
    logResolved('uiohook', 'explicit-uiohook')
    return 'uiohook'
  }
  if (preference === 'compositor') {
    // The compositor host's virtual keyboard is the only Wayland-native input
    // path. Never fall back to uIOhook here: on a Wayland Ozone process its X11
    // backend can call XChangeWindowAttributes on an invalid window and abort.
    if (WaylandHost.get()?.features?.virtualKeyboard) {
      logResolved('compositor', 'explicit-compositor')
      return 'compositor'
    }
    logResolved('unavailable', 'compositor-unavailable')
    reportDiagnostic('linux-input', new Error('Compositor keyboard is unavailable (no Wayland virtual keyboard)'))
    return 'unavailable'
  }
  if (preference === 'ydotool' || preference === 'wtype') {
    const tool = preferredTool(preference)
    if (tool) {
      logResolved(tool, `explicit-${preference}`)
      return tool
    }
    logResolved('unavailable', `${preference}-unavailable`)
    reportDiagnostic('linux-input', new Error(`${preference} requested but unavailable`))
    return 'unavailable'
  }
  const tool = preferredTool('auto')
  if (tool) {
    logResolved(tool, 'auto-native-wayland')
    return tool
  }
  logResolved('unavailable', 'auto-no-tool')
  reportDiagnostic('linux-input', new Error('No ydotool/wtype available for native Wayland input'))
  return 'unavailable'
}

/** Send a key through the compositor host's virtual keyboard. Keys are uIOhook
 *  codes; the host speaks Linux evdev keycodes. */
function compositorKey(key: number, pressed: boolean): void {
  const code = uiohookToEvdev(key)
  if (code !== null) waylandNative.key(code, pressed)
}

function modifiers(): Pick<UiohookKeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'> {
  return {
    ctrlKey: held.has(KEY_LEFTCTRL) || held.has(KEY_RIGHTCTRL),
    shiftKey: held.has(KEY_LEFTSHIFT) || held.has(KEY_RIGHTSHIFT),
    altKey: held.has(KEY_LEFTALT) || held.has(KEY_RIGHTALT),
    metaKey: held.has(KEY_LEFTMETA) || held.has(KEY_RIGHTMETA),
  }
}

function emit<K extends EventName>(name: K, event: Parameters<InputEvents[K]>[0]): void {
  for (const listener of listeners[name]) (listener as (e: typeof event) => void)(event)
}

export function lastPointer(): { x: number; y: number } | null {
  const over = nativeOverlayServices()?.overlayPointer?.()
  if (over) return over
  return pointer ? { x: pointer.x, y: pointer.y } : null
}

export async function refreshPointer(): Promise<{ x: number; y: number } | null> {
  const services = nativeOverlayServices()
  if (!services) return null
  const over = services.overlayPointer?.()
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
    if (event.type === 'keyup') {
      suppressed.delete(event.code)
      if (virtualHeld.has(event.code)) {
        virtualHeld.delete(event.code)
        nativeOverlayServices()?.native.key(event.code, false)
      }
    }
    const keycode = evdevToUiohook(event.code)
    if (keycode === null) return
    // The native layer-shell shortcut backend already dispatched this key.
    // Emitting it again would double-fire the hotkey through the uiohook path.
    if (event.type === 'keydown' && nativeShortcutHandles(keycode)) return
    // Same shape as a uiohook event, so listeners see one format either way.
    const keyEvent: UiohookKeyboardEvent = {
      type: event.type === 'keydown' ? EventType.EVENT_KEY_PRESSED : EventType.EVENT_KEY_RELEASED,
      time,
      keycode,
      ...modifiers(),
    }
    emit(event.type, keyEvent)
    return
  }
  if (event.type === 'mousedown' || event.type === 'mouseup') {
    const button = BUTTONS.get(event.code)
    if (!button) return
    const at = lastPointer() ?? { x: 0, y: 0 }
    const mouseEvent: UiohookMouseEvent = {
      type: event.type === 'mousedown' ? EventType.EVENT_MOUSE_PRESSED : EventType.EVENT_MOUSE_RELEASED,
      time,
      button,
      clicks: 1,
      ...at,
      ...modifiers(),
    }
    emit(event.type, mouseEvent)
    return
  }
  if (event.type !== 'wheel' || listeners.wheel.length === 0) return
  const { delta, horizontal } = event
  const mods = modifiers()
  const wheel = (at: { x: number; y: number } | null): void => {
    const wheelEvent: UiohookWheelEvent = {
      type: EventType.EVENT_MOUSE_WHEEL,
      time,
      ...mods,
      ...(at ?? { x: 0, y: 0 }),
      clicks: 1,
      amount: 3,
      direction: horizontal ? WheelDirection.HORIZONTAL : WheelDirection.VERTICAL,
      rotation: -delta,
    }
    emit('wheel', wheelEvent)
  }
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
  nativeOverlayServices()?.native.key(code, pressed)
  if (pressed) virtualHeld.add(code)
  else virtualHeld.delete(code)
}

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

export function createLinuxInput(env: PlatformEnv): InputHook {
  const nativeWayland = env.platform === 'linux' && isNativeWayland(env.argv)
  return {
    on<K extends EventName>(event: K, listener: InputEvents[K]) {
      listeners[event].push(listener)
    },
    start() {
      const services = nativeOverlayServices()
      if (services) {
        backend = 'native'
        stopNative ??= services.native.listen(handleNative)
        if (!stopNative) {
          reportDiagnostic('native-input', new Error('The native overlay host is not running'))
          throw new Error('The native overlay host is not running')
        }
        return
      }
      attachUiohook()
      hook.start()
    },
    stop() {
      if (backend === 'native') {
        stopNative?.()
        stopNative = null
        releaseVirtual()
        held.clear()
        return
      }
      hook.stop()
    },
    keyTap(key, modifiersArg = []) {
      const services = nativeOverlayServices()
      if (services) {
        const preferred = explicitTool()
        const tool = preferred ? preferredTool(preferred) : null
        if (tool) {
          tapWithTool(tool, key)
          return
        }
        for (const mod of modifiersArg) pressNative(mod, true)
        pressNative(key, true)
        pressNative(key, false)
        for (const mod of [...modifiersArg].reverse()) pressNative(mod, false)
        return
      }
      const resolved = resolveExternalTool(nativeWayland)
      if (resolved === 'ydotool' || resolved === 'wtype') {
        tapWithTool(resolved, key)
        return
      }
      if (resolved === 'compositor') {
        for (const mod of modifiersArg) compositorKey(mod, true)
        compositorKey(key, true)
        compositorKey(key, false)
        for (const mod of [...modifiersArg].reverse()) compositorKey(mod, false)
        return
      }
      if (resolved === 'unavailable') return
      hook.keyTap(key, modifiersArg)
    },
    keyToggle(key, toggle) {
      const services = nativeOverlayServices()
      if (services) {
        const preferred = explicitTool()
        const tool = preferred ? preferredTool(preferred) : null
        if (tool) toggleWithTool(tool, key, toggle)
        else pressNative(key, toggle === 'down')
        return
      }
      const resolved = resolveExternalTool(nativeWayland)
      if (resolved === 'ydotool' || resolved === 'wtype') {
        toggleWithTool(resolved, key, toggle)
        return
      }
      if (resolved === 'compositor') {
        compositorKey(key, toggle === 'down')
        return
      }
      if (resolved === 'unavailable') return
      hook.keyToggle(key, toggle)
    },
    injectCombo(keys) {
      const services = nativeOverlayServices()
      if (services) {
        const preferred = explicitTool()
        const tool = preferred ? preferredTool(preferred) : null
        if (tool) return tapCombo(tool, keys)
        if (services.native.injectCombo) {
          const codes = keys.map(uiohookToEvdev).filter((code): code is number => code !== null)
          return Promise.resolve(services.native.injectCombo(codes))
        }
        // Native shortcut backend: use the host's virtual keyboard directly.
        const key = keys[keys.length - 1]
        for (const mod of keys.slice(0, -1)) pressNative(mod, true)
        pressNative(key, true)
        pressNative(key, false)
        for (const mod of keys.slice(0, -1).reverse()) pressNative(mod, false)
        return Promise.resolve()
      }
      const resolved = resolveExternalTool(nativeWayland)
      if (resolved === 'ydotool' || resolved === 'wtype') return tapCombo(resolved, keys)
      if (resolved === 'unavailable') return Promise.resolve()
      if (resolved === 'compositor') {
        // The host's virtual keyboard delivers each event through the
        // compositor; space them so PoE registers the modifier before the key.
        const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 25))
        return (async () => {
          const key = keys[keys.length - 1]
          for (const mod of keys.slice(0, -1)) {
            compositorKey(mod, true)
            await pause()
          }
          compositorKey(key, true)
          await pause()
          compositorKey(key, false)
          await pause()
          for (const mod of keys.slice(0, -1).reverse()) {
            compositorKey(mod, false)
            await pause()
          }
        })()
      }
      const key = keys[keys.length - 1]
      for (const mod of keys.slice(0, -1)) hook.keyToggle(mod, 'down')
      hook.keyTap(key)
      for (const mod of keys.slice(0, -1).reverse()) hook.keyToggle(mod, 'up')
      return Promise.resolve()
    },
    get holdsKeys() {
      // wtype's virtual keyboard lives only as long as one process call.
      const services = nativeOverlayServices()
      const explicit = explicitTool()
      const tool = services ? explicit && preferredTool(explicit) : resolveExternalTool(nativeWayland)
      return tool !== 'wtype'
    },
    get seesInjectedKeys() {
      if (nativeOverlayServices()) return backend !== 'native'
      return true
    },
    physicallyHeld(key) {
      if (backend !== 'native') return null
      const code = uiohookToEvdev(key)
      return code !== null && held.has(code)
    },
  }
}

/** @internal Test-only reset. */
export function __resetLinuxInputForTests(): void {
  stopNative?.()
  stopNative = null
  backend = null
  held.clear()
  virtualHeld.clear()
  suppressed.clear()
  pointer = null
  rawShortcutKeys.clear()
  lastResolvedTool = null
  for (const key of Object.keys(listeners) as EventName[]) listeners[key] = []
}
