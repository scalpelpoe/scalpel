import type { PluginManifest } from '../../plugin-sdk/src/types'
import { resolvePluginDependencies } from '@shared/plugin-dependencies'

/** Validate the graph that would exist after replacing or removing one plugin. */
export function validateDependencyMutation(
  installed: PluginManifest[],
  pluginId: string,
  replacement: PluginManifest | null,
): string | null {
  const previous = installed.find((manifest) => manifest.id === pluginId)
  if (
    previous?.api &&
    replacement?.api &&
    previous.api.version === replacement.api.version &&
    previous.api.service !== replacement.api.service &&
    installed.some(
      (manifest) => manifest.id !== pluginId && manifest.dependencies?.some((dep) => dep.pluginId === pluginId),
    )
  ) {
    return `plugin "${pluginId}" cannot change service without changing its API version`
  }

  const next = new Map(installed.map((manifest) => [manifest.id, manifest]))
  if (replacement) next.set(pluginId, replacement)
  else next.delete(pluginId)

  const before = resolvePluginDependencies(installed.map((manifest) => ({ manifest }))).availability
  const after = resolvePluginDependencies([...next.values()].map((manifest) => ({ manifest }))).availability
  for (const [id, availability] of after) {
    if (availability.status === 'unavailable' && before.get(id)?.status !== 'unavailable') {
      const reason = availability.reason
      if (reason.code === 'missing-required-dependency') {
        return `plugin "${id}" requires plugin "${reason.dependencyId}"`
      }
      if (reason.code === 'api-version-mismatch') {
        return `plugin "${id}" requires API ${reason.requiredApiVersion} from plugin "${reason.dependencyId}"`
      }
      if (reason.code === 'dependency-cycle') return `plugin dependency cycle includes "${id}"`
      if (reason.code === 'scalpel-version-incompatible') return `plugin "${id}" ${reason.message}`
      return `plugin "${id}" requires plugin "${reason.dependencyId}", which is unavailable: ${reason.cause.message}`
    }
  }

  // Game support is not part of the canonical resolver, so check it separately
  // for the mutated plugin and its transitive dependents.
  const affected = new Set<string>()
  if (replacement) affected.add(pluginId)
  const queue = [pluginId]
  while (queue.length > 0) {
    const current = queue.pop() as string
    for (const manifest of next.values()) {
      if (affected.has(manifest.id)) continue
      if (manifest.dependencies?.some((dependency) => dependency.pluginId === current)) {
        affected.add(manifest.id)
        queue.push(manifest.id)
      }
    }
  }
  const affectedManifests = [...affected].map((id) => next.get(id) as PluginManifest)

  for (const manifest of affectedManifests) {
    for (const dependency of manifest.dependencies ?? []) {
      if (dependency.optional) continue
      const provider = next.get(dependency.pluginId)
      if (!provider || provider.api?.version !== dependency.apiVersion) continue
      const consumerGames = manifest.poeVersions ?? [1, 2]
      const providerGames = new Set(provider.poeVersions ?? [1, 2])
      if (consumerGames.some((version) => !providerGames.has(version))) {
        return `plugin "${manifest.id}" requires plugin "${dependency.pluginId}" for an unsupported PoE version`
      }
    }
  }
  return null
}
