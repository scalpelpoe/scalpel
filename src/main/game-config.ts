import { copyFile, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { GameVariant } from '@shared/types'

/** Resolve the on-disk config path for a game version under the user's
 *  Documents folder. Pure - the caller supplies documentsDir. */
export function resolveGameConfigPath(version: GameVariant, documentsDir: string): string {
  return version === 2
    ? join(documentsDir, 'My Games', 'Path of Exile 2', 'poe2_production_Config.ini')
    : join(documentsDir, 'My Games', 'Path of Exile', 'production_Config.ini')
}

/** Read the config file as UTF-8 text. Preserves bytes (incl. CRLF). */
export async function readGameConfig(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`config file not found: ${path}`)
    }
    throw err
  }
}

export interface WriteOptions {
  /** Paths already backed up this session; mutated on first backup. */
  backedUp: Set<string>
  /** Injectable clock for deterministic backup filenames. */
  now: () => number
}

export interface WriteResult {
  backupPath: string | null
}

/** Atomically overwrite the config file. On the first write of a session for a
 *  given path, copy the existing file to `<path>.<timestamp>.bak` first. */
export async function writeGameConfig(path: string, content: string, opts: WriteOptions): Promise<WriteResult> {
  let backupPath: string | null = null
  if (!opts.backedUp.has(path)) {
    opts.backedUp.add(path)
    backupPath = `${path}.${opts.now()}.bak`
    await copyFile(path, backupPath)
  }
  const tmp = `${path}.tmp`
  await writeFile(tmp, content, 'utf8')
  await rename(tmp, path)
  return { backupPath }
}
