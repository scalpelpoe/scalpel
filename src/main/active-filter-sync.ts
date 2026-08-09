import { existsSync, readFileSync, watch, writeFileSync } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { basename, join } from 'node:path'
import { app } from 'electron'
import type { BrowserWindow } from 'electron'
import type Store from 'electron-store'
import type { AppSettings, GameVariant } from '@shared/types'
import { saveBaseline } from './baselines'
import {
  detectActiveFilter,
  detectFilterById,
  type DetectedActiveFilter,
  parseActiveItemFilterId,
  resolveFilterFolder,
} from './detect-active-filter'
import { applyLocalNameHeader } from './filter/local-name'
import { resolveGameConfigPath, writeGameConfig } from './game-config'
import { getPoeVersion } from './game-state'
import { getProfileBackedSetting } from './profiles/profile-settings'
import { onClientLogLine } from './client-log'
import { parseOnlineFilterReloadLine } from './client-log/parse-client-log'

const backedUp = new Set<string>()

let watcher: FSWatcher | null = null
let debounce: NodeJS.Timeout | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let unsubClientLog: (() => void) | null = null
let storeRef: Store<AppSettings> | null = null
let getWindows: () => BrowserWindow[] = () => []
let lastSeenFilterId: string | null = null
/** Last online filter id observed from Client.txt reload lines. */
let lastLogFilterId: string | null = null
/** Ignore config changes we caused (or expected) until this timestamp. */
let ignoreConfigUntil = 0
const expectedFilterIds = new Set<string>()
/** Prevent re-entrant apply / app→game echo while applying a game→app sync. */
let applyingFromGame = false

export function isApplyingGameFilterSync(): boolean {
  return applyingFromGame
}

/** Pure: set / update item_filter keys in a PoE production_Config.ini body. */
export function setItemFilterInConfig(ini: string, filterId: string): string {
  const eol = ini.includes('\r\n') ? '\r\n' : ini.includes('\r') ? '\r' : '\n'
  const endsWithEol = /\r\n$|\n$|\r$/.test(ini)
  const lines = ini.split(/\r\n|\n|\r/)
  if (endsWithEol && lines[lines.length - 1] === '') lines.pop()

  let sawFilter = false
  let sawLoaded = false
  const out = lines.map((line) => {
    if (/^\s*item_filter_loaded_successfully\s*=/.test(line)) {
      sawLoaded = true
      return `item_filter_loaded_successfully=${filterId}`
    }
    if (/^\s*item_filter\s*=/.test(line)) {
      sawFilter = true
      return `item_filter=${filterId}`
    }
    return line
  })
  if (!sawFilter) out.push(`item_filter=${filterId}`)
  return out.join(eol) + (endsWithEol || !sawFilter ? eol : '')
}

/** Map a Scalpel filter path to the id PoE stores in item_filter=. */
export function filterIdFromScalpelPath(filterPath: string, filterDir: string): string {
  const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase()
  const online = join(filterDir, 'OnlineFilters')
  if (norm(filterPath).startsWith(norm(online) + '/') || norm(filterPath).startsWith(norm(online) + '\\')) {
    return basename(filterPath)
  }
  // Case-insensitive OnlineFilters folder name
  const parts = filterPath.replace(/\\/g, '/').split('/')
  const idx = parts.findIndex((p) => p.toLowerCase() === 'onlinefilters')
  if (idx >= 0 && idx < parts.length - 1) return parts[parts.length - 1]
  return basename(filterPath).replace(/\.filter$/i, '')
}

function safeLocalStem(name: string): string {
  return `${name.replace(/[<>:"/\\|?*]/g, '_')}-local`
}

/** Prefer the file the game is actually using; use -local only when game selected it
 *  or when we already have a local copy for an online selection (Scalpel edit target). */
export function pathForGameSelection(detected: DetectedActiveFilter): string {
  if (!detected.online) return detected.filterPath
  if (detected.localCopyPath) return detected.localCopyPath
  return detected.filterPath
}

/** Ensure an online filter has an editable `<name>-local.filter` copy. */
export function ensureEditableFilterPath(detected: DetectedActiveFilter): string {
  if (detected.localCopyPath) return detected.localCopyPath
  if (!detected.online) return detected.filterPath

  const localName = safeLocalStem(detected.name)
  const localPath = join(detected.filterDir, `${localName}.filter`)
  if (existsSync(localPath)) return localPath

  const originalContent = readFileSync(detected.filterPath, 'utf-8')
  saveBaseline(detected.name, originalContent, detected.filterPath, localPath)
  writeFileSync(localPath, applyLocalNameHeader(originalContent, localName), 'utf-8')
  return localPath
}

function expectFilterId(id: string, ms = 800): void {
  expectedFilterIds.add(id)
  ignoreConfigUntil = Math.max(ignoreConfigUntil, Date.now() + ms)
}

function broadcastActiveFilterSynced(payload: {
  filterId: string
  name: string
  filterPath: string
  filterDir: string
  source: 'game' | 'app'
}): void {
  for (const win of getWindows()) {
    if (!win.isDestroyed()) win.webContents.send('active-filter-synced', payload)
  }
}

async function writeGameItemFilter(version: GameVariant, filterId: string): Promise<void> {
  const configPath = resolveGameConfigPath(version, app.getPath('documents'))
  if (!existsSync(configPath)) return
  expectFilterId(filterId)
  const current = readFileSync(configPath, 'utf-8')
  const next = setItemFilterInConfig(current, filterId)
  if (next === current) {
    lastSeenFilterId = filterId
    return
  }
  await writeGameConfig(configPath, next, { backedUp, now: () => Date.now() })
  lastSeenFilterId = filterId
}

/**
 * App → game: after Scalpel selects a filter, mirror that into the game config
 * so Options / next launch stay aligned. Live in-game switch still uses
 * `/itemfilter` from the UI when requested.
 */
export async function syncScalpelSelectionToGame(filterPath: string, filterDir?: string): Promise<void> {
  if (!filterPath) return
  const version = getPoeVersion()
  const dir =
    filterDir?.trim() ||
    (storeRef ? (getProfileBackedSetting(storeRef, 'filterDir') as string) : '') ||
    resolveFilterFolder(version, app.getPath('documents'))
  const filterId = filterIdFromScalpelPath(filterPath, dir)
  if (!filterId) return
  try {
    await writeGameItemFilter(version, filterId)
    broadcastActiveFilterSynced({
      filterId,
      name: basename(filterPath).replace(/\.filter$/i, ''),
      filterPath,
      filterDir: dir,
      source: 'app',
    })
  } catch (err) {
    console.error('[FilterScalpel] Failed to write item_filter to game config:', err)
  }
}

/** Game → app: apply a detected active filter into the Scalpel profile. */
export async function applyGameFilterToScalpel(
  detected: DetectedActiveFilter,
): Promise<{ filterPath: string; filterDir: string }> {
  const store = storeRef
  if (!store) return { filterPath: '', filterDir: detected.filterDir }

  const { applyProfileSettingForGame } = await import('./settings-write')
  // Follow the game's selection. Prefer existing -local for online picks so Scalpel
  // edits a durable file; otherwise load the online file the game is using.
  const editablePath = pathForGameSelection(detected)
  const version = getPoeVersion()

  applyingFromGame = true
  try {
    if (getProfileBackedSetting(store, 'filterDir') !== detected.filterDir) {
      applyProfileSettingForGame(store, version, 'filterDir', detected.filterDir, null)
    }
    if (getProfileBackedSetting(store, 'filterPath') !== editablePath) {
      applyProfileSettingForGame(store, version, 'filterPath', editablePath, null)
    }
  } finally {
    applyingFromGame = false
  }

  broadcastActiveFilterSynced({
    filterId: detected.filterId,
    name: detected.name,
    filterPath: editablePath,
    filterDir: detected.filterDir,
    source: 'game',
  })

  return { filterPath: editablePath, filterDir: detected.filterDir }
}

function readCurrentFilterId(version: GameVariant): string | null {
  const configPath = resolveGameConfigPath(version, app.getPath('documents'))
  if (!existsSync(configPath)) return null
  try {
    return parseActiveItemFilterId(readFileSync(configPath, 'utf-8'))
  } catch {
    return null
  }
}

function syncFromFilterId(filterId: string, source: 'config' | 'client-log'): void {
  if (!storeRef || applyingFromGame) return
  if (!filterId) return

  if (source === 'config') {
    if (expectedFilterIds.has(filterId)) {
      expectedFilterIds.delete(filterId)
      lastSeenFilterId = filterId
      return
    }
    if (Date.now() < ignoreConfigUntil && filterId === lastSeenFilterId) return
    if (filterId === lastSeenFilterId) return
    lastSeenFilterId = filterId
  } else {
    if (filterId === lastLogFilterId) return
    lastLogFilterId = filterId
    // Client.txt is ahead of config.ini — treat this as the live selection.
    lastSeenFilterId = filterId
  }

  const result = detectFilterById(getPoeVersion(), app.getPath('documents'), filterId)
  if (!result.ok) {
    console.warn(`[FilterScalpel] Active filter sync (${source}): could not resolve`, filterId, result.error)
    return
  }

  const editable = pathForGameSelection(result.detected)
  const currentPath = getProfileBackedSetting(storeRef, 'filterPath') as string
  const currentDir = getProfileBackedSetting(storeRef, 'filterDir') as string
  if (currentPath === editable && currentDir === result.detected.filterDir) return

  console.log(
    `[FilterScalpel] Game filter changed (${source}) → syncing Scalpel to ${result.detected.name} (${filterId})`,
  )
  void applyGameFilterToScalpel(result.detected)
}

function handleConfigMaybeChanged(): void {
  if (!storeRef || applyingFromGame) return
  const filterId = readCurrentFilterId(getPoeVersion())
  if (!filterId) return
  syncFromFilterId(filterId, 'config')
}

function handleClientLogLine(line: string): void {
  const filterId = parseOnlineFilterReloadLine(line)
  if (!filterId) return
  syncFromFilterId(filterId, 'client-log')
}

function armWatcher(): void {
  if (watcher) {
    watcher.close()
    watcher = null
  }
  const version = getPoeVersion()
  const configPath = resolveGameConfigPath(version, app.getPath('documents'))
  if (!existsSync(configPath)) {
    console.warn('[FilterScalpel] Active filter sync: config missing', configPath)
    return
  }
  try {
    // Watch the file; PoE often replaces it atomically so this may go stale —
    // polling below is the reliable path for config. Client.txt covers live Options swaps.
    watcher = watch(configPath, { persistent: true }, () => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => handleConfigMaybeChanged(), 100)
    })
    watcher.on('error', () => {
      try {
        watcher?.close()
      } catch {
        /* ignore */
      }
      watcher = null
      setTimeout(() => armWatcher(), 1000)
    })
  } catch (err) {
    console.error('[FilterScalpel] Active filter sync: failed to watch config', err)
  }
}

/**
 * Start live game↔app active-filter sync.
 * - Config.ini poll/watch (when PoE persists item_filter)
 * - Client.txt "Finished reloading online filter" (live Options swaps; config often lags)
 */
export function startActiveFilterSync(store: Store<AppSettings>, windowProvider: () => BrowserWindow[]): void {
  stopActiveFilterSync()
  storeRef = store
  getWindows = windowProvider
  lastSeenFilterId = readCurrentFilterId(getPoeVersion())
  lastLogFilterId = null
  armWatcher()
  pollTimer = setInterval(() => handleConfigMaybeChanged(), 1000)
  unsubClientLog = onClientLogLine(handleClientLogLine)

  const currentPath = getProfileBackedSetting(store, 'filterPath') as string
  if (!currentPath && lastSeenFilterId) {
    const result = detectActiveFilter(getPoeVersion(), app.getPath('documents'))
    if (result.ok) void applyGameFilterToScalpel(result.detected)
  }
}

export function stopActiveFilterSync(): void {
  if (debounce) {
    clearTimeout(debounce)
    debounce = null
  }
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (unsubClientLog) {
    unsubClientLog()
    unsubClientLog = null
  }
  if (watcher) {
    watcher.close()
    watcher = null
  }
}
