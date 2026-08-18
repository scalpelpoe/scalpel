import { createHash } from 'node:crypto'
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
  const contractPath = v.manifest.api ? join(sourceDir, v.manifest.api.contract) : null
  if (contractPath && !existsSync(contractPath)) {
    return { ok: false, error: `source directory does not contain ${v.manifest.api?.contract}` }
  }
  const backendContractPath = v.manifest.nativeBackend ? join(sourceDir, v.manifest.nativeBackend.contract) : null
  if (backendContractPath && !existsSync(backendContractPath)) {
    return { ok: false, error: `source directory does not contain ${v.manifest.nativeBackend?.contract}` }
  }
  const nativeTarget =
    process.platform === 'win32' && process.arch === 'x64' ? v.manifest.nativeBackend?.targets['win32-x64'] : undefined
  const nativePath = nativeTarget ? join(sourceDir, nativeTarget.file) : null
  if (nativePath && !existsSync(nativePath)) {
    return { ok: false, error: `source directory does not contain ${nativeTarget?.file}` }
  }
  if (nativePath && nativeTarget) {
    const actual = createHash('sha256').update(readFileSync(nativePath)).digest('hex')
    if (actual !== nativeTarget.sha256) {
      return {
        ok: false,
        error: `${nativeTarget.file} checksum mismatch (expected ${nativeTarget.sha256}, got ${actual})`,
      }
    }
  }

  const id = v.manifest.id
  const destDir = pluginDir(id)
  try {
    mkdirSync(destDir, { recursive: true })
    copyFileSync(manifestPath, join(destDir, 'manifest.json'))
    copyFileSync(entryPath, join(destDir, 'plugin.js'))
    if (contractPath && v.manifest.api) {
      copyFileSync(contractPath, join(destDir, v.manifest.api.contract))
    }
    if (backendContractPath && v.manifest.nativeBackend) {
      copyFileSync(backendContractPath, join(destDir, v.manifest.nativeBackend.contract))
    }
    if (nativePath && nativeTarget) copyFileSync(nativePath, join(destDir, nativeTarget.file))

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
