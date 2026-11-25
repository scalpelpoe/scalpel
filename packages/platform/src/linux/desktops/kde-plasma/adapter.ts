import type { HostFeatures } from 'electron-overlay-window'
import type {
  LayerShellIntegration,
  LayerShellProbeFailure,
  LinuxDesktopAdapter,
} from '@platform/linux/common/layer-shell/adapter'
import { setCompositorFocusSource } from '@platform/linux/common/wayland/focus-cache'
import { startKWinFocusTracking } from './focus'
import { injectKWinCombo, sendKWinKey } from './input'
import { kwinKeyboardAvailable } from './support'
import { KWinTracker } from './tracker'

/** The active KWin tracker. KWin exposes no virtual keyboard, so input and the
 *  pointer read its scripting bridge instead of the generic host. */
let tracker: KWinTracker | null = null

function requirements(features: HostFeatures, context: { keyboardAvailable?: boolean }): LayerShellProbeFailure | null {
  if (!features.dataControl) {
    return {
      reasonKey: 'settings_linux_layer_shell_clipboard_unavailable',
      reason: 'Wayland data-control is unavailable',
    }
  }
  if (!(context.keyboardAvailable ?? kwinKeyboardAvailable())) {
    return {
      reasonKey: 'settings_linux_layer_shell_input_unavailable',
      reason: 'ydotoold is not reachable for KDE keyboard input',
    }
  }
  return null
}

const layerShell: LayerShellIntegration = {
  backendId: 'kwin-layer-shell',
  // The KWin script owns the shared focus cache; the zwlr reader must not start
  // and the layer surface's own focus events are handled by the script snapshot.
  claimsFocusCache: true,
  tracksLayerSurfaceFocus: false,
  requirements,
  claimFocusSource: () => setCompositorFocusSource(true),
  releaseFocusSource: () => setCompositorFocusSource(false),
  createTracker: ({ titles, emit }) => {
    tracker = new KWinTracker(titles, emit)
    return tracker
  },
  gameHasKeyboardFocus: () => tracker?.gameHasKeyboardFocus() ?? false,
  input: (base) => ({
    ...base,
    // KDE has no virtual keyboard. Drop presses once focus has moved, but
    // always deliver releases so a key cannot stay held.
    key: (code, pressed) => {
      if (pressed && tracker?.gameHasKeyboardFocus() !== true) return false
      sendKWinKey(code, pressed)
      return true
    },
    injectCombo: (codes) => injectKWinCombo(codes),
    probePointer: async () => tracker?.pointer() ?? null,
    warpPointer: () => false,
  }),
  features: (base) => ({
    ...base,
    // KWin has no wlr-screencopy and its desktopCapturer sources would open an
    // interactive picker; pointer position comes from the script instead.
    screencopy: false,
    cursorRefresh: false,
    ydotoolInput: true,
    desktopCapturerSourcePickerUnsafe: true,
  }),
  stop: () => {
    tracker?.stop()
    tracker = null
  },
}

export const kwinDesktopAdapter: LinuxDesktopAdapter = {
  desktop: 'kde-plasma',
  defaults: { windowingMode: 'layer-shell' },
  layerShell,
  startFocusTracking: startKWinFocusTracking,
}
