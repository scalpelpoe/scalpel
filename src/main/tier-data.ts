import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { SCHEMA_VERSION } from '@shared/data/tiers/schema'
import { TIER_DATA_BASE_URL, TIER_DATA_MANIFEST_URL } from '@shared/endpoints'
import type { TierDataset } from '@shared/data/tiers/types'

let active: TierDataset | null = null
let localHash: string | null = null

export function getTierData(): TierDataset | null {
  return active
}

export function _setTierDataForTests(data: TierDataset | null): void {
  active = data
}

function isValidDataset(value: unknown): value is TierDataset {
  if (!value || typeof value !== 'object') return false
  const d = value as Record<string, unknown>
  return (
    typeof d.schemaVersion === 'number' &&
    Array.isArray(d.mods) &&
    Array.isArray(d.pools) &&
    !!d.bases &&
    typeof d.bases === 'object'
  )
}

/** Adopt a dataset if it is shape-valid and schema-compatible with this build. */
export function applyRemoteTierData(data: unknown): void {
  if (!isValidDataset(data) || data.schemaVersion !== SCHEMA_VERSION) return
  active = data
}

/** Load the active game's bundled dataset (offline floor), then any cached
 *  userData override. Call once after the game version is known. */
export async function loadTierData(version: 1 | 2): Promise<void> {
  const bundled =
    version === 1
      ? (await import('@shared/data/tiers/tiers-poe1.json')).default
      : (await import('@shared/data/tiers/tiers-poe2.json')).default
  applyRemoteTierData(bundled)
  try {
    const cached = await fs.readFile(cachePath(version), 'utf8')
    applyRemoteTierData(JSON.parse(cached))
  } catch {
    /* no cache yet - keep bundled */
  }
}

function cachePath(version: 1 | 2): string {
  return path.join(app.getPath('userData'), 'tier-data', `tiers-poe${version}.json`)
}

/** Poll the remote manifest; if its hash changed and schema is compatible,
 *  download the active game's dataset, cache it, and swap it in. */
export async function refreshTierData(version: 1 | 2): Promise<void> {
  try {
    const mres = await fetch(TIER_DATA_MANIFEST_URL, {
      headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Scalpel-TierData' },
    })
    if (!mres.ok) return
    const manifest = (await mres.json()) as { schemaVersion: number; hash: string }
    if (manifest.schemaVersion !== SCHEMA_VERSION) return
    if (manifest.hash === localHash) return
    const dres = await fetch(`${TIER_DATA_BASE_URL}tiers-poe${version}.json`, {
      headers: { 'User-Agent': 'Scalpel-TierData' },
    })
    if (!dres.ok) return
    const text = await dres.text()
    const parsed = JSON.parse(text)
    applyRemoteTierData(parsed)
    if (getTierData() !== parsed) return // rejected by validation / schema guard
    await fs.mkdir(path.dirname(cachePath(version)), { recursive: true })
    await fs.writeFile(cachePath(version), text, 'utf8')
    localHash = manifest.hash
  } catch (e) {
    if (process.env.SCALPEL_DEBUG_LOG) console.warn('[tier-data] refresh failed, keeping current copy:', e)
  }
}
