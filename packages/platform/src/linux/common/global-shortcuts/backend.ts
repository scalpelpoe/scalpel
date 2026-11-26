import type { PlatformShortcutBackend } from '../../../common/platform-settings'
import { reportBreadcrumb } from '../../../common/diagnostics'

/** User-facing global-shortcut backend preference for Linux. X11/XWayland and
 *  other platforms never consult this; the neutral `GlobalShortcuts` facade is
 *  the only thing the host app sees. */
export type LinuxShortcutBackend = PlatformShortcutBackend
export type ConcreteLinuxShortcutBackend = Exclude<LinuxShortcutBackend, 'auto'>

const BACKENDS: readonly LinuxShortcutBackend[] = ['auto', 'evdev', 'portal', 'electron']

export function toLinuxShortcutBackend(value: unknown): LinuxShortcutBackend {
  return BACKENDS.find((backend) => backend === value) ?? 'auto'
}

let active: LinuxShortcutBackend = 'auto'

/** Seeded from the store at boot. Registrations are recreated only on restart,
 *  so this is intentionally not updated while the app is running. */
export function setLinuxShortcutBackend(value: unknown): void {
  const next = toLinuxShortcutBackend(value)
  if (next === active) return
  active = next
  reportBreadcrumb(`[linux/shortcuts] preference=${active}`, 'debug')
}

export function getLinuxShortcutBackend(): LinuxShortcutBackend {
  return active
}

/** @internal Test-only reset. */
export function __resetLinuxShortcutBackendForTests(): void {
  active = 'auto'
}
