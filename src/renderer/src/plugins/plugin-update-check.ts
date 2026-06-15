import type { PluginManifest } from '../../../plugin-sdk/src/types'
import type { RegistrySnapshot } from '@shared/plugin-registry-types'
import { compareVersions } from '@shared/version-match'

interface InstalledLike {
  manifest: PluginManifest
}

/** Registry latestVersion for this manifest's id, but only when it is strictly
 *  newer than what is installed. Null when up to date, newer-than-registry, or
 *  absent from the registry (unpacked/dev plugins are never "outdated"). */
export function latestVersionFor(registry: RegistrySnapshot | null, manifest: PluginManifest): string | null {
  const entry = registry?.plugins.find((e) => e.id === manifest.id)
  if (!entry || !entry.latestVersion) return null
  return compareVersions(entry.latestVersion, manifest.version) > 0 ? entry.latestVersion : null
}

/** Ids of installed plugins that have a strictly-newer registry version. */
export function outdatedPluginIds(registry: RegistrySnapshot | null, installed: InstalledLike[]): Set<string> {
  const out = new Set<string>()
  for (const { manifest } of installed) {
    if (latestVersionFor(registry, manifest)) out.add(manifest.id)
  }
  return out
}
