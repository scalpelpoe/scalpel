import type { ConcreteLinuxShortcutBackend, LinuxShortcutBackend } from './backend'

/** Facts the `auto` choice needs. Kept explicit so the settings view can show
 *  the same effective value the runtime uses, without probing the compositor
 *  from the renderer. */
export interface LinuxShortcutFacts {
  /** This process actually runs on native Wayland Ozone. */
  readonly nativeWayland: boolean
  /** A native overlay backend can supply its own evdev shortcut transport. */
  readonly nativeOverlay: boolean
  /** Per-compositor default from the settings map, used only for `auto`. */
  readonly defaultBackend?: ConcreteLinuxShortcutBackend
}

/** Resolve an explicit preference or the `auto` choice to one implementation.
 *
 *  - X11/XWayland stays on Electron: native grabs and the portal add nothing.
 *  - Native Wayland without a layer-shell host uses the GlobalShortcuts portal.
 *  - A native overlay can match evdev keys itself (deferred until that host is
 *    ported); until then the selector falls back from `evdev` to portal/electron.
 */
export function resolveLinuxShortcutBackend(
  preference: LinuxShortcutBackend,
  facts: LinuxShortcutFacts,
): ConcreteLinuxShortcutBackend {
  if (preference !== 'auto') return preference
  if (!facts.nativeWayland) return 'electron'
  if (facts.defaultBackend) return facts.defaultBackend
  return facts.nativeOverlay ? 'evdev' : 'portal'
}
