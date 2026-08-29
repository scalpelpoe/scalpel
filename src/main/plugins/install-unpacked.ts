import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { InstallResult } from './install-types'
import { replacePackageAtomically, restoreFiles, snapshotFiles } from './install-transaction'
import { addInstalledId } from './installed-list'
import { validateManifest } from './manifest-validator'
import { installedJsonPath, pendingPluginStorageDeletionsPath, pluginDir, unpackedJsonPath } from './paths'
import { cancelStorageRemoval, migrateLegacyStorage } from './storage'
import { addUnpackedId } from './unpacked-list'

export type { InstallResult }

export function installUnpacked(sourceDir: string): InstallResult {
  const distDir = join(sourceDir, 'dist')
  const packageDir =
    existsSync(join(sourceDir, 'manifest.json')) && existsSync(join(sourceDir, 'plugin.js'))
      ? sourceDir
      : existsSync(join(distDir, 'manifest.json')) && existsSync(join(distDir, 'plugin.js'))
        ? distDir
        : null
  if (!packageDir) {
    return {
      ok: false,
      error:
        'selected directory must contain both manifest.json and plugin.js, either directly or in its immediate dist directory',
    }
  }
  const manifestPath = join(packageDir, 'manifest.json')
  const entryPath = join(packageDir, 'plugin.js')
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  } catch (e) {
    return { ok: false, error: `manifest.json is not valid JSON: ${(e as Error).message}` }
  }
  const v = validateManifest(raw)
  if (!v.ok) return { ok: false, error: v.error }
  const contractPath = v.manifest.api ? join(packageDir, v.manifest.api.contract) : null
  if (contractPath && !existsSync(contractPath)) {
    return { ok: false, error: `source directory does not contain ${v.manifest.api?.contract}` }
  }
  const backendContractPath = v.manifest.nativeBackend ? join(packageDir, v.manifest.nativeBackend.contract) : null
  if (backendContractPath && !existsSync(backendContractPath)) {
    return { ok: false, error: `source directory does not contain ${v.manifest.nativeBackend?.contract}` }
  }
  const nativeTarget =
    process.platform === 'win32' && process.arch === 'x64' ? v.manifest.nativeBackend?.targets['win32-x64'] : undefined
  const nativePath = nativeTarget ? join(packageDir, nativeTarget.file) : null
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
    migrateLegacyStorage(id)
    const metadata = snapshotFiles([installedJsonPath(), unpackedJsonPath(), pendingPluginStorageDeletionsPath()])
    replacePackageAtomically(
      destDir,
      (incomingDir) => {
        copyFileSync(manifestPath, join(incomingDir, 'manifest.json'))
        copyFileSync(entryPath, join(incomingDir, 'plugin.js'))
        if (contractPath && v.manifest.api) {
          copyFileSync(contractPath, join(incomingDir, v.manifest.api.contract))
        }
        if (backendContractPath && v.manifest.nativeBackend) {
          copyFileSync(backendContractPath, join(incomingDir, v.manifest.nativeBackend.contract))
        }
        if (nativePath && nativeTarget) copyFileSync(nativePath, join(incomingDir, nativeTarget.file))
      },
      () => {
        addInstalledId(id)
        addUnpackedId(id, packageDir)
        cancelStorageRemoval(id)
      },
      () => restoreFiles(metadata),
    )
  } catch (e) {
    return { ok: false, error: `install write failed: ${(e as Error).message}` }
  }

  return { ok: true, id }
}
