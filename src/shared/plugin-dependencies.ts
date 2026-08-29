import type { PluginManifest } from '../plugin-sdk/src/types'

export interface PluginLoadEntry {
  manifest: PluginManifest
  entryUrl: string
}

export type PluginUnavailableReason =
  | {
      code: 'missing-required-dependency'
      dependencyId: string
      requiredApiVersion: string
      message: string
    }
  | {
      code: 'api-version-mismatch'
      dependencyId: string
      requiredApiVersion: string
      installedApiVersion: string | null
      message: string
    }
  | {
      code: 'dependency-cycle'
      cycle: string[]
      message: string
    }
  | {
      code: 'required-dependency-unavailable'
      dependencyId: string
      cause: PluginUnavailableReason
      message: string
    }

export type PluginAvailability = { status: 'available' } | { status: 'unavailable'; reason: PluginUnavailableReason }

export interface InstalledPluginEntry extends PluginLoadEntry {
  availability: PluginAvailability
}

export interface PluginDependencyResolution<T extends { manifest: PluginManifest }> {
  entries: T[]
  availability: Map<string, PluginAvailability>
}

const AVAILABLE: PluginAvailability = { status: 'available' }

/** Resolve required plugin dependencies without importing or activating code. */
export function resolvePluginDependencies<T extends { manifest: PluginManifest }>(
  entries: T[],
): PluginDependencyResolution<T> {
  const byId = new Map(entries.map((entry) => [entry.manifest.id, entry]))
  const availability = new Map<string, PluginAvailability>()

  for (const entry of entries) {
    for (const dependency of entry.manifest.dependencies ?? []) {
      if (dependency.optional) continue
      const provider = byId.get(dependency.pluginId)
      if (!provider) {
        availability.set(entry.manifest.id, {
          status: 'unavailable',
          reason: {
            code: 'missing-required-dependency',
            dependencyId: dependency.pluginId,
            requiredApiVersion: dependency.apiVersion,
            message: `required plugin "${dependency.pluginId}" is not installed`,
          },
        })
        break
      }
      const installedApiVersion = provider.manifest.api?.version ?? null
      if (installedApiVersion !== dependency.apiVersion) {
        availability.set(entry.manifest.id, {
          status: 'unavailable',
          reason: {
            code: 'api-version-mismatch',
            dependencyId: dependency.pluginId,
            requiredApiVersion: dependency.apiVersion,
            installedApiVersion,
            message: `plugin "${dependency.pluginId}" does not provide API version ${dependency.apiVersion}`,
          },
        })
        break
      }
    }
  }

  // Mark every member of a required-edge cycle before propagating blockage to
  // consumers outside the cycle.
  const visitState = new Map<string, 1 | 2>()
  const stack: string[] = []
  const findCycles = (id: string): void => {
    if (visitState.get(id) === 2) return
    if (visitState.get(id) === 1) {
      const start = stack.indexOf(id)
      const cycle = [...stack.slice(start), id]
      for (const pluginId of cycle.slice(0, -1)) {
        availability.set(pluginId, {
          status: 'unavailable',
          reason: {
            code: 'dependency-cycle',
            cycle,
            message: `plugin dependency cycle: ${cycle.join(' -> ')}`,
          },
        })
      }
      return
    }

    visitState.set(id, 1)
    stack.push(id)
    const entry = byId.get(id)
    for (const dependency of entry?.manifest.dependencies ?? []) {
      if (dependency.optional) continue
      const provider = byId.get(dependency.pluginId)
      if (provider?.manifest.api?.version === dependency.apiVersion) findCycles(provider.manifest.id)
    }
    stack.pop()
    visitState.set(id, 2)
  }
  for (const id of byId.keys()) findCycles(id)

  const resolving = new Set<string>()
  const resolveAvailability = (id: string): PluginAvailability => {
    const existing = availability.get(id)
    if (existing) return existing
    // All required cycles were marked above. This guard only protects malformed
    // duplicate input from causing recursion if this pure helper is reused.
    if (resolving.has(id)) return AVAILABLE
    resolving.add(id)
    const entry = byId.get(id)
    for (const dependency of entry?.manifest.dependencies ?? []) {
      if (dependency.optional) continue
      const provider = byId.get(dependency.pluginId)
      if (!provider || provider.manifest.api?.version !== dependency.apiVersion) continue
      const providerAvailability = resolveAvailability(provider.manifest.id)
      if (providerAvailability.status === 'unavailable') {
        const result: PluginAvailability = {
          status: 'unavailable',
          reason: {
            code: 'required-dependency-unavailable',
            dependencyId: provider.manifest.id,
            cause: providerAvailability.reason,
            message: `required plugin "${provider.manifest.id}" is unavailable: ${providerAvailability.reason.message}`,
          },
        }
        availability.set(id, result)
        resolving.delete(id)
        return result
      }
    }
    resolving.delete(id)
    availability.set(id, AVAILABLE)
    return AVAILABLE
  }
  for (const id of byId.keys()) resolveAvailability(id)

  const ordered: T[] = []
  const visited = new Set<string>()
  const ordering = new Set<string>()
  const addAvailable = (entry: T): void => {
    const id = entry.manifest.id
    if (visited.has(id) || ordering.has(id) || availability.get(id)?.status !== 'available') return
    ordering.add(id)
    for (const dependency of entry.manifest.dependencies ?? []) {
      const provider = byId.get(dependency.pluginId)
      if (
        provider?.manifest.api?.version === dependency.apiVersion &&
        availability.get(provider.manifest.id)?.status === 'available'
      ) {
        addAvailable(provider)
      }
    }
    ordering.delete(id)
    visited.add(id)
    ordered.push(entry)
  }
  for (const entry of entries) addAvailable(entry)

  return { entries: ordered, availability }
}
