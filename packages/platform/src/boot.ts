import { app } from 'electron'
import type {
  PlatformDesktopPreference,
  PlatformGameDisplayModePreference,
  PlatformInputBackend,
  PlatformWindowingMode,
} from './common/platform-settings'
import { reportBreadcrumb } from './common/diagnostics'
import {
  MANAGED_OZONE_ENV,
  explicitLinuxDisplayMode,
  isNativeWayland,
  ozoneArgsForMode,
  toLinuxDisplayMode,
} from './linux/common/display'
import { setLinuxDesktop } from './linux/common/desktop'
import { setLinuxGameDisplayModeOverride } from './linux/common/game-display-mode'
import { enablePortalShortcuts } from './linux/common/global-shortcuts'
import { initLinuxLayerShellBackend } from './linux/common/layer-shell/backend'
import { probeAndReportLinuxLayerShellSupport } from './linux/common/layer-shell/support'
import { initLinuxRegularWindowSupport } from './linux/common/regular-window/backend'
import {
  resolveLinuxWindowingMode,
  setLinuxLayerShellCapability,
  setLinuxRegularWindowMode,
  toLinuxWindowingMode,
} from './linux/common/layer-shell/windowing'
import { startWaylandFocusTracking } from './linux/common/wayland/focus'
import { linuxDesktopAdapter, linuxDesktopAdapterForSession } from './linux/desktops'
import { toLinuxDesktopPreference } from './linux/linux-settings'
import { linuxDesktopDefaults } from './linux/settings-rules'
import { currentEnv, detectDesktopEnvironment, detectOperatingSystem, relaunchArgs } from './select'
import type { PlatformEnv } from './types'

/** Main-process boot decisions that depend on the host OS. The caller only
 *  handles Electron lifecycle (spawn/relaunch/exit); this module owns the
 *  platform-specific policy and the managed-relaunch marker. */
export function preparePlatformLaunch(env: PlatformEnv = currentEnv(), savedDisplayMode?: unknown): string[] | null {
  const args = relaunchArgs(env, savedDisplayMode)
  if (args) env.env[MANAGED_OZONE_ENV] = '1'
  return args
}

/** Args for an explicit user-requested restart. Unlike boot relaunch, this
 *  always rewrites the Ozone flag so the newly saved display mode takes effect.
 *  A real CLI flag stays authoritative. */
export function restartPlatformArgs(env: PlatformEnv, savedDisplayMode?: unknown): string[] {
  if (detectOperatingSystem(env) !== 'linux') return env.argv.slice(1)
  if (explicitLinuxDisplayMode(env.argv, env.env)) return env.argv.slice(1)
  env.env[MANAGED_OZONE_ENV] = '1'
  return ozoneArgsForMode(env.argv.slice(1), toLinuxDisplayMode(savedDisplayMode))
}

/** Must match the Electron appId and the installed desktop entry basename. */
const LINUX_DESKTOP_NAME = 'com.filterscalpel.app'

/** Apply OS-level Electron defaults without putting platform checks in main. */
export function applyPlatformDefaults(env: PlatformEnv = currentEnv()): void {
  if (detectOperatingSystem(env) !== 'linux') return
  const linuxApp = app as unknown as { setDesktopName?: (name: string) => void }
  linuxApp.setDesktopName?.(LINUX_DESKTOP_NAME)
  // X11/XWayland needs software rendering for the overlay; native Wayland does not.
  if (!isNativeWayland(env.argv)) app.disableHardwareAcceleration()
}

export interface NativeWaylandSupportOptions {
  /** Opaque saved selector value; resolved here so compositor code stays in platform. */
  desktopEnvironment?: PlatformDesktopPreference
  windowingMode?: PlatformWindowingMode
  inputBackend?: PlatformInputBackend
  gameDisplayMode?: PlatformGameDisplayModePreference
}

/** Install native-Wayland services once the boot Ozone mode is known, but
 *  before the host app registers any hotkeys or creates an overlay window.
 *  X11/XWayland never enters this path. */
export function startNativeWaylandSupport(
  env: PlatformEnv = currentEnv(),
  options: NativeWaylandSupportOptions = {},
): void {
  if (detectOperatingSystem(env) !== 'linux') return

  // Resolve the desktop profile for every Linux session: runtime defaults and
  // diagnostics must agree with the settings matrix even on X11/XWayland.
  const selectedDesktop = toLinuxDesktopPreference(options.desktopEnvironment)
  const detectedEnvironment = detectDesktopEnvironment(env)
  const detectedDesktop = toLinuxDesktopPreference(detectedEnvironment)
  const effectiveDesktop = selectedDesktop === 'auto' ? detectedDesktop : selectedDesktop
  const resolvedDesktop = effectiveDesktop === 'auto' ? undefined : effectiveDesktop
  setLinuxDesktop(resolvedDesktop ?? detectedDesktop)
  setLinuxGameDisplayModeOverride(options.gameDisplayMode)

  if (!isNativeWayland(env.argv)) {
    // X11/XWayland still needs the flag: Regular window is a normal BrowserWindow
    // there too, with no compositor host to start.
    setLinuxRegularWindowMode(toLinuxWindowingMode(options.windowingMode) === 'window')
    return
  }
  enablePortalShortcuts(env)

  const preference = toLinuxWindowingMode(options.windowingMode)
  // A selected profile wins; otherwise a compositor adapter can still claim a
  // generically detected session (KDE sets KDE_FULL_SESSION even when
  // XDG_CURRENT_DESKTOP is missing). The adapter also decides whether it feeds
  // the shared focus cache itself, in which case the generic reader must not
  // start and fight it.
  const adapter = resolvedDesktop ? linuxDesktopAdapter(resolvedDesktop) : linuxDesktopAdapterForSession(env)
  const ownsFocusCache = adapter.layerShell?.claimsFocusCache === true

  if (!ownsFocusCache) startWaylandFocusTracking()

  // One probe per process. The answer feeds both the boot decision and the
  // settings view, so neither has to spawn the helper again.
  const capability = probeAndReportLinuxLayerShellSupport(undefined, { adapter })
  setLinuxLayerShellCapability(capability)
  // Auto's best guess comes from the same desktop defaults map the settings
  // view uses, so boot and the UI can never disagree about the default.
  const defaultsKey = resolvedDesktop ?? detectedEnvironment
  const suggestedMode = linuxDesktopDefaults(defaultsKey).windowingMode
  const defaultMode =
    suggestedMode === 'x11' || suggestedMode === 'window' || suggestedMode === 'layer-shell' ? suggestedMode : undefined
  const resolved = resolveLinuxWindowingMode(preference, {
    displayMode: 'wayland',
    nativeWayland: true,
    layerShell: capability,
    defaultMode,
  })
  reportBreadcrumb(
    `windowing boot preference=${preference} effective=${resolved.mode} ` +
      `desktop=${resolvedDesktop ?? detectedEnvironment} available=${capability.available} ` +
      `backend=${capability.backendId ?? '-'}`,
  )
  const windowMode = resolved.mode === 'window'
  setLinuxRegularWindowMode(windowMode)
  if (resolved.mode !== 'layer-shell') {
    // A compositor adapter with its own focus source (KWin) starts it here:
    // there is no layer-shell tracker to publish focus, but the portal hotkey
    // gate and lifecycle focus events still need to know the active window.
    adapter.startFocusTracking?.()
    if (windowMode) {
      if (initLinuxRegularWindowSupport()) {
        reportBreadcrumb('regular-window boot host ready id=regular-window')
      } else {
        reportBreadcrumb('regular-window boot host start failed; falling back to wl-clipboard')
      }
    }
    return
  }

  const started = initLinuxLayerShellBackend({ support: capability, adapter })
  if (!started) {
    setLinuxLayerShellCapability({
      available: false,
      reasonKey: 'settings_linux_layer_shell_init_failed',
    })
    reportBreadcrumb('layer-shell boot init failed; falling back to a regular window')
    // The probe said layer-shell was available, so this process runs native
    // Wayland and the X11 overlay cannot be a real fallback. Keep compositor
    // focus working and present a normal window instead.
    setLinuxRegularWindowMode(true)
    adapter.startFocusTracking?.()
    if (initLinuxRegularWindowSupport()) {
      reportBreadcrumb('regular-window fallback ready id=regular-window')
    }
  }
}
