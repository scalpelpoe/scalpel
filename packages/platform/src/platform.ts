import { execFileSync } from 'node:child_process'
import { controllerTracker } from './controller'
import { electronClipboard, electronShortcuts } from './electron'
import { isElevated } from './elevation'
import { createHyprlandBackend } from './hyprland/backend'
import { uiohookInput } from './input'
import { createNativeBackend } from './native/backend'
import { currentEnv, selectBackend } from './select'
import type { Backend, BackendId, Platform } from './types'

let selected: { id: BackendId; backend: Backend } | null = null

/** Selects the backend on first use. The Hyprland check runs a subprocess and
 *  the compositor cannot change underneath a running process. */
function active(): { id: BackendId; backend: Backend } {
  if (selected) return selected
  const id = selectBackend(currentEnv(), () =>
    execFileSync('hyprctl', ['-j', 'version'], { encoding: 'utf8', timeout: 1000 }),
  )
  selected = { id, backend: id === 'hyprland' ? createHyprlandBackend() : createNativeBackend(id) }
  return selected
}

const backend = (): Backend => active().backend

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
  },
  input: uiohookInput,
  shortcuts: electronShortcuts,
  clipboard: electronClipboard,
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
  windowTracker: controllerTracker({
    gameBounds: (win) => backend().windowTracker.gameBounds(win),
    attach: (win, titles) => backend().windowTracker.attach(win, titles),
    focusOverlay: (win) => backend().windowTracker.focusOverlay(win),
    inputAllowed: () => backend().windowTracker.inputAllowed(),
    overlayWindowOptions: () => backend().windowTracker.overlayWindowOptions(),
    adoptOverlay: (win) => backend().windowTracker.adoptOverlay(win),
    beforeOverlayShow: (win, gameTitle) => backend().windowTracker.beforeOverlayShow(win, gameTitle),
  }),
  isElevated,
}

/** The platform integration for this process. */
export function platform(): Platform {
  return facade
}
