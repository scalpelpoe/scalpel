import type { PluginManifest } from '../../plugin-sdk/src/types'

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

  for (const manifest of next.values()) {
    for (const dependency of manifest.dependencies ?? []) {
      if (dependency.optional) continue
      const provider = next.get(dependency.pluginId)
      if (!provider) {
        return `plugin "${manifest.id}" requires plugin "${dependency.pluginId}"`
      }
      if (provider.api?.version !== dependency.apiVersion) {
        return `plugin "${manifest.id}" requires API ${dependency.apiVersion} from plugin "${dependency.pluginId}"`
      }
      const consumerGames = manifest.poeVersions ?? [1, 2]
      const providerGames = new Set(provider.poeVersions ?? [1, 2])
      if (consumerGames.some((version) => !providerGames.has(version))) {
        return `plugin "${manifest.id}" requires plugin "${dependency.pluginId}" for an unsupported PoE version`
      }
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (manifest: PluginManifest): string | null => {
    if (visiting.has(manifest.id)) return `plugin dependency cycle includes "${manifest.id}"`
    if (visited.has(manifest.id)) return null
    visiting.add(manifest.id)
    for (const dependency of manifest.dependencies ?? []) {
      const provider = next.get(dependency.pluginId)
      if (!provider || provider.api?.version !== dependency.apiVersion) continue
      const error = visit(provider)
      if (error) return error
    }
    visiting.delete(manifest.id)
    visited.add(manifest.id)
    return null
  }
  for (const manifest of next.values()) {
    const error = visit(manifest)
    if (error) return error
  }
  return null
}
