import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from 'fs'
import { join, basename, resolve, sep } from 'path'
import { app } from 'electron'
import type { FilterVersion } from '../../shared/types'

const MAX_AUTO_VERSIONS = 50

function getVersionsDir(): string {
  const dir = join(app.getPath('userData'), 'versions')
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeFilename(filterName: string, timestamp: number, isCheckpoint: boolean, label?: string): string {
  const date = new Date(timestamp)
  const dateStr = date.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const prefix = isCheckpoint ? 'cp' : 'auto'
  const safeName = filterName.replace(/[^a-zA-Z0-9_-]/g, '_')
  const safeLabel = label ? '.' + label.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) : ''
  return `${safeName}.${prefix}.${dateStr}${safeLabel}.filter`
}

function parseVersionFile(filename: string): FilterVersion | null {
  const match = filename.match(/^(.+?)\.(auto|cp)\.(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})(\.(.+?))?\.filter$/)
  if (!match) return null
  const [, rawName, type, dateStr, , label] = match
  const _isoDate = dateStr.replace(/_/, 'T').replace(/-/g, (m, offset) => (offset > 9 ? ':' : m)) + 'Z'
  // Reconstruct from parts: 2026-03-13T14:30:22Z
  const parts = dateStr.split('_')
  const datePart = parts[0] // 2026-03-13
  const timeParts = parts[1].split('-') // 14-30-22
  const iso = `${datePart}T${timeParts.join(':')}Z`
  const timestamp = new Date(iso).getTime()
  if (isNaN(timestamp)) return null
  return {
    filename,
    timestamp,
    isCheckpoint: type === 'cp',
    label: label ? label.replace(/_/g, ' ') : undefined,
    filterName: rawName.replace(/_/g, ' '),
  }
}

/** Save a version of the current filter file */
export function saveVersion(filterPath: string, isCheckpoint: boolean, label?: string): FilterVersion | null {
  try {
    const content = readFileSync(filterPath, 'utf-8')
    const filterName = basename(filterPath, '.filter')
    const timestamp = Date.now()
    const filename = makeFilename(filterName, timestamp, isCheckpoint, label)
    const dir = getVersionsDir()
    writeFileSync(join(dir, filename), content, 'utf-8')

    // Prune old auto-versions (keep checkpoints indefinitely)
    pruneAutoVersions(filterName)

    return { filename, timestamp, isCheckpoint, label }
  } catch {
    return null
  }
}

/** List all versions for a given filter, newest first */
export function listVersions(filterPath: string): FilterVersion[] {
  const filterName = basename(filterPath, '.filter')
  const safeName = filterName.replace(/[^a-zA-Z0-9_-]/g, '_')
  const dir = getVersionsDir()
  try {
    const files = readdirSync(dir)
    const versions: FilterVersion[] = []
    for (const f of files) {
      if (!f.startsWith(safeName + '.')) continue
      const v = parseVersionFile(f)
      if (v) versions.push(v)
    }
    return versions.sort((a, b) => b.timestamp - a.timestamp)
  } catch {
    return []
  }
}

/** Validate that a version filename resolves within the versions directory (prevent path traversal) */
function safeVersionPath(dir: string, filename: string): string | null {
  const resolved = resolve(dir, filename)
  if (!resolved.startsWith(resolve(dir) + sep)) return null
  return resolved
}

/** Restore a filter from a saved version */
export function restoreVersion(filterPath: string, versionFilename: string): { ok: boolean; error?: string } {
  try {
    const dir = getVersionsDir()
    const versionPath = safeVersionPath(dir, versionFilename)
    if (!versionPath) return { ok: false, error: 'Invalid version filename' }
    if (!existsSync(versionPath)) return { ok: false, error: 'Version file not found' }
    const content = readFileSync(versionPath, 'utf-8')
    writeFileSync(filterPath, content, 'utf-8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

/** Delete a specific version */
export function deleteVersion(versionFilename: string): { ok: boolean; error?: string } {
  try {
    const dir = getVersionsDir()
    const versionPath = safeVersionPath(dir, versionFilename)
    if (!versionPath) return { ok: false, error: 'Invalid version filename' }
    if (existsSync(versionPath)) unlinkSync(versionPath)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

function pruneAutoVersions(filterName: string): void {
  const safeName = filterName.replace(/[^a-zA-Z0-9_-]/g, '_')
  const dir = getVersionsDir()
  try {
    const files = readdirSync(dir)
    const autos: { filename: string; timestamp: number }[] = []
    for (const f of files) {
      if (!f.startsWith(safeName + '.auto.')) continue
      const v = parseVersionFile(f)
      if (v) autos.push({ filename: f, timestamp: v.timestamp })
    }
    autos.sort((a, b) => b.timestamp - a.timestamp)
    // Remove oldest beyond limit
    for (const old of autos.slice(MAX_AUTO_VERSIONS)) {
      try {
        unlinkSync(join(dir, old.filename))
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}
