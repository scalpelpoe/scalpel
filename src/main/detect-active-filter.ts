import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { FilterListEntry, GameVariant } from '@shared/types'
import { resolveGameConfigPath } from './game-config'

/** Resolve the default PoE filter folder under Documents. */
export function resolveFilterFolder(version: GameVariant, documentsDir: string): string {
  const gameFolder = version === 2 ? 'Path of Exile 2' : 'Path of Exile'
  return join(documentsDir, 'My Games', gameFolder)
}

/**
 * Parse the active filter id/name from a PoE production_Config.ini.
 * Prefer `item_filter_loaded_successfully` when present (what actually loaded),
 * otherwise fall back to `item_filter`.
 */
export function parseActiveItemFilterId(iniContent: string): string | null {
  const loaded = iniContent.match(/^\s*item_filter_loaded_successfully\s*=\s*([^\r\n]+)/m)
  const selected = iniContent.match(/^\s*item_filter\s*=\s*([^\r\n]+)/m)
  const raw = (loaded?.[1] ?? selected?.[1] ?? '').trim()
  return raw || null
}

function readOnlineFilterName(fullPath: string, fallback: string): string {
  try {
    const content = readFileSync(fullPath, 'utf-8')
    for (const line of content.split('\n').slice(0, 15)) {
      const match = line.match(/^#name:(.+)/)
      if (match) return match[1].trim()
    }
  } catch {
    /* ignore */
  }
  return fallback
}

function findOnlineFiltersDir(filterDir: string): string | null {
  if (!existsSync(filterDir)) return null
  try {
    const name = readdirSync(filterDir).find((f) => f.toLowerCase() === 'onlinefilters')
    return name ? join(filterDir, name) : null
  } catch {
    return null
  }
}

function safeLocalStem(name: string): string {
  return `${name.replace(/[<>:"/\\|?*]/g, '_')}-local`
}

export interface DetectedActiveFilter {
  /** Absolute path to the game's filter folder. */
  filterDir: string
  /** Absolute path to the active filter file (online id file or .filter). */
  filterPath: string
  /** Display / Scalpel list name (from #name: for online filters). */
  name: string
  /** True when the active in-game filter is an OnlineFilters entry. */
  online: boolean
  /** Raw `item_filter` value from the config. */
  filterId: string
  /** Existing Scalpel local copy path if present (`<name>-local.filter`). */
  localCopyPath: string | null
}

export type DetectActiveFilterResult =
  | {
      ok: true
      detected: DetectedActiveFilter
    }
  | {
      ok: false
      error: string
    }

/**
 * Folders to search when resolving the active in-game filter.
 *
 * Always prefer the real PoE Documents folder (where OnlineFilters lives).
 * Optionally also search a user-selected subfolder (e.g. .../Neversink) for
 * local .filter files — but never *only* that subfolder, or online filters
 * like 9lives will be missed.
 */
function resolveSearchDirs(version: GameVariant, documentsDir: string, filterDirOverride?: string): string[] {
  const gameDir = resolveFilterFolder(version, documentsDir)
  const dirs: string[] = []
  const push = (dir: string | undefined): void => {
    const trimmed = dir?.trim()
    if (!trimmed) return
    if (dirs.some((d) => d.toLowerCase() === trimmed.toLowerCase())) return
    dirs.push(trimmed)
  }
  push(gameDir)
  push(filterDirOverride)
  return dirs
}

function tryResolveInDir(filterDir: string, filterId: string): DetectedActiveFilter | null {
  if (!existsSync(filterDir)) return null

  // 1) Local `<id>.filter` first — game stores "9lives-local" when that file is active
  const localCandidates = [
    join(filterDir, filterId.endsWith('.filter') ? filterId : `${filterId}.filter`),
    join(filterDir, filterId),
  ]
  for (const path of localCandidates) {
    if (!existsSync(path)) continue
    try {
      if (!statSync(path).isFile()) continue
    } catch {
      continue
    }
    const name = basename(path).replace(/\.filter$/i, '')
    return {
      filterDir,
      filterPath: path,
      name,
      online: false,
      filterId,
      localCopyPath: null,
    }
  }

  try {
    for (const f of readdirSync(filterDir)) {
      if (!f.toLowerCase().endsWith('.filter')) continue
      const stem = basename(f, '.filter')
      if (stem.toLowerCase() === filterId.toLowerCase()) {
        return {
          filterDir,
          filterPath: join(filterDir, f),
          name: stem,
          online: false,
          filterId,
          localCopyPath: null,
        }
      }
    }
  } catch {
    /* ignore */
  }

  // 2) OnlineFilters/<id> (GGG online filter download)
  const onlineDir = findOnlineFiltersDir(filterDir)
  if (onlineDir) {
    const onlinePath = join(onlineDir, filterId)
    if (existsSync(onlinePath)) {
      try {
        if (statSync(onlinePath).isFile()) {
          const name = readOnlineFilterName(onlinePath, filterId)
          const localCopy = join(filterDir, `${safeLocalStem(name)}.filter`)
          return {
            filterDir,
            filterPath: onlinePath,
            name,
            online: true,
            filterId,
            localCopyPath: existsSync(localCopy) ? localCopy : null,
          }
        }
      } catch {
        /* fall through */
      }
    }

    // Match by #name: header (and by "<name>-local" → online "<name>")
    const nameToFind = filterId.toLowerCase().endsWith('-local')
      ? filterId.slice(0, -'-local'.length).toLowerCase()
      : filterId.toLowerCase()
    try {
      for (const f of readdirSync(onlineDir)) {
        if (f.toLowerCase().endsWith('.filter')) continue
        const fullPath = join(onlineDir, f)
        try {
          if (!statSync(fullPath).isFile()) continue
        } catch {
          continue
        }
        const name = readOnlineFilterName(fullPath, f)
        if (name.toLowerCase() === nameToFind || f.toLowerCase() === filterId.toLowerCase()) {
          const localCopy = join(filterDir, `${safeLocalStem(name)}.filter`)
          return {
            filterDir,
            filterPath: fullPath,
            name,
            online: true,
            filterId,
            localCopyPath: existsSync(localCopy) ? localCopy : null,
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  return null
}

/**
 * Detect which loot filter PoE currently has selected by reading the game
 * config and resolving it against the filter folder / OnlineFilters.
 */
export function detectActiveFilter(
  version: GameVariant,
  documentsDir: string,
  filterDirOverride?: string,
): DetectActiveFilterResult {
  const configPath = resolveGameConfigPath(version, documentsDir)

  if (!existsSync(configPath)) {
    return { ok: false, error: `Game config not found: ${configPath}` }
  }

  let ini: string
  try {
    ini = readFileSync(configPath, 'utf-8')
  } catch {
    return { ok: false, error: `Could not read game config: ${configPath}` }
  }

  const filterId = parseActiveItemFilterId(ini)
  if (!filterId) {
    return { ok: false, error: 'No active item filter set in game options' }
  }

  return detectFilterById(version, documentsDir, filterId, filterDirOverride)
}

/** Resolve a filter id (config value or OnlineFilters filename) to a DetectedActiveFilter. */
export function detectFilterById(
  version: GameVariant,
  documentsDir: string,
  filterId: string,
  filterDirOverride?: string,
): DetectActiveFilterResult {
  const id = filterId.trim()
  if (!id) return { ok: false, error: 'Empty filter id' }

  const searchDirs = resolveSearchDirs(version, documentsDir, filterDirOverride)
  for (const dir of searchDirs) {
    const hit = tryResolveInDir(dir, id)
    if (hit) return { ok: true, detected: hit }
  }

  const primary = searchDirs[0] ?? resolveFilterFolder(version, documentsDir)
  return {
    ok: false,
    error: `Active filter "${id}" not found in ${primary} (load it in-game once if it's an online filter)`,
  }
}

/** Convert a detection result into a FilterListEntry for the picker. */
export function detectedToListEntry(detected: DetectedActiveFilter): FilterListEntry {
  return {
    path: detected.localCopyPath ?? detected.filterPath,
    name: detected.localCopyPath
      ? basename(detected.localCopyPath, '.filter')
      : detected.name,
    online: detected.online && !detected.localCopyPath,
  }
}
