import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { createHash } from 'crypto'

/**
 * Stores the "baseline" copy of an online filter at the time it was imported.
 * This is the common ancestor for three-way merges when the online filter updates.
 *
 * Storage: {userData}/baselines/{md5-of-filter-name}.baseline
 * Metadata: {userData}/baselines/{md5-of-filter-name}.meta.json
 */

function getBaselinesDir(): string {
  const dir = join(app.getPath('userData'), 'baselines')
  mkdirSync(dir, { recursive: true })
  return dir
}

function nameHash(filterName: string): string {
  return createHash('md5').update(filterName).digest('hex')
}

export interface BaselineMeta {
  /** The online filter's display name (from #name: header) */
  filterName: string
  /** Path to the online filter source file */
  onlinePath: string
  /** Path to the user's local copy */
  localPath: string
  /** Timestamp of when the baseline was stored */
  timestamp: number
  /** MD5 of the online file at time of baseline */
  onlineHash: string
}

/** Store a baseline snapshot of the online filter content */
export function saveBaseline(filterName: string, onlineContent: string, onlinePath: string, localPath: string): void {
  const dir = getBaselinesDir()
  const hash = nameHash(filterName)

  writeFileSync(join(dir, `${hash}.baseline`), onlineContent, 'utf-8')
  writeFileSync(
    join(dir, `${hash}.meta.json`),
    JSON.stringify({
      filterName,
      onlinePath,
      localPath,
      timestamp: Date.now(),
      onlineHash: createHash('md5').update(onlineContent, 'utf-8').digest('hex'),
    } satisfies BaselineMeta),
    'utf-8',
  )
}

/** Get the baseline content for a filter, or null if none exists */
export function getBaselineContent(filterName: string): string | null {
  const dir = getBaselinesDir()
  const hash = nameHash(filterName)
  const path = join(dir, `${hash}.baseline`)
  if (!existsSync(path)) return null
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return null
  }
}

/** Get the baseline metadata for a filter, or null if none exists */
export function getBaselineMeta(filterName: string): BaselineMeta | null {
  const dir = getBaselinesDir()
  const hash = nameHash(filterName)
  const path = join(dir, `${hash}.meta.json`)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

/** Check if we have a baseline for this filter */
export function hasBaseline(filterName: string): boolean {
  const dir = getBaselinesDir()
  const hash = nameHash(filterName)
  return existsSync(join(dir, `${hash}.baseline`))
}
