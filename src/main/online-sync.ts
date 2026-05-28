import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserWindow } from 'electron'

/** Map of online filter path -> last known MD5 hash */
const knownHashes = new Map<string, string>()

let pollInterval: ReturnType<typeof setInterval> | null = null
let currentFilterDir: string | null = null
let getWindows: () => BrowserWindow[] = () => []

function md5(content: string): string {
  return createHash('md5').update(content, 'utf-8').digest('hex')
}

interface OnlineFilterInfo {
  path: string
  name: string
  hash: string
}

/** Scan the OnlineFilters subfolder and return path/name/hash for each file */
function scanOnlineFilters(filterDir: string): OnlineFilterInfo[] {
  const results: OnlineFilterInfo[] = []
  try {
    const onlineDir = readdirSync(filterDir).find((f) => f.toLowerCase() === 'onlinefilters')
    if (!onlineDir) return results
    const onlinePath = join(filterDir, onlineDir)
    if (!existsSync(onlinePath)) return results

    for (const f of readdirSync(onlinePath)) {
      const fullPath = join(onlinePath, f)
      try {
        if (statSync(fullPath).isDirectory()) continue
      } catch {
        continue
      }

      let name = f
      try {
        const content = readFileSync(fullPath, 'utf-8')
        for (const line of content.split('\n').slice(0, 15)) {
          const match = line.match(/^#name:(.+)/)
          if (match) {
            name = match[1].trim()
            break
          }
        }
        results.push({ path: fullPath, name, hash: md5(content) })
      } catch {
        /* skip unreadable files */
      }
    }
  } catch {
    /* ignore */
  }
  return results
}

/** Build initial hash map for the current filter directory */
function buildInitialHashes(filterDir: string): void {
  knownHashes.clear()
  for (const f of scanOnlineFilters(filterDir)) {
    knownHashes.set(f.path, f.hash)
  }
}

/** Check for changes and notify renderer windows */
function checkForChanges(filterDir: string): void {
  const current = scanOnlineFilters(filterDir)
  const changed: { path: string; name: string }[] = []

  for (const f of current) {
    const prev = knownHashes.get(f.path)
    if (!prev) {
      changed.push({ path: f.path, name: f.name })
    } else if (prev !== f.hash) {
      changed.push({ path: f.path, name: f.name })
    }
    knownHashes.set(f.path, f.hash)
  }

  if (changed.length > 0) {
    for (const win of getWindows()) {
      win.webContents.send('online-filter-changed', changed)
    }
  }
}

/** Start polling for online filter changes. Safe to call with an empty
 *  filterDir — the interval runs regardless so a later `updateOnlineSyncDir`
 *  call can begin watching without the caller needing to restart polling. */
export function startOnlineSync(filterDir: string, windowProvider: () => BrowserWindow[]): void {
  stopOnlineSync()
  currentFilterDir = filterDir || null
  getWindows = windowProvider
  if (filterDir) buildInitialHashes(filterDir)
  pollInterval = setInterval(() => {
    if (currentFilterDir) checkForChanges(currentFilterDir)
  }, 5_000)
}

/** Update the watched directory (e.g. when user changes filter folder).
 *  Clears tracked hashes when `filterDir` is empty so a later re-point
 *  doesn't treat old files as already known. */
export function updateOnlineSyncDir(filterDir: string): void {
  currentFilterDir = filterDir || null
  if (filterDir) buildInitialHashes(filterDir)
  else knownHashes.clear()
}

/** Stop polling */
export function stopOnlineSync(): void {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
  knownHashes.clear()
}

/** Force an immediate check (e.g. when app regains focus) */
export function checkOnlineSyncNow(): void {
  if (currentFilterDir) checkForChanges(currentFilterDir)
}

// ---- test-only exports (used by unit tests) ---------------------------
export { checkForChanges, scanOnlineFilters }
