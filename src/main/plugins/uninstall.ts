import { existsSync, renameSync, rmSync } from 'node:fs'
import { readInstalledIds, writeInstalledIds } from './installed-list'
import { PLUGIN_ID_PATTERN } from './manifest-validator'
import { pluginDir } from './paths'
import { migrateLegacyStorage, scheduleStorageRemoval } from './storage'
import { readUnpackedEntries, writeUnpackedEntries } from './unpacked-list'

export type UninstallResult = { ok: true } | { ok: false; error: string }

export function uninstallPlugin(pluginId: string): UninstallResult {
  if (!PLUGIN_ID_PATTERN.test(pluginId)) {
    return { ok: false, error: 'invalid plugin id' }
  }

  const dir = pluginDir(pluginId)
  const backup = `${dir}.uninstalling`
  const installed = readInstalledIds()
  const unpacked = readUnpackedEntries()
  let moved = false
  try {
    // Storage that still lives inside the package directory would be deleted
    // with it; move it to the storage dir so the deferred removal owns it.
    migrateLegacyStorage(pluginId)
    rmSync(backup, { recursive: true, force: true })
    if (existsSync(dir)) {
      renameSync(dir, backup)
      moved = true
    }
    writeInstalledIds(installed.filter((id) => id !== pluginId))
    writeUnpackedEntries(unpacked.filter((entry) => entry.id !== pluginId))
    scheduleStorageRemoval(pluginId)
  } catch (error) {
    try {
      writeInstalledIds(installed)
      writeUnpackedEntries(unpacked)
      if (moved && !existsSync(dir)) renameSync(backup, dir)
    } catch (rollbackError) {
      return {
        ok: false,
        error: `uninstall failed: ${(error as Error).message}; rollback failed: ${(rollbackError as Error).message}`,
      }
    }
    return { ok: false, error: `uninstall failed: ${(error as Error).message}` }
  }
  try {
    rmSync(backup, { recursive: true, force: true })
  } catch {
    // Package and metadata are committed. The next mutation removes a stale
    // backup before doing any work, so cleanup failure must not undo success.
  }
  return { ok: true }
}
