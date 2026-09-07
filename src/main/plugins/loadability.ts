import { app } from 'electron'
import { resolvePluginDependencies, type InstalledPluginEntry, type PluginLoadEntry } from '@shared/plugin-dependencies'
import { versionMatches } from '@shared/version-match'

export function resolvePluginLoadability(
  entries: PluginLoadEntry[],
  currentVersion = app.getVersion(),
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
