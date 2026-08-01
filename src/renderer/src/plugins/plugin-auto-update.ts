import type { RegistryEntry, RegistrySnapshot } from '@shared/plugin-registry-types'
import type { PluginManifest } from '../../../plugin-sdk/src/types'
import { latestVersionFor } from './plugin-update-check'

interface InstalledLike {
  manifest: PluginManifest
}

export interface AutoUpdateGate {
  /** The global pluginAutoUpdate opt-in. */
  enabled: boolean
  /** True when a non-default pluginRegistryUrl is set; auto-apply stays off then. */
  customRegistry: boolean
}

/** Registry entries for installed plugins that have a strictly-newer curated
 *  version. Empty when auto-update is disabled, a custom registry is in use, or
 *  the registry is unavailable (offline). Mirrors the manual badge's
 *  `outdatedPluginIds` rule, then maps each id back to its full registry entry
 *  (which `plugins:update-from-registry` consumes). */
export function selectAutoUpdateCandidates(
  snapshot: RegistrySnapshot | null,
  installed: InstalledLike[],
  gate: AutoUpdateGate,
): RegistryEntry[] {
  if (!gate.enabled || gate.customRegistry || !snapshot) return []
  const out: RegistryEntry[] = []
  for (const { manifest } of installed) {
    if (!latestVersionFor(snapshot, manifest)) continue
    const found = snapshot.plugins.find((e) => e.id === manifest.id)
    if (found) out.push(found)
  }
  return out
}
