import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { net } from 'electron'
import { PLUGIN_REGISTRY_URL } from '../../shared/endpoints'
import type { RegistryEntry, RegistrySnapshot } from '../../shared/plugin-registry-types'
import { PLUGIN_ID_PATTERN } from './manifest-validator'
import { pluginsDir } from './paths'

export type FetchResult = { ok: true; snapshot: RegistrySnapshot } | { ok: false; error: string }

interface CachedRegistry {
  etag: string | null
  snapshot: RegistrySnapshot
}

function cachePath(): string {
  return join(pluginsDir(), 'registry-cache.json')
}

function readCache(): CachedRegistry | null {
  const p = cachePath()
  if (!existsSync(p)) return null
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8'))
    if (parsed && typeof parsed === 'object' && parsed.snapshot) {
      return parsed as CachedRegistry
    }
  } catch {
    return null
  }
  return null
}

function writeCache(cache: CachedRegistry): void {
  const p = cachePath()
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(cache))
}

function validateSnapshot(raw: unknown): RegistrySnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.schemaVersion !== 1) return null
  if (!Array.isArray(o.plugins)) return null
  const plugins: RegistryEntry[] = []
  for (const p of o.plugins) {
    if (!p || typeof p !== 'object') continue
    const e = p as Record<string, unknown>
    if (typeof e.id !== 'string' || !PLUGIN_ID_PATTERN.test(e.id)) continue
    if (typeof e.name !== 'string' || typeof e.author !== 'string') continue
    if (typeof e.description !== 'string') continue
    if (typeof e.repo !== 'string' || !/^\w[\w.-]*\/\w[\w.-]*$/.test(e.repo)) continue
    if (typeof e.latestVersion !== 'string' || typeof e.scalpelMinVersion !== 'string') continue
    if (typeof e.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(e.sha256)) continue
    plugins.push({
      id: e.id,
      name: e.name,
      author: e.author,
      description: e.description,
      repo: e.repo,
      latestVersion: e.latestVersion,
      scalpelMinVersion: e.scalpelMinVersion,
      sha256: e.sha256,
      poeVersions:
        Array.isArray(e.poeVersions) && e.poeVersions.every((x) => x === 1 || x === 2)
          ? (e.poeVersions as (1 | 2)[])
          : undefined,
      iconUrl: typeof e.iconUrl === 'string' ? e.iconUrl : undefined,
      homepage: typeof e.homepage === 'string' ? e.homepage : undefined,
      screenshots:
        Array.isArray(e.screenshots) && e.screenshots.every((s) => typeof s === 'string')
          ? (e.screenshots as string[])
          : undefined,
    })
  }
  return { schemaVersion: 1, plugins }
}

export async function fetchRegistry(overrideUrl?: string): Promise<FetchResult> {
  const url = overrideUrl ?? PLUGIN_REGISTRY_URL
  const cached = readCache()
  const headers: Record<string, string> = { accept: 'application/json' }
  if (cached?.etag) headers['if-none-match'] = cached.etag

  let response: Response
  try {
    response = await net.fetch(url, { headers })
  } catch {
    if (cached) return { ok: true, snapshot: cached.snapshot }
    return { ok: false, error: 'registry fetch failed and no cache available' }
  }

  if (response.status === 304 && cached) {
    return { ok: true, snapshot: cached.snapshot }
  }
  if (response.status !== 200) {
    if (cached) return { ok: true, snapshot: cached.snapshot }
    return { ok: false, error: `registry fetch returned ${response.status}` }
  }

  let parsed: unknown
  try {
    parsed = await response.json()
  } catch {
    if (cached) return { ok: true, snapshot: cached.snapshot }
    return { ok: false, error: 'registry response was not valid JSON' }
  }

  const snapshot = validateSnapshot(parsed)
  if (!snapshot) {
    if (cached) return { ok: true, snapshot: cached.snapshot }
    return { ok: false, error: 'registry failed schema validation' }
  }

  writeCache({ etag: response.headers.get('etag'), snapshot })
  return { ok: true, snapshot }
}
