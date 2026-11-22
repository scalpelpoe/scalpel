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
import { kwinKeyboardAvailable, kwinWaylandSession, sendKWinKey } from './kwin-input'
import { KWinTracker } from './kwin-tracker'
import { layerShellActive, setLayerShellServices } from './layer-shell-state'
import { NativeShortcuts } from './native-shortcuts'

export { layerShellActive }

/** KDE needs layer-shell for overlays, data-control for clipboard access,
 * and ydotoold for keyboard input. */
export function waylandLayerShellSupported(): boolean {
  if (!kwinWaylandSession()) return false
  const features = probeWaylandHost()
  return layerShellUsable(features) && features?.dataControl === true && kwinKeyboardAvailable()
}

/** Call before any overlay window exists. */
export function initLayerShell(): boolean {
  if (!kwinWaylandSession() || app.commandLine.getSwitchValue('ozone-platform') !== 'wayland') return false
  if (!waylandLayerShellSupported()) {
    console.warn('[layer-shell] KDE Wayland needs layer-shell v4, data-control and a running ydotoold')
    return false
  }
  let tracker: KWinTracker | undefined
  if (!OverlayController.useLayerShell((titles, emit) => (tracker = new KWinTracker(titles, emit)))) {
    console.warn('[layer-shell] Wayland host unavailable; overlays will not be shown')
    return false
  }
  app.once('will-quit', () => tracker?.stop())
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
    gameHasKeyboardFocus: () => tracker?.gameHasKeyboardFocus() ?? false,
    native: {
      ...waylandNative,
      key: (code, pressed) => {
        if (pressed && tracker?.gameHasKeyboardFocus() !== true) return false
        sendKWinKey(code, pressed)
        return true
      },
      probePointer: async () => tracker?.pointer() ?? null,
    },
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
