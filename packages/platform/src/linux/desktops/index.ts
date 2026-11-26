import { currentEnv, detectDesktopEnvironment } from '@platform/select'
import type { DesktopEnvironment } from '@platform/select'
import type { LinuxDesktopAdapter } from '@platform/linux/common/layer-shell/adapter'
import type { WindowGeometryProvider } from '@platform/linux/common/wayland/geometry-provider'
import type { ConcreteLinuxDesktopPreference } from '@platform/linux/linux-settings'
import type { CompositorWindowInfo, PlatformEnv } from '@platform/types'
import type { Backend, BackendId } from '@platform/types'
import { detectHyprlandGameMode } from './hyprland/game-mode'
import { createHyprlandBackend } from './hyprland/backend'
import { readHyprlandVersion } from './hyprland/ipc'
import { kwinDesktopAdapter } from './kde-plasma/adapter'
import { isKWinSession } from './kde-plasma/support'
import { createNiriGeometryProvider } from './niri/geometry'
import { createSwayGeometryProvider } from './sway/geometry'
import { createUmbrielGeometryProvider } from './umbriel/geometry'

/**
 * Compositor-specific geometry providers. Generic Wayland code receives only
 * this contract, never a compositor CLI or desktop profile branch.
 */
export function linuxGeometryProviders(
  desktop?: ConcreteLinuxDesktopPreference,
  env = currentEnv(),
): readonly WindowGeometryProvider[] {
  const providers: WindowGeometryProvider[] = [createUmbrielGeometryProvider()]
  if (desktop === 'sway') providers.unshift(createSwayGeometryProvider(env))
  if (desktop === 'niri') providers.unshift(createNiriGeometryProvider(env))
  return providers
}

/**
 * Registry of desktop adapters.
 *
 * Everything above `linux/common` asks this module for a desktop by id instead
 * of importing a compositor directory. A desktop with no special behavior only
 * contributes geometry providers; KWin adds its layer-shell hooks (scripting
 * tracker, ydotool input, ydotoold requirement) through `kde-plasma/adapter`,
 * and tiling desktops keep their Auto defaults and game-mode probes here.
 */
function tilerAdapter(
  desktop?: ConcreteLinuxDesktopPreference,
  extra: Partial<LinuxDesktopAdapter> = {},
): LinuxDesktopAdapter {
  return {
    desktop,
    geometryProviders: () => linuxGeometryProviders(desktop),
    ...(desktop ? { defaults: { windowingMode: 'layer-shell' } } : {}),
    ...extra,
  }
}

/** Adapter for a resolved desktop profile. Never returns null: an unknown or
 *  Auto profile uses the generic adapter with no desktop-specific hooks. */
export function linuxDesktopAdapter(desktop?: ConcreteLinuxDesktopPreference): LinuxDesktopAdapter {
  switch (desktop) {
    case 'kde-plasma':
      return kwinDesktopAdapter
    case 'niri':
      return tilerAdapter('niri', {
        defaults: { windowingMode: 'layer-shell', shortcutBackend: 'evdev' },
      })
    case 'hyprland':
      return tilerAdapter('hyprland', { detectGameMode: detectHyprlandGameMode })
    default:
      return tilerAdapter(desktop)
  }
}

/** Adapter for a session detected only as a generic `wayland`/`x11` type.
 *  A compositor adapter can still claim it from its own session markers (KDE
 *  sets `KDE_FULL_SESSION` even when `XDG_CURRENT_DESKTOP` is missing). */
export function linuxDesktopAdapterForSession(env: PlatformEnv): LinuxDesktopAdapter {
  return isKWinSession(env) ? kwinDesktopAdapter : tilerAdapter()
}

function adapterForDetected(desktop: DesktopEnvironment): LinuxDesktopAdapter | undefined {
  switch (desktop) {
    case 'kde':
      return linuxDesktopAdapter('kde-plasma')
    case 'hyprland':
    case 'niri':
    case 'sway':
    case 'umbriel':
      return linuxDesktopAdapter(desktop)
    default:
      return undefined
  }
}

/** Compositor-backed game display mode for the PoE warning. Only desktops whose
 *  adapter implements `detectGameMode` answer; everything else returns null. */
export function detectLinuxGameMode(
  titles: readonly string[],
  env: PlatformEnv = currentEnv(),
  windows?: () => readonly CompositorWindowInfo[],
): 'x11' | 'wayland' | null {
  return adapterForDetected(detectDesktopEnvironment(env))?.detectGameMode?.(titles, env, windows) ?? null
}

/** Backend construction for a desktop that owns one. `null` means the OS router
 *  falls back to the generic overlay backend. */
export function createLinuxDesktopBackend(id: BackendId): Backend | null {
  return id === 'hyprland' ? createHyprlandBackend() : null
}

/** Version probe for the backend policy. It lives here so the top-level router
 *  never imports a compositor CLI module. Only called for a Hyprland session. */
export function readLinuxDesktopVersion(): string {
  return readHyprlandVersion()
}
