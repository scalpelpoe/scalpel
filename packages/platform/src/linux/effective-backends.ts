import { PLATFORM_SETTING_IDS } from '../common/platform-settings'
import type { PlatformWindowingMode } from '../common/platform-settings'
import { currentEnv, detectDesktopEnvironment, detectOperatingSystem, type DesktopEnvironment } from '../select'
import type { PlatformEnv } from '../types'
import { linuxCompositorClipboardAvailable } from './common/clipboard'
import { toLinuxClipboardBackend, type LinuxClipboardBackend } from './common/clipboard-backend'
import { effectiveLinuxDisplayMode, isNativeWayland, toLinuxDisplayMode } from './common/display'
import {
  evdevKeyboardsReadable,
  resolveLinuxShortcutBackend,
  toLinuxShortcutBackend,
  type LinuxShortcutBackend,
} from './common/global-shortcuts'
import { toLinuxInputBackend, type LinuxInputBackend } from './common/input-backend'
import { nativeOverlayActive } from './common/native-overlay'
import {
  defaultLinuxLayerShellCapability,
  resolveLinuxWindowingMode,
  toLinuxWindowingMode,
} from './common/layer-shell/windowing'
import { resolveLinuxClipboardBackend, resolveLinuxInputBackend, toLinuxDesktopPreference } from './linux-settings'
import { linuxDesktopDefaults } from './settings-rules'

export interface LinuxEffectiveBackendsSnapshot {
  platform: 'linux'
  nativeWayland: boolean
  displayMode: 'x11' | 'wayland'
  /** Persisted selector value; `displayMode` is what this process runs. */
  savedDisplayMode: 'x11' | 'wayland'
  windowing: {
    preference: PlatformWindowingMode
    resolved: string
    layerShellAvailable: boolean
    layerShellReasonKey?: string
    nativeOverlayBackendId?: string
  }
  shortcuts: { preference: LinuxShortcutBackend; resolved: string }
  clipboard: { preference: LinuxClipboardBackend; resolved: string }
  input: { preference: LinuxInputBackend; resolved: string }
}

/** Diagnostic snapshot of resolved Linux backends for the current/new model.
 *  Uses the same resolvers as platform settings. */
export function resolveLinuxEffectiveBackendsSnapshot(
  input: {
    env?: PlatformEnv
    desktopEnvironment?: unknown
    detectedDesktop?: DesktopEnvironment
    windowingMode?: unknown
    shortcutBackend?: unknown
    clipboardBackend?: unknown
    inputBackend?: unknown
    displayMode?: unknown
  } = {},
): LinuxEffectiveBackendsSnapshot | null {
  const env = input.env ?? currentEnv()
  if (detectOperatingSystem(env) !== 'linux') return null

  const nativeWayland = isNativeWayland(env.argv)
  // An explicit launch flag describes the process even when the saved
  // preference differs; diagnostics must report what is actually running.
  const displayMode = effectiveLinuxDisplayMode(input.displayMode, env.argv)
  const savedDisplayMode = toLinuxDisplayMode(input.displayMode)

  const windowingPreference = toLinuxWindowingMode(input.windowingMode)
  const layerShell = defaultLinuxLayerShellCapability()
  // Auto resolves through the same desktop defaults map as the settings view,
  // so the diagnostic snapshot cannot disagree with the selector.
  const selectedDesktop = toLinuxDesktopPreference(input.desktopEnvironment)
  const detectedEnvironment = input.detectedDesktop ?? detectDesktopEnvironment(env)
  const desktopDefaults = linuxDesktopDefaults(selectedDesktop === 'auto' ? detectedEnvironment : selectedDesktop)
  const suggestedMode = toLinuxWindowingMode(desktopDefaults.windowingMode)
  const windowingResolved = resolveLinuxWindowingMode(windowingPreference, {
    displayMode,
    nativeWayland,
    layerShell,
    defaultMode: suggestedMode === 'auto' ? undefined : suggestedMode,
  }).mode

  const shortcutPreference = toLinuxShortcutBackend(input.shortcutBackend)
  const suggestedShortcut = toLinuxShortcutBackend(desktopDefaults.shortcutBackend)
  const shortcutResolved = resolveLinuxShortcutBackend(shortcutPreference, {
    nativeWayland,
    nativeOverlay: nativeOverlayActive(),
    evdevReadable: evdevKeyboardsReadable(),
    defaultBackend: suggestedShortcut === 'auto' ? undefined : suggestedShortcut,
  })

  const clipboardPreference = toLinuxClipboardBackend(input.clipboardBackend)
  const compositorClipboardAvailable = nativeWayland && linuxCompositorClipboardAvailable()
  const clipboardResolved = resolveLinuxClipboardBackend(
    clipboardPreference,
    nativeWayland,
    compositorClipboardAvailable,
  )

  const inputPreference = toLinuxInputBackend(input.inputBackend)
  const inputResolved = resolveLinuxInputBackend(inputPreference, nativeWayland)

  return {
    platform: 'linux',
    nativeWayland,
    displayMode,
    savedDisplayMode,
    windowing: {
      preference: windowingPreference,
      resolved: windowingResolved,
      layerShellAvailable: layerShell.available,
      ...(layerShell.reasonKey ? { layerShellReasonKey: layerShell.reasonKey } : {}),
      ...(layerShell.backendId ? { nativeOverlayBackendId: layerShell.backendId } : {}),
    },
    shortcuts: { preference: shortcutPreference, resolved: shortcutResolved },
    clipboard: { preference: clipboardPreference, resolved: clipboardResolved },
    input: { preference: inputPreference, resolved: inputResolved },
  }
}

export { PLATFORM_SETTING_IDS as LINUX_EFFECTIVE_SETTING_IDS }
