import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import bundledPoe1 from '../../shared/data/items/item-icons-poe1.json'
import bundledPoe2 from '../../shared/data/items/item-icons-poe2.json'

/**
 * Runtime icon cache. Observes trade-fetch responses and persists any icons
 * whose name/baseType isn't already in the shipped bundle. On next launch the
 * renderer merges the cache into iconMap so gaps fill organically as the user
 * searches for things we didn't ship icons for.
 *
 * Split logic for uniques vs non-uniques is load-bearing:
 *   - A unique's fetched icon is that unique's artwork (not the base's), so
 *     it belongs under the unique's NAME. Associating it with baseType would
 *     poison the base-type lookup with a unique-specific image and break
 *     rendering for every other roll of that base.
 *   - Non-unique rolls (Normal/Magic/Rare) all share the base's icon, so any
 *     one of them is a valid exemplar and we key by baseType.
 */

interface HarvestableItem {
  name?: string
  baseType?: string
  rarity?: string
  icon?: string
}

const BUNDLED: Record<1 | 2, Record<string, string>> = {
  1: bundledPoe1 as Record<string, string>,
  2: bundledPoe2 as Record<string, string>,
}

const loaded = new Map<1 | 2, Record<string, string>>()
const pendingWrite = new Map<1 | 2, NodeJS.Timeout>()
const WRITE_DEBOUNCE_MS = 2000

function cachePath(version: 1 | 2): string {
  return join(app.getPath('userData'), `icon-cache-poe${version}.json`)
}

export function loadIconCache(version: 1 | 2): Record<string, string> {
  const cached = loaded.get(version)
  if (cached) return cached
  let data: Record<string, string> = {}
  try {
    const p = cachePath(version)
    if (existsSync(p)) data = JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    /* corrupt cache: start fresh */
  }
  loaded.set(version, data)
  return data
}

/** Pull name->icon from a trade-fetch response and persist any new mappings.
 *  Keying is rarity-aware (see file header). Already-bundled keys are skipped
 *  so ship-time icons always win over runtime ones. Returns only the pairs
 *  that were newly added, so the caller can push them to the renderer and
 *  have the in-session iconMap update without waiting for a restart. */
export function harvestIcons(version: 1 | 2, items: HarvestableItem[]): Record<string, string> {
  const cache = loadIconCache(version)
  const bundled = BUNDLED[version]
  const added: Record<string, string> = {}
  for (const item of items) {
    if (!item.icon) continue
    const key = item.rarity === 'Unique' ? item.name : item.baseType
    if (!key) continue
    if (bundled[key] || cache[key]) continue
    cache[key] = item.icon
    added[key] = item.icon
  }
  if (Object.keys(added).length > 0) scheduleWrite(version)
  return added
}

function scheduleWrite(version: 1 | 2): void {
  const existing = pendingWrite.get(version)
  if (existing) clearTimeout(existing)
  pendingWrite.set(
    version,
    setTimeout(() => {
      pendingWrite.delete(version)
      try {
        writeFileSync(cachePath(version), JSON.stringify(loaded.get(version) ?? {}))
      } catch (e) {
        console.error('[icon-cache] write failed:', e)
      }
    }, WRITE_DEBOUNCE_MS),
  )
}
