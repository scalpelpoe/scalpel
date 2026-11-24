import { execFileSync } from 'node:child_process'
import { controllerTracker } from './controller'
import { electronClipboard, electronShortcuts } from './electron'
import { isElevated } from './elevation'
import { createHyprlandBackend } from './hyprland/backend'
import { uiohookInput } from './input'
import { createLayerShellBackend } from './layer-shell/backend'
import { createNativeBackend } from './native/backend'
import { currentEnv, selectBackend } from './select'
import type { Backend, BackendId, Clipboard, GlobalShortcuts, InputEvents, InputHook, Platform } from './types'

let selected: { id: BackendId; backend: Backend } | null = null

/** Selects the backend on first use. The Hyprland check runs a subprocess and
 *  the compositor cannot change underneath a running process. */
function active(): { id: BackendId; backend: Backend } {
  if (selected) return selected
  const id = selectBackend(currentEnv(), () =>
    execFileSync('hyprctl', ['-j', 'version'], { encoding: 'utf8', timeout: 1000 }),
  )
  selected = create(id)
  forwardInput(selected.backend.input ?? uiohookInput)
  return selected
}

function create(id: BackendId): { id: BackendId; backend: Backend } {
  if (id === 'hyprland') return { id, backend: createHyprlandBackend() }
  if (id !== 'layer-shell') return { id, backend: createNativeBackend(id) }
  const backend = createLayerShellBackend()
  if (backend) return { id, backend }
  console.warn('[layer-shell] Wayland host unavailable; overlays will not be shown')
  return { id: 'x11', backend: createNativeBackend('x11') }
}

const backend = (): Backend => active().backend
const input = (): InputHook => backend().input ?? uiohookInput
const shortcuts = (): GlobalShortcuts => backend().shortcuts ?? electronShortcuts
const clipboard = (): Clipboard => backend().clipboard ?? electronClipboard

type InputListeners = { [K in keyof InputEvents]: InputEvents[K][] }

/** Listeners registered before a backend is selected, so subscribing at
 *  import time does not select one. */
const inputListeners: InputListeners = {
  keydown: [],
  keyup: [],
  mousedown: [],
  mouseup: [],
  mousemove: [],
  wheel: [],
}

function forwardInput(hook: InputHook): void {
  hook.on('keydown', (event) => {
    for (const listener of inputListeners.keydown) listener(event)
  })
  hook.on('keyup', (event) => {
    for (const listener of inputListeners.keyup) listener(event)
  })
  hook.on('mousedown', (event) => {
    for (const listener of inputListeners.mousedown) listener(event)
  })
  hook.on('mouseup', (event) => {
    for (const listener of inputListeners.mouseup) listener(event)
  })
  hook.on('mousemove', (event) => {
    for (const listener of inputListeners.mousemove) listener(event)
  })
  hook.on('wheel', (event) => {
    for (const listener of inputListeners.wheel) listener(event)
  })
}

const subscribe: { [K in keyof InputEvents]: (listener: InputEvents[K]) => void } = {
  keydown: (listener) => inputListeners.keydown.push(listener),
  keyup: (listener) => inputListeners.keyup.push(listener),
  mousedown: (listener) => inputListeners.mousedown.push(listener),
  mouseup: (listener) => inputListeners.mouseup.push(listener),
  mousemove: (listener) => inputListeners.mousemove.push(listener),
  wheel: (listener) => inputListeners.wheel.push(listener),
}

/** Stable views of the active backend. Holding or destructuring them does not
 *  select a backend; the first call through one does. */
const facade: Platform = {
  get id() {
    return active().id
  },
  traits: {
    get compositorFocus() {
      return backend().traits.compositorFocus
    },
    get inputRegions() {
      return backend().traits.inputRegions
    },
  },
  input: {
    on: (event, listener) => subscribe[event](listener),
    start: () => input().start(),
    stop: () => input().stop(),
    keyTap: (key, modifiers) => input().keyTap(key, modifiers),
    keyToggle: (key, state) => input().keyToggle(key, state),
    get seesInjectedKeys() {
      return input().seesInjectedKeys
    },
    physicallyHeld: (key) => input().physicallyHeld(key),
  },
  shortcuts: {
    register: (accelerator, callback) => shortcuts().register(accelerator, callback),
    unregister: (accelerator) => shortcuts().unregister(accelerator),
    unregisterAll: () => shortcuts().unregisterAll(),
    isRegistered: (accelerator) => shortcuts().isRegistered(accelerator),
  },
  clipboard: {
    readText: () => clipboard().readText(),
    readHTML: () => clipboard().readHTML(),
    writeText: (text) => clipboard().writeText(text),
    write: (data) => clipboard().write(data),
    clear: () => clipboard().clear(),
    read: (format) => clipboard().read(format),
    readBuffer: (format) => clipboard().readBuffer(format),
    readImage: () => clipboard().readImage(),
  },
  capture: {
    captureGame: (opts) => backend().capture.captureGame(opts),
    gameWindowSource: (title) => backend().capture.gameWindowSource(title),
  },
  cursor: {
    screenPoint: () => backend().cursor.screenPoint(),
    trackerPoint: () => backend().cursor.trackerPoint(),
    warpTo: (point) => backend().cursor.warpTo(point),
    refresh: () => backend().cursor.refresh(),
  },
  // Every backend reports the game window through electron-overlay-window's
  // controller, so its events and target state never select a backend.
  windowTracker: controllerTracker({
    gameBounds: (win) => backend().windowTracker.gameBounds(win),
    attach: (win, titles) => backend().windowTracker.attach(win, titles),
    focusOverlay: (win) => backend().windowTracker.focusOverlay(win),
    inputAllowed: () => backend().windowTracker.inputAllowed(),
    overlayWindowOptions: () => backend().windowTracker.overlayWindowOptions(),
    adoptOverlay: (win) => backend().windowTracker.adoptOverlay(win),
    overlayWebPreferences: (prefs) => backend().windowTracker.overlayWebPreferences(prefs),
    adoptSurface: (win) => backend().windowTracker.adoptSurface(win),
    setInputRegion: (win, rects) => backend().windowTracker.setInputRegion(win, rects),
    beforeOverlayShow: (win, gameTitle) => backend().windowTracker.beforeOverlayShow(win, gameTitle),
  }),
  isElevated,
}

/** The platform integration for this process. */
export function platform(): Platform {
  return facade
}
