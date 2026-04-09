import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { BrowserWindow } from 'electron'

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
    if (prev && prev !== f.hash) {
      changed.push({ path: f.path, name: f.name })
    }
    knownHashes.set(f.path, f.hash)
  }

  // Also detect new files (not previously tracked)
  for (const f of current) {
    if (!knownHashes.has(f.path)) {
      knownHashes.set(f.path, f.hash)
    }
  }

  if (changed.length > 0) {
    for (const win of getWindows()) {
      win.webContents.send('online-filter-changed', changed)
    }
  }
}

/** Start polling for online filter changes */
export function startOnlineSync(filterDir: string, windowProvider: () => BrowserWindow[]): void {
  stopOnlineSync()
  currentFilterDir = filterDir
  getWindows = windowProvider
  buildInitialHashes(filterDir)
  pollInterval = setInterval(() => {
    if (currentFilterDir) checkForChanges(currentFilterDir)
  }, 5_000)
}

/** Update the watched directory (e.g. when user changes filter folder) */
export function updateOnlineSyncDir(filterDir: string): void {
  currentFilterDir = filterDir
  buildInitialHashes(filterDir)
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
