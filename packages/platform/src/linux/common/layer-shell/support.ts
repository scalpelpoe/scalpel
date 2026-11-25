import { layerShellUsable, probeWaylandHost, type HostFeatures } from 'electron-overlay-window'
import { hostExecutablePath } from 'electron-overlay-window/dist/wayland/host'
import { reportBreadcrumb } from '../../../common/diagnostics'
import type { LinuxDesktopAdapter } from './adapter'
import type { LinuxLayerShellCapability } from './windowing'

/** Message keys rendered underneath the windowing-mode selector. */
export type LinuxLayerShellReasonKey =
  | 'settings_linux_layer_shell_host_missing'
  | 'settings_linux_layer_shell_probe_failed'
  | 'settings_linux_layer_shell_protocol_unavailable'
  | 'settings_linux_layer_shell_toplevel_unavailable'
  | 'settings_linux_layer_shell_clipboard_unavailable'
  | 'settings_linux_layer_shell_input_unavailable'

export interface LinuxLayerShellSupport extends LinuxLayerShellCapability {
  /** Raw probe result, kept for diagnostics; never used by feature code. */
  readonly features: HostFeatures | null
  readonly reason?: string
}

export interface LinuxLayerShellProbeOptions {
  /** Desktop adapter resolved by boot. Without one the generic wlr-layer-shell
   *  requirements apply; a desktop with richer requirements supplies them. */
  readonly adapter?: LinuxDesktopAdapter
  /** Injected by tests so the probe never spawns ydotool. */
  readonly keyboardAvailable?: boolean
}

/**
 * Runtime capability probe for native layer-shell overlays.
 *
 * `probeWaylandHost` synchronously asks the compositor for its globals and can
 * spawn the helper, so callers cache the result once at boot instead of
 * probing from settings renders. Nothing here registers an overlay backend; an
 * honest unavailable result leaves the existing X11 path untouched.
 *
 * A desktop adapter may replace the generic requirements. KWin, for example,
 * exposes layer-shell and data-control but no zwlr foreign-toplevel, so its
 * adapter asks for data-control and a reachable ydotoold instead.
 */
export function probeLinuxLayerShellSupport(
  features: HostFeatures | null = probeWaylandHost(),
  options: LinuxLayerShellProbeOptions = {},
): LinuxLayerShellSupport {
  if (!features) {
    const missing = !hostExecutablePath()
    return {
      available: false,
      reasonKey: missing ? 'settings_linux_layer_shell_host_missing' : 'settings_linux_layer_shell_probe_failed',
      reason: missing ? 'Wayland layer-shell host executable is missing' : 'Wayland layer-shell host probe failed',
      features: null,
    }
  }
  if (!layerShellUsable(features)) {
    return {
      available: false,
      reasonKey: 'settings_linux_layer_shell_protocol_unavailable',
      reason: `Wayland layer-shell v4 unavailable (version ${features.layerShellVersion})`,
      features,
    }
  }

  const integration = options.adapter?.layerShell
  if (integration?.requirements) {
    const failure = integration.requirements(features, { keyboardAvailable: options.keyboardAvailable })
    if (failure) {
      return {
        available: false,
        reasonKey: failure.reasonKey,
        reason: failure.reason,
        features,
      }
    }
    return { available: true, backendId: integration.backendId, features }
  }

  if (!features.foreignToplevel) {
    return {
      available: false,
      reasonKey: 'settings_linux_layer_shell_toplevel_unavailable',
      reason: 'zwlr foreign-toplevel management is unavailable',
      features,
    }
  }
  if (!features.dataControl) {
    return {
      available: false,
      reasonKey: 'settings_linux_layer_shell_clipboard_unavailable',
      reason: 'Wayland data-control is unavailable',
      features,
    }
  }
  return { available: true, backendId: integration?.backendId ?? 'layer-shell', features }
}

/** Boot-facing helper: one probe, one low-noise breadcrumb. */
export function probeAndReportLinuxLayerShellSupport(
  features?: HostFeatures | null,
  options: LinuxLayerShellProbeOptions = {},
): LinuxLayerShellSupport {
  let support: LinuxLayerShellSupport
  try {
    support = probeLinuxLayerShellSupport(features, options)
  } catch (error) {
    support = {
      available: false,
      reasonKey: 'settings_linux_layer_shell_probe_failed',
      reason: String(error),
      features: null,
    }
  }
  reportBreadcrumb(
    `layer-shell probe available=${support.available} backend=${support.backendId ?? '-'} ` +
      `layerShell=${support.features?.layerShell ?? false} v${support.features?.layerShellVersion ?? 0} ` +
      `toplevel=${support.features?.foreignToplevel ?? false} dataControl=${support.features?.dataControl ?? false} ` +
      `keyboard=${options.keyboardAvailable ?? 'auto'} reason="${support.reason ?? ''}"`,
  )
  return support
}
