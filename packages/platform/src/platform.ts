import { type ControllerState, controllerTracker } from './common/controller'
import { reportBreadcrumb } from './common/diagnostics'
import { electronClipboard } from './common/electron'
import { uiohookInput } from './common/input'
import { createLinuxClipboard } from './linux/common/clipboard'
import { isNativeWayland } from './linux/common/display'
import { createLinuxInput } from './linux/common/input'
import { platformShortcuts } from './linux/common/global-shortcuts'
import { createLayerShellBackend } from './linux/common/layer-shell/backend'
import { nativeOverlayBackendId } from './linux/common/native-overlay'
import { linuxRegularWindowMode } from './linux/common/layer-shell/windowing'
import { createRegularWindowBackend } from './linux/common/regular-window/backend'
import { createLinuxDesktopBackend, readLinuxDesktopVersion } from './linux/desktops'
import { createOverlayWindowBackend, type OverlayWindowBackendId } from './overlay-window-backend'
import { isElevated as windowsIsElevated } from './ms-windows/elevation'
import { currentEnv, detectOperatingSystem, selectBackend } from './select'
import type {
  Backend,
  BackendId,
  BackendServices,
  Clipboard,
  GlobalShortcuts,
  InputHook,
  Platform,
  WindowTracker,
} from './types'

let selected: { id: BackendId; backend: Backend } | null = null

/** Selects the backend on first use. Compositor verification runs a subprocess
 *  and the compositor cannot change underneath a running process. */
function active(): { id: BackendId; backend: Backend } {
  if (selected) return selected
  // Boot registers the native overlay before feature code calls the facade, so
  // layer-shell wins over the X11 fallback without changing OS detection.
  const overlayId = nativeOverlayBackendId()
  if (linuxRegularWindowMode()) {
    selected = { id: 'window', backend: createRegularWindowBackend() }
  } else if (overlayId === 'layer-shell' || overlayId === 'kwin-layer-shell') {
    selected = { id: overlayId, backend: createLayerShellBackend() }
  } else {
    const id = selectBackend(currentEnv(), readLinuxDesktopVersion)
    const desktopBackend = createLinuxDesktopBackend(id)
    selected = desktopBackend
      ? { id, backend: desktopBackend }
      : // selectBackend only returns an overlay id when the desktop has no
        // backend of its own (windows/macos/x11).
        { id, backend: createOverlayWindowBackend(id as OverlayWindowBackendId) }
  }
  reportBreadcrumb(`platform backend selected id=${selected.id} native=${overlayId ?? '-'}`, 'debug')
  return selected
}

const backend = (): Backend => active().backend

// An explicit native-Wayland Ozone flag is a deliberate opt-in. Until a
// settings-backed backend selection exists, that is the only case where the
// default clipboard leaves Electron; a backend override still wins.
const bootEnv = currentEnv()
const bootOs = detectOperatingSystem(bootEnv)
const nativeWaylandClipboard =
  bootEnv.platform === 'linux' && isNativeWayland(bootEnv.argv) ? createLinuxClipboard(bootEnv) : null
const linuxInput = bootEnv.platform === 'linux' ? createLinuxInput(bootEnv) : null

const sharedServices: BackendServices = {
  input: linuxInput ?? uiohookInput,
  // Stable Linux-aware delegate. Electron remains the implementation on X11,
  // macOS and Windows; a backend can still override it through `services`.
  shortcuts: platformShortcuts,
  clipboard: nativeWaylandClipboard ?? electronClipboard,
}

/** Resolves on use, so a backend can replace a service without forcing the
 *  facade's service objects to be getters that select a backend on access. */
const service = <K extends keyof BackendServices>(key: K): BackendServices[K] =>
  backend().services?.[key] ?? sharedServices[key]

/** Stable delegates. Destructuring them at import time, as the app does, does
 *  not select a backend; the first method call resolves it. */
const input: InputHook = {
  on: (event, listener) => service('input').on(event, listener),
  start: () => service('input').start(),
  stop: () => service('input').stop(),
  keyTap: (key, modifiers) => service('input').keyTap(key, modifiers),
  keyToggle: (key, state) => service('input').keyToggle(key, state),
  injectCombo: (keys) => service('input').injectCombo?.(keys) ?? Promise.resolve(),
  get seesInjectedKeys() {
    return service('input').seesInjectedKeys
  },
  physicallyHeld: (key) => service('input').physicallyHeld(key),
}

const shortcuts: GlobalShortcuts = {
  register: (accelerator, callback) => service('shortcuts').register(accelerator, callback),
  unregister: (accelerator) => service('shortcuts').unregister(accelerator),
  unregisterAll: () => service('shortcuts').unregisterAll(),
  isRegistered: (accelerator) => service('shortcuts').isRegistered(accelerator),
}

const clipboard: Clipboard = {
  readText: () => service('clipboard').readText(),
  readHTML: () => service('clipboard').readHTML(),
  writeText: (text) => service('clipboard').writeText(text),
  write: (data) => service('clipboard').write(data),
  clear: () => service('clipboard').clear(),
  read: (format) => service('clipboard').read(format),
  readBuffer: (format) => service('clipboard').readBuffer(format),
  readImage: () => service('clipboard').readImage(),
}

/** Every tracker method routes through the selected backend. The controller's
 *  X11 defaults for focus, activation and titles dereference a null xcb
 *  connection on native Wayland and crash the process. Typed without the
 *  controller defaults, so a method missing here is a compile error. */
const trackerMethods: Omit<WindowTracker, ControllerState> = {
  gameBounds: (win) => backend().windowTracker.gameBounds(win),
  attach: (win, titles) => backend().windowTracker.attach(win, titles),
  setTargetTitles: (titles) => backend().windowTracker.setTargetTitles(titles),
  focusTarget: () => backend().windowTracker.focusTarget(),
  activateOverlay: () => backend().windowTracker.activateOverlay(),
  focusOverlay: (win) => backend().windowTracker.focusOverlay(win),
  inputAllowed: () => backend().windowTracker.inputAllowed(),
  overlayWindowOptions: () => backend().windowTracker.overlayWindowOptions(),
  adoptOverlay: (win) => backend().windowTracker.adoptOverlay(win),
  setInputRects: (win, rects) => backend().windowTracker.setInputRects(win, rects),
  beforeOverlayShow: (win, gameTitle) => backend().windowTracker.beforeOverlayShow(win, gameTitle),
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
    // Forwarded so host code can stay backend-id agnostic: a window-local
    // backend manages its own focus, click-through and visibility instead of
    // relying on the native tracker.
    get windowLocal() {
      return backend().traits.windowLocal === true
    },
  },
  input,
  shortcuts,
  clipboard,
  capture: {
    captureGame: (opts) => backend().capture.captureGame(opts),
    gameWindowSource: (title) => backend().capture.gameWindowSource(title),
  },
  cursor: {
    screenPoint: () => backend().cursor.screenPoint(),
    trackerPoint: () => backend().cursor.trackerPoint(),
    warpTo: (point) => backend().cursor.warpTo(point),
  },
  // Every backend reports the game window through electron-overlay-window's
  // controller, so its events and target state never select a backend.
  windowTracker: controllerTracker(trackerMethods),
  // The Windows admin check is inert on every other OS: it is not called at
  // all there, so no `net session` subprocess is started on Linux or macOS.
  isElevated: () => (bootOs === 'windows' ? windowsIsElevated() : false),
}

/** The platform integration for this process. */
export function platform(): Platform {
  return facade
}
