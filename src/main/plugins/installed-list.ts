import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { installedJsonPath } from './paths'

/** Read the list of installed plugin ids from userData/plugins/installed.json.
 *  Returns [] when the file is missing, unparseable, or not a JSON array.
 *  Non-string entries are filtered. */
export function readInstalledIds(): string[] {
  const p = installedJsonPath()
  if (!existsSync(p)) return []
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8'))
    if (!Array.isArray(raw)) return []
    return raw.filter((x): x is string => typeof x === 'string')
  } catch {
    return []
  }
}

/** Write the list of installed plugin ids. Creates the parent directory if needed. */
export function writeInstalledIds(ids: string[]): void {
  const p = installedJsonPath()
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify(ids))
}

/** Add an id if not already present. Returns true if the list was modified. */
export function addInstalledId(id: string): boolean {
  const ids = readInstalledIds()
  if (ids.includes(id)) return false
  ids.push(id)
  writeInstalledIds(ids)
  return true
}

/** Remove an id if present. Returns true if the list was modified. */
export function removeInstalledId(id: string): boolean {
  const ids = readInstalledIds()
  const next = ids.filter((x) => x !== id)
  if (next.length === ids.length) return false
  writeInstalledIds(next)
  return true
}
