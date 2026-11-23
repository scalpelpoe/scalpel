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
import { LAYER_SELECT_ARG } from '@shared/contracts/overlay'
import { evdevToUiohook } from './input'
import { kwinKeyboardAvailable, kwinWaylandSession, sendKWinKey } from './kwin-input'
import { KWinTracker } from './kwin-tracker'
import { layerShellActive, setLayerShellServices } from './layer-shell-state'
import { NativeShortcuts } from './native-shortcuts'

export { layerShellActive }

/** Whether Scalpel should run as a native Wayland client. Needs wlr-layer-shell
 *  v4 to keep overlays above a fullscreen game (every current Wayland desktop
 *  except GNOME) and a way to type into the game: a virtual keyboard, or on
 *  KDE, whose KWin has none, ydotoold plus data-control for the clipboard.
 *  Otherwise Scalpel falls back to XWayland. */
export function waylandLayerShellSupported(): boolean {
  const features = probeWaylandHost()
  if (!layerShellUsable(features)) return false
  if (kwinWaylandSession()) return features?.dataControl === true && kwinKeyboardAvailable()
  return features?.virtualKeyboard === true
}

/** Starts the layer-shell overlay backend when Electron runs with
 *  `--ozone-platform=wayland`. Call once at startup, before any overlay
 *  window exists. */
export function initLayerShell(): boolean {
  if (process.platform !== 'linux' || app.commandLine.getSwitchValue('ozone-platform') !== 'wayland') return false
  const kde = kwinWaylandSession()
  if (kde && !waylandLayerShellSupported()) {
    console.warn('[layer-shell] KDE Wayland needs layer-shell v4, data-control and a running ydotoold')
    return false
  }
  // KWin lists no toplevels to other clients, so KDE tracks the game with a KWin script.
  let tracker: KWinTracker | undefined
  const createTracker = kde
    ? (titles: string[], emit: ConstructorParameters<typeof KWinTracker>[1]) =>
        (tracker = new KWinTracker(titles, emit))
    : undefined
  if (!OverlayController.useLayerShell(createTracker)) {
    console.warn('[layer-shell] Wayland host unavailable; overlays will not be shown')
    return false
  }
  if (kde) app.once('will-quit', () => tracker?.stop())
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
    overlayPointer: getLayerPointer,
    ...(kde
      ? {
          gameHasKeyboardFocus: () => tracker?.gameHasKeyboardFocus() ?? false,
          native: {
            ...waylandNative,
            key: (code: number, pressed: boolean) => {
              if (pressed && tracker?.gameHasKeyboardFocus() !== true) return false
              sendKWinKey(code, pressed)
              return true
            },
            probePointer: async () => tracker?.pointer() ?? null,
          },
        }
      : { native: waylandNative }),
  })
  return true
}

/** Web preferences for an overlay window: offscreen rendering under layer-shell. */
export function overlayWebPreferences(prefs: WebPreferences): WebPreferences {
  if (!layerShellActive()) return prefs
  return {
    ...prefs,
    ...LAYER_SHELL_WEB_PREFERENCES,
    // Offscreen rendering cannot show native <select> popups; the preload draws them.
    additionalArguments: [...(prefs.additionalArguments ?? []), LAYER_SELECT_ARG],
  }
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
