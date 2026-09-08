import { app } from 'electron'
import { resolvePluginDependencies, type InstalledPluginEntry, type PluginLoadEntry } from '@shared/plugin-dependencies'
import { versionMatches } from '@shared/version-match'
import {
  nativeHostTarget,
  nativeTargetForHost,
  type NativeHostPlatform,
  RFC1_NATIVE_TARGET,
  unsupportedNativePlatformMessage,
} from './native-platform'

export function resolvePluginLoadability(
  entries: PluginLoadEntry[],
  currentVersion = app.getVersion(),
  host: NativeHostPlatform = process,
): {
  installed: InstalledPluginEntry[]
  loadable: InstalledPluginEntry[]
} {
  const initialAvailability = new Map<string, InstalledPluginEntry['availability']>()
  for (const entry of entries) {
    const requiredVersion = entry.manifest.scalpelMinVersion
    if (!versionMatches(requiredVersion, currentVersion)) {
      initialAvailability.set(entry.manifest.id, {
        status: 'unavailable',
        reason: {
          code: 'scalpel-version-incompatible',
          requiredVersion,
          currentVersion,
          message: `requires Scalpel version ${requiredVersion} (running ${currentVersion})`,
        },
      })
    } else if (entry.manifest.nativeBackend && !nativeTargetForHost(host)) {
      initialAvailability.set(entry.manifest.id, {
        status: 'unavailable',
        reason: {
          code: 'native-platform-incompatible',
          supportedTarget: RFC1_NATIVE_TARGET,
          currentTarget: nativeHostTarget(host),
          message: unsupportedNativePlatformMessage(host),
        },
      })
    }
  }
  const resolution = resolvePluginDependencies(entries, initialAvailability)
  const withAvailability = (entry: PluginLoadEntry): InstalledPluginEntry => ({
    ...entry,
    availability: resolution.availability.get(entry.manifest.id) ?? {
      status: 'available',
    },
  })
  return {
    installed: entries.map(withAvailability),
    loadable: resolution.entries.map(withAvailability),
  }
}
