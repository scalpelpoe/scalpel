import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { InstallResult } from './install-types'
import { addInstalledId } from './installed-list'
import { validateManifest } from './manifest-validator'
import { pluginDir } from './paths'
import { addUnpackedId } from './unpacked-list'

export type { InstallResult }

export function installUnpacked(sourceDir: string): InstallResult {
  const manifestPath = join(sourceDir, 'manifest.json')
  const entryPath = join(sourceDir, 'plugin.js')
  if (!existsSync(manifestPath)) {
    return { ok: false, error: 'source directory does not contain manifest.json' }
  }
  if (!existsSync(entryPath)) {
    return { ok: false, error: 'source directory does not contain plugin.js' }
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  } catch (e) {
    return { ok: false, error: `manifest.json is not valid JSON: ${(e as Error).message}` }
  }
  const v = validateManifest(raw)
  if (!v.ok) return { ok: false, error: v.error }

  const id = v.manifest.id
  const destDir = pluginDir(id)
  try {
    mkdirSync(destDir, { recursive: true })
    copyFileSync(manifestPath, join(destDir, 'manifest.json'))
    copyFileSync(entryPath, join(destDir, 'plugin.js'))

    // Append to installed.json and unpacked.json if new. The source dir rides
    // along so the Developer settings can re-copy from it (Reload) without
    // making the author pick the directory again.
    addInstalledId(id)
    addUnpackedId(id, sourceDir)
  } catch (e) {
    rmSync(destDir, { recursive: true, force: true })
    return { ok: false, error: `install write failed: ${(e as Error).message}` }
  }

  return { ok: true, id }
}
