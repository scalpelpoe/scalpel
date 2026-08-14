import type { PluginManifest } from '../../../plugin-sdk/src/types'

export interface PluginEntry {
  manifest: PluginManifest
  entryUrl: string
}

export interface PluginLoadPlan {
  entries: PluginEntry[]
  errors: Map<string, Error>
}

export function planPluginLoad(entries: PluginEntry[]): PluginLoadPlan {
  const byId = new Map(entries.map((entry) => [entry.manifest.id, entry]))
  const errors = new Map<string, Error>()

  for (const entry of entries) {
    for (const dependency of entry.manifest.dependencies ?? []) {
      const provider = byId.get(dependency.pluginId)
      if (!provider) {
        if (!dependency.optional) {
          errors.set(entry.manifest.id, new Error(`required plugin "${dependency.pluginId}" is not installed`))
        }
        continue
      }
      if (provider.manifest.api?.version !== dependency.apiVersion && !dependency.optional) {
        errors.set(
          entry.manifest.id,
          new Error(`plugin "${dependency.pluginId}" does not provide API version ${dependency.apiVersion}`),
        )
      }
    }
  }

  const ordered: PluginEntry[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()

  const visit = (entry: PluginEntry, path: string[]): void => {
    const id = entry.manifest.id
    if (visited.has(id) || errors.has(id)) return
    if (visiting.has(id)) {
      const cycleStart = path.indexOf(id)
      const cycle = [...path.slice(cycleStart), id]
      for (const pluginId of cycle) {
        errors.set(pluginId, new Error(`plugin dependency cycle: ${cycle.join(' -> ')}`))
      }
      return
    }

    visiting.add(id)
    for (const dependency of entry.manifest.dependencies ?? []) {
      const provider = byId.get(dependency.pluginId)
      if (!provider || provider.manifest.api?.version !== dependency.apiVersion) continue
      visit(provider, [...path, id])
      if (!dependency.optional && errors.has(provider.manifest.id) && !errors.has(id)) {
        errors.set(id, new Error(`required plugin "${provider.manifest.id}" could not be activated`))
      }
    }
    visiting.delete(id)
    visited.add(id)
    if (!errors.has(id)) ordered.push(entry)
  }

  for (const entry of entries) visit(entry, [])
  return { entries: ordered, errors }
}
