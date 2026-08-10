import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { filterBladeUrl, poeItemFilterUrl } from '@shared/endpoints'

export { filterBladeUrl, poeItemFilterUrl }

/** OnlineFilters file basename is GGG's item-filter id (no extension). */
export function poeFilterIdFromOnlinePath(onlinePath: string | null | undefined): string | null {
  if (!onlinePath) return null
  const id = basename(onlinePath)
    .replace(/\.filter$/i, '')
    .trim()
  return id || null
}

/**
 * FilterBlade / NeverSink bridge helpers.
 *
 * FilterBlade has no public filter-download API Scalpel can call. Custom builds
 * land in PoE's OnlineFilters folder after the user Syncs from filterblade.xyz.
 * These helpers detect those online entries and prepare a Scalpel `-local` link.
 */

export interface FilterBladeCandidate {
  path: string
  name: string
  /** Higher = more likely a NeverSink / FilterBlade filter. */
  score: number
}

const NAME_HINTS = [
  /neversink/i,
  /\bns[-_ ]/i,
  /filterblade/i,
  /semi[-\s]?strict/i,
  /very[-\s]?strict/i,
  /\buber\b/i,
  /\bsoft\b/i,
  /\bstrict\b/i,
]

const CONTENT_HINTS = [/#\s*neversink/i, /neversink/i, /filterblade/i, /nsfilter/i]

/** Score how likely an online filter is a NeverSink / FilterBlade export. */
export function scoreFilterBladeCandidate(name: string, contentHead = ''): number {
  let score = 0
  for (const re of NAME_HINTS) {
    if (re.test(name)) score += 3
  }
  for (const re of CONTENT_HINTS) {
    if (re.test(contentHead)) score += 2
  }
  // Generic online filters still linkable — small base score so Scan & Link
  // can import whatever the user just synced even if naming is custom.
  if (score === 0 && name.trim()) score = 1
  return score
}

function readHead(path: string, maxLines = 40): string {
  try {
    return readFileSync(path, 'utf-8').split(/\r?\n/).slice(0, maxLines).join('\n')
  } catch {
    return ''
  }
}

function readOnlineName(fullPath: string, fallback: string): string {
  const head = readHead(fullPath, 15)
  for (const line of head.split('\n')) {
    const match = line.match(/^#name:(.+)/)
    if (match) return match[1].trim()
  }
  return fallback
}

/** List OnlineFilters entries ranked for FilterBlade / NeverSink linking. */
export function listFilterBladeCandidates(filterDir: string): FilterBladeCandidate[] {
  const results: FilterBladeCandidate[] = []
  if (!filterDir || !existsSync(filterDir)) return results
  let onlineDirName: string | undefined
  try {
    onlineDirName = readdirSync(filterDir).find((f) => f.toLowerCase() === 'onlinefilters')
  } catch {
    return results
  }
  if (!onlineDirName) return results
  const onlinePath = join(filterDir, onlineDirName)
  if (!existsSync(onlinePath)) return results

  for (const f of readdirSync(onlinePath)) {
    if (f.toLowerCase().endsWith('.filter')) continue
    const fullPath = join(onlinePath, f)
    try {
      if (statSync(fullPath).isDirectory()) continue
    } catch {
      continue
    }
    const name = readOnlineName(fullPath, f)
    const head = readHead(fullPath)
    const score = scoreFilterBladeCandidate(name, head)
    if (score <= 0) continue
    results.push({ path: fullPath, name, score })
  }

  return results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
}

export interface LinkFilterBladeResult {
  ok: boolean
  error?: string
  /** True when OnlineFilters is empty — user still needs to Sync from FilterBlade. */
  needsSync?: boolean
  candidates?: Array<{ name: string; path: string; score: number }>
  linked?: {
    onlineName: string
    onlinePath: string
    localPath: string
    localName: string
    alreadyLinked: boolean
  }
}

/**
 * Pick the best OnlineFilters candidate (or a named one) and describe the
 * `-local` path Scalpel should use. Does not write files — the IPC handler
 * performs importOnlineFilter / conflict checks.
 */
export function resolveFilterBladeLink(filterDir: string, preferName?: string | null): LinkFilterBladeResult {
  const candidates = listFilterBladeCandidates(filterDir)
  if (candidates.length === 0) {
    return {
      ok: false,
      needsSync: true,
      error:
        'No online filters found. Follow a shared filter on pathofexile.com (or Sync from FilterBlade), select it once in-game, then Scan & Link again.',
      candidates: [],
    }
  }

  let chosen = candidates[0]
  if (preferName) {
    const match = candidates.find((c) => c.name === preferName || c.name.toLowerCase() === preferName.toLowerCase())
    if (match) chosen = match
  }

  const safeName = chosen.name.replace(/[<>:"/\\|?*]/g, '_')
  const localName = `${safeName}-local`
  const localPath = join(filterDir, `${localName}.filter`)
  const alreadyLinked = existsSync(localPath)

  return {
    ok: true,
    candidates: candidates.map((c) => ({ name: c.name, path: c.path, score: c.score })),
    linked: {
      onlineName: chosen.name,
      onlinePath: chosen.path,
      localPath,
      localName,
      alreadyLinked,
    },
  }
}

/** True when the active Scalpel filter path looks like a linked `-local` copy. */
export function isLinkedLocalFilterPath(filterPath: string | null | undefined): boolean {
  if (!filterPath) return false
  return basename(filterPath, '.filter').endsWith('-local')
}
