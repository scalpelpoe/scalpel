import { existsSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'

/**
 * Clean up after updates at startup.
 *
 * The actual ASAR swap is done by a batch script that runs between
 * app exit and relaunch (see updater.ts install-update handler).
 * This function just cleans up any leftover files.
 *
 * Returns the install directory path for use by the updater.
 */
export function applyPendingUpdate(): string {
  const resourcesDir = process.resourcesPath || join(dirname(process.execPath), 'resources')
  const installDir = dirname(resourcesDir)

  // Clean up old ASAR from a previous swap
  const asarOld = join(resourcesDir, 'app.asar.old')
  if (existsSync(asarOld)) {
    try {
      unlinkSync(asarOld)
    } catch {
      /* still locked, try next time */
    }
  }

  return installDir
}
