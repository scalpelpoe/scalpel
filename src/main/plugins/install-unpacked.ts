import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { InstallResult } from './install-types'
import { replacePackageAtomically, restoreFiles, snapshotFiles } from './install-transaction'
import { addInstalledId } from './installed-list'
import { validateManifest } from './manifest-validator'
import { installedJsonPath, pendingPluginStorageDeletionsPath, pluginDir, unpackedJsonPath } from './paths'
import { cancelStorageRemoval, migrateLegacyStorage } from './storage'
import { addUnpackedId } from './unpacked-list'
import { nativeTargetForHost, type NativeHostPlatform, unsupportedNativePlatformMessage } from './native-platform'

export type { InstallResult }

export function installUnpacked(
  sourceDir: string,
  expectedPluginId?: string,
  host: NativeHostPlatform = process,
): InstallResult {
  const selectedDir = resolve(sourceDir)
  const distDir = join(selectedDir, 'dist')
  const hasPackage = (dir: string): boolean =>
    existsSync(join(dir, 'manifest.json')) && existsSync(join(dir, 'plugin.js'))
  // A built dist/ wins over root files: scalpel-plugin pack leaves the source
  // manifest and an intermediate bundle at the root next to the generated
  // package in dist/, and only the generated one is the installable artifact.
  const packageDir = hasPackage(distDir) ? distDir : hasPackage(selectedDir) ? selectedDir : null
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
  if (packageDir === distDir) {
    let selectedManifestPath = join(selectedDir, 'manifest.json')
    const packageJsonPath = join(selectedDir, 'package.json')
    if (!existsSync(selectedManifestPath) && existsSync(packageJsonPath)) {
      try {
        const project = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
          scalpelPlugin?: { manifest?: unknown }
        }
        const configuredManifest = project.scalpelPlugin?.manifest
        if (typeof configuredManifest === 'string' && configuredManifest.length > 0) {
          const candidate = resolve(selectedDir, configuredManifest)
          const fromProject = relative(selectedDir, candidate)
          if (!fromProject || fromProject === '..' || fromProject.startsWith(`..${sep}`) || isAbsolute(fromProject)) {
            return { ok: false, error: 'scalpelPlugin.manifest must stay inside the selected project' }
          }
          selectedManifestPath = candidate
          if (!existsSync(selectedManifestPath)) {
            return { ok: false, error: `configured manifest does not exist: ${configuredManifest}` }
          }
        }
      } catch (e) {
        return { ok: false, error: `selected package.json is not valid JSON: ${(e as Error).message}` }
      }
    }
    if (existsSync(selectedManifestPath)) {
      let selectedRaw: unknown
      try {
        selectedRaw = JSON.parse(readFileSync(selectedManifestPath, 'utf-8'))
      } catch (e) {
        return { ok: false, error: `selected manifest is not valid JSON: ${(e as Error).message}` }
      }
      const selected = validateManifest(selectedRaw)
      if (!selected.ok) return { ok: false, error: `selected manifest: ${selected.error}` }
      if (selected.manifest.id !== v.manifest.id) {
        return {
          ok: false,
          error: `dist package plugin id "${v.manifest.id}" does not match selected plugin id "${selected.manifest.id}"`,
        }
      }
      if (selected.manifest.version !== v.manifest.version) {
        return {
          ok: false,
          error: `dist package version "${v.manifest.version}" does not match selected plugin version "${selected.manifest.version}"; rebuild the package`,
        }
      }
    }
    const selectedEntryPath = join(selectedDir, 'plugin.js')
    if (existsSync(selectedEntryPath)) {
      const selectedHash = createHash('sha256').update(readFileSync(selectedEntryPath)).digest('hex')
      const distHash = createHash('sha256').update(readFileSync(entryPath)).digest('hex')
      if (selectedHash !== distHash) {
        return { ok: false, error: 'dist/plugin.js is stale; rebuild the package before loading it' }
      }
    }
  }
  if (expectedPluginId && v.manifest.id !== expectedPluginId) {
    return {
      ok: false,
      error: `source contains plugin "${v.manifest.id}", expected "${expectedPluginId}"`,
    }
  }
  const nativeTargetName = nativeTargetForHost(host)
  if (v.manifest.nativeBackend && !nativeTargetName) {
    return { ok: false, error: unsupportedNativePlatformMessage(host) }
  }
  const contractPath = v.manifest.api ? join(packageDir, v.manifest.api.contract) : null
  if (contractPath && !existsSync(contractPath)) {
    return { ok: false, error: `source directory does not contain ${v.manifest.api?.contract}` }
  }
  const backendContractPath = v.manifest.nativeBackend ? join(packageDir, v.manifest.nativeBackend.contract) : null
  if (backendContractPath && !existsSync(backendContractPath)) {
    return { ok: false, error: `source directory does not contain ${v.manifest.nativeBackend?.contract}` }
  }
  const nativeTarget = nativeTargetName ? v.manifest.nativeBackend?.targets[nativeTargetName] : undefined
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
        // Provenance is the directory the user picked, so Reload re-resolves
        // root vs dist each time instead of pinning a build output directory.
        addUnpackedId(id, selectedDir)
        cancelStorageRemoval(id)
      },
      () => restoreFiles(metadata),
    )
  } catch (e) {
    return { ok: false, error: `install write failed: ${(e as Error).message}` }
  }

  return { ok: true, id }
}
