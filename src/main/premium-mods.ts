import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { PREMIUM_MODS_MANIFEST_URL, PREMIUM_MODS_URL } from '../shared/endpoints'
import { PREMIUM_MODS_SCHEMA_VERSION } from '../shared/data/items/premium-mods-types'
import type { PremiumModsData } from '../shared/data/items/premium-mods-types'

let active: PremiumModsData | null = null
let localHash: string | null = null

export function getPremiumMods(): PremiumModsData | null {
  return active
}

export function _setPremiumModsForTests(data: PremiumModsData | null): void {
  active = data
}

function isValidData(value: unknown): value is PremiumModsData {
  if (!value || typeof value !== 'object') return false
  const d = value as Record<string, unknown>
  return (
    typeof d.schemaVersion === 'number' &&
    !!d.poe1 &&
    typeof d.poe1 === 'object' &&
    !!d.poe2 &&
    typeof d.poe2 === 'object'
  )
}

/** Adopt the dataset if it is shape-valid and schema-compatible with this build. */
export function applyRemotePremiumMods(data: unknown): void {
  if (!isValidData(data) || data.schemaVersion !== PREMIUM_MODS_SCHEMA_VERSION) return
  active = data
}

function cachePath(): string {
  return path.join(app.getPath('userData'), 'premium-mods', 'premium-mods.json')
}

/** Load the bundled premium-mods dataset (offline floor), then any cached
 *  userData override. Call once on app start. */
export async function loadPremiumMods(): Promise<void> {
  applyRemotePremiumMods((await import('../shared/data/items/premium-mods.json')).default)
  // Dev uses the bundled copy as the source of truth so local edits to
  // premium-mods.json take effect without a push to main. Skip the userData
  // cache + remote override (see refreshPremiumMods).
  if (!app.isPackaged) return
  try {
    const cached = await fs.readFile(cachePath(), 'utf8')
    applyRemotePremiumMods(JSON.parse(cached))
  } catch {
    /* no cache yet - keep bundled */
  }
}

/** Poll the remote manifest; if its hash changed and schema is compatible,
 *  download premium-mods.json, cache it, and swap it in. */
export async function refreshPremiumMods(): Promise<void> {
  // Dev keeps the bundled copy (see loadPremiumMods); never let the remote
  // override a local premium-mods.json edit during development.
  if (!app.isPackaged) return
  try {
    const mres = await fetch(PREMIUM_MODS_MANIFEST_URL, {
      headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Scalpel-PremiumMods' },
    })
    if (!mres.ok) return
    const manifest = (await mres.json()) as { schemaVersion: number; hash: string }
    if (manifest.schemaVersion !== PREMIUM_MODS_SCHEMA_VERSION) return
    if (manifest.hash === localHash) return
    const dres = await fetch(PREMIUM_MODS_URL, {
      headers: { 'User-Agent': 'Scalpel-PremiumMods' },
    })
    if (!dres.ok) return
    const text = await dres.text()
    const parsed = JSON.parse(text)
    applyRemotePremiumMods(parsed)
    if (getPremiumMods() !== parsed) return // rejected by validation / schema guard
    await fs.mkdir(path.dirname(cachePath()), { recursive: true })
    await fs.writeFile(cachePath(), text, 'utf8')
    localHash = manifest.hash
  } catch (e) {
    if (process.env.SCALPEL_DEBUG_LOG) console.warn('[premium-mods] refresh failed, keeping current copy:', e)
  }
}
