import { resolvePluginDependencies, type PluginLoadEntry } from '@shared/plugin-dependencies'

export type PluginEntry = PluginLoadEntry

export interface PluginLoadPlan {
  entries: PluginEntry[]
  errors: Map<string, Error>
}

export function planPluginLoad(entries: PluginEntry[]): PluginLoadPlan {
  const resolution = resolvePluginDependencies(entries)
  const errors = new Map<string, Error>()
  for (const [pluginId, availability] of resolution.availability) {
    if (availability.status === 'unavailable') errors.set(pluginId, new Error(availability.reason.message))
  }
  return { entries: resolution.entries, errors }
}
