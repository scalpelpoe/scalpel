import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { unpackedJsonPath } from './paths'

/** One side-loaded plugin. `sourceDir` is the directory the user picked in the
 *  "Load unpacked" dialog; it is what the Reload button re-copies from. Entries
 *  written before source dirs were tracked are plain id strings on disk and
 *  come back with no `sourceDir`. */
export interface UnpackedEntry {
  id: string
  sourceDir?: string
}

function parseEntry(raw: unknown): UnpackedEntry | null {
  if (typeof raw === 'string') return { id: raw }
  if (!raw || typeof raw !== 'object') return null
  const { id, sourceDir } = raw as { id?: unknown; sourceDir?: unknown }
  if (typeof id !== 'string') return null
  return typeof sourceDir === 'string' ? { id, sourceDir } : { id }
}

function serializeEntry(entry: UnpackedEntry): string | UnpackedEntry {
  return entry.sourceDir ? entry : entry.id
}

/** Read the side-loaded (unpacked) plugins from userData/plugins/unpacked.json.
 *  Returns [] when the file is missing, unparseable, or not a JSON array.
 *  Malformed entries are filtered. */
export function readUnpackedEntries(): UnpackedEntry[] {
  const p = unpackedJsonPath()
  if (!existsSync(p)) return []
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8'))
    if (!Array.isArray(raw)) return []
    return raw.map(parseEntry).filter((e): e is UnpackedEntry => e !== null)
  } catch {
    return []
  }
}

/** Read just the ids of the side-loaded plugins. */
export function readUnpackedIds(): string[] {
  return readUnpackedEntries().map((e) => e.id)
}

/** Write the unpacked plugin list. Creates the parent directory if needed.
 *  Entries with no source dir stay plain strings so the file keeps the shape
 *  older builds can read. */
export function writeUnpackedEntries(entries: UnpackedEntry[]): void {
  const p = unpackedJsonPath()
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(entries.map(serializeEntry)))
}

/** Write the unpacked plugin list from bare ids, dropping any known source dirs. */
export function writeUnpackedIds(ids: string[]): void {
  writeUnpackedEntries(ids.map((id) => ({ id })))
}

/** Add an id, recording where it was loaded from. Re-adding a known id updates
 *  its source dir (the author may have moved the project). Passing no source
 *  dir keeps whatever was already recorded. Returns true if the list changed. */
export function addUnpackedId(id: string, sourceDir?: string): boolean {
  const entries = readUnpackedEntries()
  const existing = entries.find((e) => e.id === id)
  if (!existing) {
    entries.push(sourceDir ? { id, sourceDir } : { id })
    writeUnpackedEntries(entries)
    return true
  }
  if (!sourceDir || existing.sourceDir === sourceDir) return false
  existing.sourceDir = sourceDir
  writeUnpackedEntries(entries)
  return true
}

/** The directory an unpacked plugin was loaded from, or null when unknown
 *  (never recorded, or the plugin is not side-loaded). */
export function getUnpackedSourceDir(id: string): string | null {
  return readUnpackedEntries().find((e) => e.id === id)?.sourceDir ?? null
}

/** Remove an id if present. Returns true if the list was modified. */
export function removeUnpackedId(id: string): boolean {
  const entries = readUnpackedEntries()
  const next = entries.filter((e) => e.id !== id)
  if (next.length === entries.length) return false
  writeUnpackedEntries(next)
  return true
}
