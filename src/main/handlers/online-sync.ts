import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { ipcMain } from 'electron'
import type Store from 'electron-store'
import type { AppSettings } from '@shared/types'
import { getBaselineByLocalPath, saveBaseline } from '../baselines'
import { clearIntents, getIntents } from '../filter/intent-recorder'
import { replayIntents } from '../filter/intent-replay'
import { applyLocalNameHeader } from '../filter/local-name'
import { writeFilterSelective } from '../filter/writer'
import { loadFilter } from '../filter-state'
import { switchFilterInGame } from '../overlay'
import { saveVersion } from '../update/versions'
import { checkOnlineSyncNow } from '../online-sync'
import { getProfileBackedSetting } from '../profiles/profile-settings'

/** Look up the online filter name and path for the currently active local filter */
function findOnlineFilter(
  store: Store<AppSettings>,
): { onlineFilterName: string; onlineFilePath: string; localFileName: string; localPath: string } | { error: string } {
  const filterDir = getProfileBackedSetting(store, 'filterDir') as string
  const filterPath = getProfileBackedSetting(store, 'filterPath') as string
  if (!filterDir || !filterPath) return { error: 'No filter configured' }

  const localFileName = basename(filterPath, '.filter')
  if (!localFileName.endsWith('-local')) return { error: 'Active filter is not an imported online filter' }

  const safeName = localFileName.slice(0, -'-local'.length)

  const onlineDirName = readdirSync(filterDir).find((f) => f.toLowerCase() === 'onlinefilters')
  if (!onlineDirName) return { error: 'No OnlineFilters folder found' }

  const onlineDirPath = join(filterDir, onlineDirName)

  for (const f of readdirSync(onlineDirPath)) {
    const fullPath = join(onlineDirPath, f)
    try {
      if (statSync(fullPath).isDirectory()) continue
      const content = readFileSync(fullPath, 'utf-8')
      for (const line of content.split('\n').slice(0, 15)) {
        const match = line.match(/^#name:(.+)/)
        if (match) {
          const name = match[1].trim()
          if (name.replace(/[<>:"/\\|?*]/g, '_') === safeName) {
            return { onlineFilterName: name, onlineFilePath: fullPath, localFileName, localPath: filterPath }
          }
          break
        }
      }
    } catch {
      /* skip */
    }
  }

  return { error: 'Could not find matching online filter' }
}

export function register(store: Store<AppSettings>): void {
  ipcMain.handle(
    'import-online-filter',
    (
      _event,
      sourcePath: string,
      filterName: string,
      targetDir: string,
      force = false,
    ): { ok: boolean; path?: string; error?: string; conflict?: boolean } => {
      try {
        const safeName = filterName.replace(/[<>:"/\\|?*]/g, '_')
        const localName = `${safeName}-local`
        const targetPath = join(targetDir, `${localName}.filter`)
        // Warn if a local copy already exists (may contain user edits)
        if (!force && existsSync(targetPath)) {
          return { ok: false, conflict: true }
        }
        // Read original online content and store as baseline for future merges
        const originalContent = readFileSync(sourcePath, 'utf-8')
        saveBaseline(filterName, originalContent, sourcePath, targetPath)
        // Copy file and update #name: header so PoE recognises the local copy
        const content = applyLocalNameHeader(originalContent, localName)
        writeFileSync(targetPath, content, 'utf-8')
        clearIntents()
        // Set as active filter
        return { ok: true, path: targetPath }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  )

  ipcMain.handle('switch-ingame-filter', async (_event, filterName: string, currentFilter?: string) => {
    await switchFilterInGame(filterName, currentFilter)
    return { ok: true }
  })

  ipcMain.handle('check-online-update', async (): Promise<{ ok: boolean; error?: string }> => {
    const result = findOnlineFilter(store)
    if ('error' in result) return { ok: false, error: result.error }

    // Switch to online filter (triggers PoE to download latest), then switch back to local
    await switchFilterInGame(result.localFileName, result.onlineFilterName)
    // Force an immediate hash check after a short delay to let PoE write the file
    setTimeout(() => checkOnlineSyncNow(), 2000)
    return { ok: true }
  })

  ipcMain.handle('online-sync-status', (): { hasOnlineSource: boolean } => {
    // True only when the online source file is actually present in OnlineFilters.
    // Every error case (no folder, no #name match, not a -local filter) -> false.
    const result = findOnlineFilter(store)
    return { hasOnlineSource: !('error' in result) }
  })

  ipcMain.handle('filter-reset-availability', (): { canReset: boolean } => {
    const filterPath = getProfileBackedSetting(store, 'filterPath') as string
    if (!filterPath || !basename(filterPath, '.filter').endsWith('-local')) return { canReset: false }
    return { canReset: getBaselineByLocalPath(filterPath) !== null }
  })

  ipcMain.handle('reset-filter-to-online', async (): Promise<{ ok: boolean; error?: string }> => {
    const filterPath = getProfileBackedSetting(store, 'filterPath') as string
    if (!filterPath) return { ok: false, error: 'No filter configured' }
    const localFileName = basename(filterPath, '.filter')
    if (!localFileName.endsWith('-local')) return { ok: false, error: 'Active filter is not an imported online filter' }
    const baseline = getBaselineByLocalPath(filterPath)
    if (!baseline) return { ok: false, error: 'No baseline found for this filter' }
    try {
      // Reversible checkpoint of the pre-reset (edited) file.
      saveVersion(filterPath, true, 'Before reset')
      // Overwrite with the clean baseline, keeping the -local #name header.
      writeFileSync(filterPath, applyLocalNameHeader(baseline.content, localFileName), 'utf-8')
      // Discard recorded edits so a later sync does not re-apply them.
      clearIntents()
      loadFilter(filterPath, 'Filter Reset')
      await switchFilterInGame(localFileName, localFileName)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  })

  ipcMain.handle(
    'quick-update-filter',
    async (): Promise<{
      ok: boolean
      error?: string
      stats?: {
        unchanged: number
        upstreamOnly: number
        userOnly: number
        bothChanged: number
        added: number
        removed: number
        skippedForValidity?: number
      }
      conflicts?: Array<{ description: string; actionType: string }>
    }> => {
      const info = findOnlineFilter(store)
      if ('error' in info) return { ok: false, error: info.error }

      try {
        const upstreamContent = readFileSync(info.onlineFilePath, 'utf-8')
        // Keep the local copy's "-local" #name header (matching import); the
        // baseline below still stores the original upstream content.
        const localContent = applyLocalNameHeader(upstreamContent, info.localFileName)
        const intentLog = getIntents()

        let skippedForValidity = 0
        if (intentLog.intents.length === 0) {
          // No intents - overwrite with upstream
          writeFileSync(info.localPath, localContent, 'utf-8')
        } else {
          const result = replayIntents(localContent, info.localPath, intentLog, { forceApply: true })
          const { fallbackBlocks } = writeFilterSelective(result.filter, result.modifiedBlocks, result.removedBlocks)
          skippedForValidity = fallbackBlocks.length
          if (fallbackBlocks.length > 0 && process.env.SCALPEL_DEBUG_LOG) {
            console.warn(
              '[online-sync] quick-update dropped edits to keep filter valid:',
              fallbackBlocks.map((i) => result.filter.blocks[i].tierTag ?? `block ${i}`),
            )
          }
        }

        // Update baseline for migration-era compatibility
        saveBaseline(info.onlineFilterName, upstreamContent, info.onlineFilePath, info.localPath)
        saveVersion(info.localPath, false, 'Online Filter Merged')

        const currentPath = getProfileBackedSetting(store, 'filterPath')
        if (currentPath === info.localPath) {
          loadFilter(info.localPath, 'Online Filter Merged')
        }

        // Reload in game
        await switchFilterInGame(info.localFileName, info.localFileName)

        // Return stats in the old format the renderer expects
        return {
          ok: true,
          stats: {
            unchanged: 0,
            upstreamOnly: 0,
            userOnly: intentLog.intents.length,
            bothChanged: 0,
            added: 0,
            removed: 0,
            skippedForValidity,
          },
        }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  )

  ipcMain.handle(
    'merge-online-filter',
    (
      _event,
      _onlineFilterName: string,
      onlinePath: string,
      localPath: string,
    ): {
      ok: boolean
      error?: string
      conflicts?: Array<{ description: string; intentIndex: number; options: Array<{ label: string; action: string }> }>
      stats?: { applied: number; skipped: number; conflicts: number; skippedForValidity?: number }
    } => {
      try {
        const upstreamContent = readFileSync(onlinePath, 'utf-8')
        // Preserve the local copy's "-local" #name header (matching import).
        const localContent = applyLocalNameHeader(upstreamContent, basename(localPath, '.filter'))
        const intentLog = getIntents()

        if (intentLog.intents.length === 0) {
          // No intents - overwrite with upstream
          writeFileSync(localPath, localContent, 'utf-8')
          const currentPath = getProfileBackedSetting(store, 'filterPath')
          if (currentPath === localPath) loadFilter(localPath, 'Online Filter Updated')
          return { ok: true, stats: { applied: 0, skipped: 0, conflicts: 0 } }
        }

        const result = replayIntents(localContent, localPath, intentLog, { forceApply: true })

        // Only block on actionable conflicts (ones with resolution options)
        // Orphaned intents (tier removed, basetype removed) are auto-skipped
        const actionableConflicts = result.conflicts.filter((c) => c.options.length > 0)
        if (actionableConflicts.length > 0) {
          return {
            ok: false,
            conflicts: actionableConflicts.map((c, idx) => ({
              description: c.description,
              intentIndex: idx,
              options: c.options,
            })),
            stats: result.stats,
          }
        }

        // No actionable conflicts - serialize and write
        const { fallbackBlocks } = writeFilterSelective(result.filter, result.modifiedBlocks, result.removedBlocks)
        if (fallbackBlocks.length > 0 && process.env.SCALPEL_DEBUG_LOG) {
          console.warn(
            '[online-sync] merge dropped edits to keep filter valid:',
            fallbackBlocks.map((i) => result.filter.blocks[i].tierTag ?? `block ${i}`),
          )
        }

        saveVersion(localPath, false, 'Online Filter Merged')

        const currentPath = getProfileBackedSetting(store, 'filterPath')
        if (currentPath === localPath) loadFilter(localPath, 'Online Filter Merged')

        return { ok: true, stats: { ...result.stats, skippedForValidity: fallbackBlocks.length } }
      } catch (err) {
        return { ok: false, error: String(err) }
      }
    },
  )
}
