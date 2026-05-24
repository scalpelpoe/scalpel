import bundled from '../../manifest.json'
import { MANIFEST_URL } from '../shared/endpoints'
import type { Manifest } from '../shared/types'

// Imported directly so the manifest is baked into app.asar. The auto-updater
// only ships app.asar; using extraResources broke updates from older builds
// that never had the file on disk.
let cached: Manifest = bundled as Manifest

export function getManifest(): Manifest {
  return cached
}

function isStringRecord(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value).every((v) => typeof v === 'string')
}

function isValidManifest(value: unknown): value is Manifest {
  if (!value || typeof value !== 'object') return false
  const m = value as Record<string, unknown>
  if (!m.ninjaLeagues || typeof m.ninjaLeagues !== 'object') return false
  const nl = m.ninjaLeagues as Record<string, unknown>
  if (!isStringRecord(nl.poe1) || !isStringRecord(nl.poe2)) return false
  return isStringRecord(m.poe2NinjaCategories)
}

export async function refreshManifest(): Promise<void> {
  try {
    const res = await fetch(MANIFEST_URL, {
      headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Scalpel-Manifest', Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const parsed = await res.json()
    if (isValidManifest(parsed)) {
      cached = parsed
    } else if (process.env.SCALPEL_DEBUG_LOG) {
      console.warn('[manifest] remote manifest failed shape validation, keeping bundled copy')
    }
  } catch (e) {
    if (process.env.SCALPEL_DEBUG_LOG) {
      console.warn('[manifest] fetch failed, keeping bundled copy:', e)
    }
  }
}
