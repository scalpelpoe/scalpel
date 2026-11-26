import type { PlatformSettingsView } from './common/platform-settings'
import { linuxSettingsView, type LinuxSettingsInput } from './linux/linux-settings'
import { currentEnv, detectOperatingSystem } from './select'

export type PlatformSettingsInput = LinuxSettingsInput

/** Neutral entry point for the host settings UI. It routes to an OS-specific
 *  view builder inside the package and reports `available: false` elsewhere, so
 *  app code never needs to detect an operating system to decide what to show. */
export function platformSettingsView(input: PlatformSettingsInput = {}): PlatformSettingsView {
  const env = input.env ?? currentEnv()
  if (detectOperatingSystem(env) !== 'linux') return { available: false, sections: [] }
  return linuxSettingsView({ ...input, env })
}
