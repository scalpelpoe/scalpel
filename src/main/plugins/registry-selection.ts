import type { RegistryEntry } from '@shared/plugin-registry-types'
import { PLUGIN_ID_PATTERN } from './manifest-validator'
import { fetchRegistry } from './registry'

type RegistryFetcher = typeof fetchRegistry

export async function resolveRegistrySelection(
  selection: unknown,
  overrideUrl?: string,
  fetcher: RegistryFetcher = fetchRegistry,
): Promise<{ ok: true; entry: RegistryEntry } | { ok: false; error: string }> {
  if (!selection || typeof selection !== 'object') return { ok: false, error: 'invalid registry entry' }
  const requestedId = (selection as { id?: unknown }).id
  if (typeof requestedId !== 'string' || !PLUGIN_ID_PATTERN.test(requestedId)) {
    return { ok: false, error: 'invalid registry entry id' }
  }
  const result = await fetcher(overrideUrl)
  if (!result.ok) return result
  const entry = result.snapshot.plugins.find((candidate) => candidate.id === requestedId)
  if (!entry) return { ok: false, error: `plugin "${requestedId}" is not in the registry` }
  return { ok: true, entry }
}
