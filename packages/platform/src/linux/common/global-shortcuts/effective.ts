import type { ConcreteLinuxShortcutBackend, LinuxShortcutBackend } from './backend'

/** Facts the `auto` choice needs. Kept explicit so the settings view can show
 *  the same effective value the runtime uses, without probing the compositor
 *  from the renderer. */
export interface LinuxShortcutFacts {
  /** This process actually runs on native Wayland Ozone. */
  readonly nativeWayland: boolean
  /** A native overlay backend can supply its own evdev shortcut transport. */
  readonly nativeOverlay: boolean
  /** This user can read at least one keyboard under /dev/input. */
  readonly evdevReadable: boolean
  /** Per-compositor default from the settings map, used only for `auto`. */
  readonly defaultBackend?: ConcreteLinuxShortcutBackend
}

/** Resolve an explicit preference or the `auto` choice to one implementation.
 *
 *  - X11/XWayland stays on Electron: native grabs and the portal add nothing.
 *  - Native Wayland uses the compositor default, then evdev under a native
 *    overlay, then the GlobalShortcuts portal.
 *  - Auto never picks evdev without a readable keyboard: those shortcuts would
 *    register but never fire while the game has focus.
 */
export function resolveLinuxShortcutBackend(
  preference: LinuxShortcutBackend,
  facts: LinuxShortcutFacts,
): ConcreteLinuxShortcutBackend {
  if (preference !== 'auto') return preference
  if (!facts.nativeWayland) return 'electron'
  const preferred = facts.defaultBackend ?? (facts.nativeOverlay ? 'evdev' : 'portal')
  return preferred === 'evdev' && !facts.evdevReadable ? 'portal' : preferred
}
