import { type BrowserWindow, app, desktopCapturer } from 'electron'
import {
  adoptLayerWindow,
  getLayerPointer,
  getLayerWindow,
  LAYER_SHELL_WEB_PREFERENCES,
  OVERLAY_WINDOW_OPTS,
  OverlayController,
  waylandClipboard,
  waylandNative,
} from 'electron-overlay-window'
import { WaylandHost } from 'electron-overlay-window/dist/wayland/host'
import { reportBreadcrumb, reportDiagnostic } from '../../../common/diagnostics'
import { controllerTracker } from '../../../common/controller'
import { matchGameWindowSource } from '../../../common/electron-window-source'
import type { Backend } from '../../../types'
import { lastPointer } from '../native-input'
import {
  adoptOverlayWindow,
  nativeOverlayFeature,
  nativeOverlayServices,
  overlayGameHasKeyboardFocus,
  registerNativeOverlayBackend,
  setOverlayInputRects,
  unregisterNativeOverlayBackend,
  type NativeOverlayFeatures,
  type NativeOverlayServices,
} from '../native-overlay'
import type { LinuxDesktopAdapter, LayerShellTrackerContext } from './adapter'
import { captureLayerShellGame } from './capture'
import { createDefaultLayerShellTracker } from './default-tracker'
import { NativeLayerShortcuts, setNativeLayerShortcutHandler } from './native-shortcuts'
import { probeAndReportLinuxLayerShellSupport, type LinuxLayerShellSupport } from './support'
import { hasFocusedLayerWindow, onLayerFocusChange } from 'electron-overlay-window/dist/wayland/layer-window'
import { setLayerSurfaceFocus } from '../wayland/focus'

export interface LinuxLayerShellBackendOptions {
  /** Capability already probed by boot; avoids a second helper round-trip. */
  support?: LinuxLayerShellSupport
  /** Desktop adapter resolved by boot. Absent means the generic wlr behavior. */
  adapter?: LinuxDesktopAdapter
  /** Render in-page select popups. Requires the preload helper in the host. */
  selectPopups?: boolean
  screencopy?: boolean
  cursorRefresh?: boolean
}

const DEFAULT_OPTIONS = {
  selectPopups: false,
  screencopy: true,
  cursorRefresh: true,
}

/** Backend used by the neutral `platform()` facade while a layer-shell overlay
 *  is active. All compositor geometry stays in logical DIP; no X11 conversion
 *  crosses this boundary. */
export function createLayerShellBackend(): Backend {
  return {
    traits: { compositorFocus: true },
    capture: {
      captureGame: (opts) => captureLayerShellGame(opts?.skipFocusGate ?? false, opts?.title),
      gameWindowSource: async (title) => {
        // A compositor that exposes no screencopy but does expose unnamed
        // desktopCapturer sources would open an interactive picker on every
        // request; there is no source to return safely.
        if (nativeOverlayFeature('desktopCapturerSourcePickerUnsafe') && !nativeOverlayFeature('screencopy')) {
          return null
        }
        const tb = OverlayController.targetBounds
        if (!tb?.width || !tb.height) return null
        try {
          const sources = await desktopCapturer.getSources({
            types: ['window'],
            thumbnailSize: { width: 1, height: 1 },
          })
          const sourceId = matchGameWindowSource(sources, title)
          if (!sourceId) return null
          return { sourceId, gameSize: { w: tb.width, h: tb.height } }
        } catch (error) {
          reportDiagnostic('layer-shell:game-source', error)
          return null
        }
      },
    },
    cursor: {
      screenPoint: () => lastPointer(),
      trackerPoint: () => lastPointer(),
      warpTo: (point) => {
        nativeOverlayServices()?.native.warpPointer(point)
      },
    },
    windowTracker: controllerTracker({
      gameBounds: () => {
        const tb = OverlayController.targetBounds
        if (!tb?.width || !tb.height) return null
        return { x: tb.x, y: tb.y, width: tb.width, height: tb.height }
      },
      attach: (win, titles) => OverlayController.attachByTitles(win, titles),
      focusOverlay: (win) => win.focus(),
      inputAllowed: () => OverlayController.targetHasFocus || overlayGameHasKeyboardFocus(),
      overlayWindowOptions: () => ({
        ...OVERLAY_WINDOW_OPTS,
        webPreferences: {
          ...LAYER_SHELL_WEB_PREFERENCES,
          additionalArguments: [...(nativeOverlayServices()?.additionalArguments ?? [])],
        },
      }),
      adoptOverlay: (win) => adoptOverlayWindow(win),
      setInputRects: (win, rects) => setOverlayInputRects(win, rects),
      beforeOverlayShow: () => {},
    }),
  }
}

/**
 * Initialize the generic wlr-layer-shell overlay backend. Must run before the
 * first overlay BrowserWindow exists. Returns false without leaving a
 * half-registered facade; switching the addon into layer-shell mode is the only
 * irreversible step and therefore happens last.
 */
export function initLinuxLayerShellBackend(options: LinuxLayerShellBackendOptions = {}): boolean {
  const ozone = app.commandLine.getSwitchValue('ozone-platform')
  if (ozone !== 'wayland') {
    reportBreadcrumb(`layer-shell init failed ozone-platform="${ozone}"`)
    return false
  }

  const support = options.support ?? probeAndReportLinuxLayerShellSupport(undefined, { adapter: options.adapter })
  if (!support.available) {
    reportBreadcrumb(`layer-shell init failed reason="${support.reason ?? ''}"`)
    return false
  }

  const settings = { ...DEFAULT_OPTIONS, ...options }
  const integration = options.adapter?.layerShell
  const backendId = support.backendId ?? integration?.backendId ?? 'layer-shell'
  // Generic Wayland cannot read another client's absolute geometry. The desktop
  // adapter owns compositor-specific sources; this backend only sees the
  // generic provider contract.
  const geometryProviders = options.adapter?.geometryProviders?.() ?? []
  const createTracker =
    integration?.createTracker ?? ((context: LayerShellTrackerContext) => createDefaultLayerShellTracker(context))
  let shortcuts: NativeLayerShortcuts | null = null
  let offLayerFocus: (() => void) | null = null
  const rollback = (): void => {
    setNativeLayerShortcutHandler(null)
    shortcuts?.dispose()
    shortcuts = null
    integration?.stop?.()
    offLayerFocus?.()
    offLayerFocus = null
    setLayerSurfaceFocus(false)
    integration?.releaseFocusSource?.()
    unregisterNativeOverlayBackend()
  }

  try {
    shortcuts = new NativeLayerShortcuts()
    setNativeLayerShortcutHandler(shortcuts)
    // Adapters that own the shared focus cache claim it now, so an early
    // `readWaylandGameFocus()` cannot start the generic reader first.
    integration?.claimFocusSource?.()

    const baseFeatures: NativeOverlayFeatures = {
      screencopy: settings.screencopy,
      cursorRefresh: settings.cursorRefresh,
      selectPopups: settings.selectPopups,
      ydotoolInput: false,
      desktopCapturerSourcePickerUnsafe: false,
    }
    const services: NativeOverlayServices = {
      id: backendId,
      webPreferences: LAYER_SHELL_WEB_PREFERENCES,
      additionalArguments: settings.selectPopups ? ['--scalpel-layer-select'] : [],
      adoptWindow(win: BrowserWindow): void {
        adoptLayerWindow(win)
        const layer = getLayerWindow(win)
        const bounds = win.getBounds()
        reportBreadcrumb(
          `layer-shell window adopted sid=${layer?.sid ?? '-'} ` +
            `bounds=${bounds.x},${bounds.y} ${bounds.width}x${bounds.height}`,
          'debug',
        )
      },
      setInputRects(win: BrowserWindow, rects): void {
        if (win.isDestroyed()) return
        const zoom = win.webContents.getZoomFactor() || 1
        getLayerWindow(win)?.setInteractiveRects(
          rects.map((rect) => ({
            x: rect.left * zoom,
            y: rect.top * zoom,
            width: rect.width * zoom,
            height: rect.height * zoom,
          })),
        )
      },
      clipboard: waylandClipboard,
      globalShortcut: shortcuts,
      // A desktop adapter that knows the game's real focus (KWin's script)
      // replaces this; the generic reader keeps the controller's answer.
      gameHasKeyboardFocus: integration?.gameHasKeyboardFocus ?? (() => OverlayController.targetHasFocus),
      native: integration?.input ? integration.input(waylandNative) : waylandNative,
      overlayPointer: getLayerPointer,
      boundsAreLogical: true,
      features: integration?.features?.(baseFeatures) ?? baseFeatures,
    }
    registerNativeOverlayBackend(services)

    const started = OverlayController.useLayerShell((titles, emit) =>
      createTracker({ titles, emit, geometryProviders }),
    )
    if (!started) {
      rollback()
      reportBreadcrumb('layer-shell init failed Wayland host unavailable')
      return false
    }
    // The host is spawned by useLayerShell and reports its outputs
    // asynchronously. Wait for the first report so this diagnostic carries the
    // real output list instead of always logging [].
    const host = WaylandHost.get()
    if (host) {
      void host
        .ready()
        .then(() => {
          reportBreadcrumb(`layer-shell init hostOutputs=${JSON.stringify(host.outputs ?? [])}`, 'debug')
        })
        .catch(() => {})
    }
    if (integration?.stop) app.once('will-quit', () => integration.stop?.())
    if (integration?.tracksLayerSurfaceFocus !== false) {
      // The zwlr reader cannot see layer surfaces. Track whether one of ours
      // owns the keyboard so "no activated toplevel" is not read as a blur.
      const syncLayerFocus = (): void => setLayerSurfaceFocus(hasFocusedLayerWindow())
      offLayerFocus = onLayerFocusChange(syncLayerFocus)
      syncLayerFocus()
    }
    shortcuts.startRawInput()
    reportBreadcrumb(`layer-shell init ready backend=${backendId}`)
    return true
  } catch (error) {
    rollback()
    reportDiagnostic('layer-shell:init', error)
    reportBreadcrumb(`layer-shell init failed exception=${String(error)}`)
    return false
  }
}
