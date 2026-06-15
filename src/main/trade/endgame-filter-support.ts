import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import bundled from '@shared/data/trade/endgame-filter-support.json'
import { ENDGAME_FILTER_SUPPORT_URL } from '@shared/endpoints'

/** Which PoE2 trade2 "Endgame Filters" GGG actually indexes for search changes
 *  league-to-league (live-probed, not announced). Hard-coding it in source means
 *  a full app release to flip one flag, so the allowlist is remote-overridable
 *  the same way premium-mods / tier-data are: bundled offline floor -> userData
 *  cache -> raw.githubusercontent main on launch. A push to main re-enables (or
 *  suppresses) a chip for all users without a rebuild. */

const SCHEMA_VERSION = 1

interface EndgameFilterSupport {
  schemaVersion: number
  /** Chip ids (e.g. "map.map_tier") whose trade2 key returns results. */
  indexedKeys: string[]
}

const bundledKeys = (bundled as EndgameFilterSupport).indexedKeys

// Active allowlist of indexed endgame-filter chip ids. Initialised from the
// bundled floor so unit tests and the pre-load window have a correct default
// without awaiting loadEndgameFilterSupport().
let active = new Set<string>(bundledKeys)

/** True when the chip's trade2 key is currently indexed (so a search using it
 *  returns results rather than silently coming back empty). */
export function isEndgameFilterIndexed(chipId: string): boolean {
  return active.has(chipId)
}

export function _setIndexedEndgameKeysForTests(keys: string[] | null): void {
  active = new Set(keys ?? bundledKeys)
}

function isValid(value: unknown): value is EndgameFilterSupport {
  if (!value || typeof value !== 'object') return false
  const d = value as Record<string, unknown>
  return (
    typeof d.schemaVersion === 'number' &&
    Array.isArray(d.indexedKeys) &&
    d.indexedKeys.every((k) => typeof k === 'string')
  )
}

/** Adopt the allowlist if it is shape-valid and schema-compatible with this build. */
function apply(data: unknown): boolean {
  if (!isValid(data) || data.schemaVersion !== SCHEMA_VERSION) return false
  active = new Set(data.indexedKeys)
  return true
}

function cachePath(): string {
  return path.join(app.getPath('userData'), 'trade', 'endgame-filter-support.json')
}

/** Load the cached userData override over the bundled floor. Call once on app
 *  start. Dev keeps the bundled copy so local edits apply without a push to main
 *  (mirrors premium-mods / tier-data). */
export async function loadEndgameFilterSupport(): Promise<void> {
  if (!app.isPackaged) return
  try {
    apply(JSON.parse(await fs.readFile(cachePath(), 'utf8')))
  } catch {
    /* no cache yet - keep bundled */
  }
}

/** Fetch the allowlist from main and swap it in. No manifest/hash gate: the
 *  payload is a few hundred bytes, so we just re-fetch on launch. */
export async function refreshEndgameFilterSupport(): Promise<void> {
  if (!app.isPackaged) return
  try {
    const res = await fetch(ENDGAME_FILTER_SUPPORT_URL, {
      headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'Scalpel-EndgameFilters' },
    })
    if (!res.ok) return
    const text = await res.text()
    if (!apply(JSON.parse(text))) return
    await fs.mkdir(path.dirname(cachePath()), { recursive: true })
    await fs.writeFile(cachePath(), text, 'utf8')
  } catch (e) {
    if (process.env.SCALPEL_DEBUG_LOG) console.warn('[endgame-filters] refresh failed, keeping current copy:', e)
  }
}
