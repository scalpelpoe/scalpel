import { resolvePluginDependencies, type InstalledPluginEntry, type PluginLoadEntry } from '@shared/plugin-dependencies'

export function resolvePluginLoadability(entries: PluginLoadEntry[]): {
  installed: InstalledPluginEntry[]
  loadable: InstalledPluginEntry[]
} {
  const resolution = resolvePluginDependencies(entries)
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
