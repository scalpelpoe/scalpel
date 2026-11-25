/** Resolved desktop profile for this process, set once at boot. Kept here so
 *  runtime backend defaults can come from the same settings map the UI uses,
 *  without reading the host app's store from inside the platform package. */
import type { PlatformDesktopPreference } from '../../common/platform-settings'
import { reportBreadcrumb } from '../../common/diagnostics'

let active: PlatformDesktopPreference = 'auto'

export function setLinuxDesktop(value: unknown): void {
  const next: PlatformDesktopPreference =
    value === 'hyprland' || value === 'kde-plasma' || value === 'niri' || value === 'sway' || value === 'umbriel'
      ? value
      : 'auto'
  if (next === active) return
  active = next
  reportBreadcrumb(`[linux/desktop] selected=${active}`, 'debug')
}

export function getLinuxDesktop(): PlatformDesktopPreference {
  return active
}

/** @internal Test-only reset. */
export function __resetLinuxDesktopForTests(): void {
  active = 'auto'
}
