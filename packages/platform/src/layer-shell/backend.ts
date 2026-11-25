import {
  adoptLayerWindow,
  getLayerPointer,
  getLayerWindow,
  LAYER_SHELL_WEB_PREFERENCES,
  layerShellUsable,
  OVERLAY_WINDOW_OPTS,
  OverlayController,
  probeWaylandHost,
  setLayerShortcutHandler,
  waylandClipboard,
  waylandNative,
} from 'electron-overlay-window'
import { controllerTracker } from '../controller'
import { electronClipboard } from '../electron'
import { electronGameWindowSource } from '../native/window-source'
import type { Backend, Clipboard } from '../types'
import { captureLayerShellGame } from './capture'
import { createLayerShellInput, evdevToKey } from './input'
import { NativeShortcuts } from './shortcuts'

/** Whether the app can run as a native Wayland client. Needs wlr-layer-shell
 *  v4 to keep overlays above a fullscreen game (every current Wayland desktop
 *  except GNOME), wlr-foreign-toplevel to find the game (KWin has none), and a
 *  virtual keyboard or a writable /dev/uinput to type into the game. Starts
 *  the layer-shell host to ask the compositor. */
export function layerShellSupported(): boolean {
  const features = probeWaylandHost()
  if (!features || !layerShellUsable(features) || !features.foreignToplevel) return false
  return features.virtualKeyboard || features.uinput
}

/** Chromium only sees the Wayland clipboard while one of its windows has
 *  keyboard focus, which is never the case while the game is in front, so text
 *  goes through the host's data-control connection where the compositor has it. */
function layerShellClipboard(): Clipboard {
  const text = () => (waylandClipboard.available() ? waylandClipboard : electronClipboard)
  return {
    ...electronClipboard,
    readText: () => text().readText(),
    readHTML: () => text().readHTML(),
    writeText: (value) => text().writeText(value),
    write: (data) => text().write(data),
    clear: () => text().clear(),
  }
}

/** A native Wayland client on a wlroots-style compositor: overlays are
 *  layer-shell surfaces, input comes from evdev, keys go out through a virtual
 *  keyboard or uinput, and nothing goes through XWayland. Null when the
 *  layer-shell host is unavailable. */
export function createLayerShellBackend(): Backend | null {
  if (!OverlayController.useLayerShell()) return null
  const input = createLayerShellInput(waylandNative, getLayerPointer)
  const shortcuts = new NativeShortcuts(input)
  setLayerShortcutHandler((key) =>
    shortcuts.dispatch(evdevToKey(key.code), {
      ctrlKey: key.mods.ctrl,
      shiftKey: key.mods.shift,
      altKey: key.mods.alt,
    }),
  )
  return {
    traits: { compositorFocus: false, inputRegions: true },
    input,
    shortcuts,
    clipboard: layerShellClipboard(),
    capture: {
      captureGame: captureLayerShellGame,
      gameWindowSource: (title) => electronGameWindowSource(title, true),
    },
    cursor: {
      screenPoint: input.lastPointer,
      trackerPoint: () => null,
      warpTo: (point) => {
        waylandNative.warpPointer(point)
      },
      refresh: async () => {
        await input.refreshPointer()
      },
    },
    windowTracker: controllerTracker({
      // The layer-shell tracker reports logical (DIP) bounds.
      gameBounds: () => {
        const tb = OverlayController.targetBounds
        if (!tb || tb.width <= 0 || tb.height <= 0) return null
        return { x: tb.x, y: tb.y, width: tb.width, height: tb.height }
      },
      attach: (win, titles) => OverlayController.attachByTitles(win, titles),
      focusOverlay: (win) => win.focus(),
      inputAllowed: () => true,
      overlayWindowOptions: () => ({ ...OVERLAY_WINDOW_OPTS }),
      adoptOverlay: () => {},
      overlayWebPreferences: (prefs) => ({ ...prefs, ...LAYER_SHELL_WEB_PREFERENCES }),
      adoptSurface: adoptLayerWindow,
      setInputRegion: (win, rects) => {
        if (win.isDestroyed()) return
        const zoom = win.webContents.getZoomFactor() || 1
        getLayerWindow(win)?.setInteractiveRects(
          rects.map((r) => ({ x: r.left * zoom, y: r.top * zoom, width: r.width * zoom, height: r.height * zoom })),
        )
      },
      beforeOverlayShow: () => {},
    }),
  }
}
