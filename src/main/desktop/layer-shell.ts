import { app, type BrowserWindow, type WebPreferences } from 'electron'
import {
  adoptLayerWindow,
  getLayerPointer,
  getLayerWindow,
  LAYER_SHELL_WEB_PREFERENCES,
  layerShellUsable,
  OverlayController,
  probeWaylandHost,
  setLayerShortcutHandler,
  waylandClipboard,
  waylandNative,
} from 'electron-overlay-window'
import { evdevToUiohook } from './input'
import { layerShellActive, setLayerShellServices } from './layer-shell-state'
import { NativeShortcuts } from './native-shortcuts'

export { layerShellActive }

/** Whether Scalpel should run as a native Wayland client. Needs wlr-layer-shell
 *  v4 to keep overlays above a fullscreen game (every current Wayland desktop
 *  except GNOME) and a virtual keyboard to type into the game (KWin has none).
 *  Otherwise Scalpel falls back to XWayland. */
export function waylandLayerShellSupported(): boolean {
  const features = probeWaylandHost()
  return layerShellUsable(features) && features?.virtualKeyboard === true
}

/** Starts the layer-shell overlay backend when Electron runs with
 *  `--ozone-platform=wayland`. Call once at startup, before any overlay
 *  window exists. */
export function initLayerShell(): boolean {
  if (process.platform !== 'linux' || app.commandLine.getSwitchValue('ozone-platform') !== 'wayland') return false
  if (!OverlayController.useLayerShell()) {
    console.warn('[layer-shell] Wayland host unavailable; overlays will not be shown')
    return false
  }
  const shortcuts = new NativeShortcuts()
  setLayerShortcutHandler((key) =>
    shortcuts.dispatch(evdevToUiohook(key.code), {
      ctrlKey: key.mods.ctrl,
      shiftKey: key.mods.shift,
      altKey: key.mods.alt,
    }),
  )
  setLayerShellServices({
    clipboard: waylandClipboard,
    globalShortcut: shortcuts,
    native: waylandNative,
    overlayPointer: getLayerPointer,
  })
  return true
}

/** Web preferences for an overlay window: offscreen rendering under layer-shell. */
export function overlayWebPreferences(prefs: WebPreferences): WebPreferences {
  return layerShellActive() ? { ...prefs, ...LAYER_SHELL_WEB_PREFERENCES } : prefs
}

/** Presents a new overlay window as a layer surface. Call right after
 *  construction, before wrapping its show/hide methods. */
export function adoptOverlayWindow(win: BrowserWindow): void {
  if (layerShellActive()) adoptLayerWindow(win)
}

/** Areas of a click-through overlay that still accept the pointer, in the
 *  window's CSS pixels. */
export function setOverlayInputRects(
  win: BrowserWindow,
  rects: ReadonlyArray<{ left: number; top: number; width: number; height: number }>,
): void {
  if (!layerShellActive() || win.isDestroyed()) return
  const zoom = win.webContents.getZoomFactor() || 1
  getLayerWindow(win)?.setInteractiveRects(
    rects.map((r) => ({ x: r.left * zoom, y: r.top * zoom, width: r.width * zoom, height: r.height * zoom })),
  )
}
