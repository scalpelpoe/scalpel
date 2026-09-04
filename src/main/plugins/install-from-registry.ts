import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, net } from 'electron'
import { pluginReleaseAssetUrl } from '@shared/endpoints'
import type { RegistryEntry } from '@shared/plugin-registry-types'
import { versionMatches } from '@shared/version-match'
import type { InstallResult } from './install-types'
import { replacePackageAtomically, restoreFiles, snapshotFiles } from './install-transaction'
import { addInstalledId } from './installed-list'
import { validateManifest } from './manifest-validator'
import { installedJsonPath, pendingPluginStorageDeletionsPath, pluginDir, unpackedJsonPath } from './paths'
import { cancelStorageRemoval, migrateLegacyStorage } from './storage'
import { removeUnpackedId } from './unpacked-list'

function currentScalpelVersion(): string {
  return app.getVersion()
}

export async function installFromRegistry(
  entry: RegistryEntry,
  options: {
    allowNativeBackend?: boolean
    validateMutation?: (manifest: import('../../plugin-sdk/src/types').PluginManifest) => string | null
  } = {},
): Promise<InstallResult> {
  // 1. Version check
  if (!versionMatches(entry.scalpelMinVersion, currentScalpelVersion())) {
    return {
      ok: false,
      error: `requires Scalpel version ${entry.scalpelMinVersion} (running ${currentScalpelVersion()})`,
    }
  }

  // 2. Fetch plugin.js
  let pluginBytes: Uint8Array
  try {
    const resp = await net.fetch(pluginReleaseAssetUrl(entry.repo, entry.latestVersion, 'plugin.js'))
    if (resp.status !== 200) {
      return { ok: false, error: `plugin.js download returned ${resp.status}` }
    }
    pluginBytes = new Uint8Array(await resp.arrayBuffer())
  } catch (e) {
    return { ok: false, error: `plugin.js download failed: ${(e as Error).message}` }
  }

  // 3. Fetch manifest.json
  let manifestText: string
  try {
    const resp = await net.fetch(pluginReleaseAssetUrl(entry.repo, entry.latestVersion, 'manifest.json'))
    if (resp.status !== 200) {
      return { ok: false, error: `manifest.json download returned ${resp.status}` }
    }
    manifestText = await resp.text()
  } catch (e) {
    return { ok: false, error: `manifest.json download failed: ${(e as Error).message}` }
  }

  // 4. Validate manifest
  let parsed: unknown
  try {
    parsed = JSON.parse(manifestText)
  } catch {
    return { ok: false, error: 'downloaded manifest.json is not valid JSON' }
  }
  const v = validateManifest(parsed)
  if (!v.ok) return { ok: false, error: `manifest validation failed: ${v.error}` }
  if (v.manifest.id !== entry.id) {
    return { ok: false, error: `manifest id "${v.manifest.id}" does not match registry id "${entry.id}"` }
  }
  if (v.manifest.version !== entry.latestVersion) {
    return {
      ok: false,
      error: `manifest version "${v.manifest.version}" does not match registry latestVersion "${entry.latestVersion}"`,
    }
  }
  if (v.manifest.nativeBackend && options.allowNativeBackend !== true) {
    return { ok: false, error: 'native backends are not allowed from a self-hosted registry' }
  }
  const mutationError = options.validateMutation?.(v.manifest)
  if (mutationError) return { ok: false, error: `plugin dependency check failed: ${mutationError}` }

  // 4.5. Verify plugin.js checksum
  const actual = createHash('sha256').update(pluginBytes).digest('hex')
  if (actual !== entry.sha256) {
    return { ok: false, error: `plugin.js checksum mismatch (expected ${entry.sha256}, got ${actual})` }
  }

  let contractBytes: Uint8Array | null = null
  if (v.manifest.api) {
    const expected = entry.assets?.[v.manifest.api.contract]
    if (!expected) return { ok: false, error: `registry does not pin ${v.manifest.api.contract}` }
    try {
      const resp = await net.fetch(pluginReleaseAssetUrl(entry.repo, entry.latestVersion, v.manifest.api.contract))
      if (resp.status !== 200) {
        return { ok: false, error: `${v.manifest.api.contract} download returned ${resp.status}` }
      }
      contractBytes = new Uint8Array(await resp.arrayBuffer())
    } catch (e) {
      return { ok: false, error: `${v.manifest.api.contract} download failed: ${(e as Error).message}` }
    }
    const contractActual = createHash('sha256').update(contractBytes).digest('hex')
    if (contractActual !== expected) {
      return {
        ok: false,
        error: `${v.manifest.api.contract} checksum mismatch (expected ${expected}, got ${contractActual})`,
      }
    }
  }

  let backendContractBytes: Uint8Array | null = null
  let nativeBytes: Uint8Array | null = null
  const nativeTarget =
    process.platform === 'win32' && process.arch === 'x64' ? v.manifest.nativeBackend?.targets['win32-x64'] : undefined
  if (v.manifest.nativeBackend) {
    const expected = entry.assets?.[v.manifest.nativeBackend.contract]
    if (!expected) return { ok: false, error: `registry does not pin ${v.manifest.nativeBackend.contract}` }
    try {
      const resp = await net.fetch(
        pluginReleaseAssetUrl(entry.repo, entry.latestVersion, v.manifest.nativeBackend.contract),
      )
      if (resp.status !== 200) {
        return { ok: false, error: `${v.manifest.nativeBackend.contract} download returned ${resp.status}` }
      }
      backendContractBytes = new Uint8Array(await resp.arrayBuffer())
    } catch (e) {
      return { ok: false, error: `${v.manifest.nativeBackend.contract} download failed: ${(e as Error).message}` }
    }
    const contractActual = createHash('sha256').update(backendContractBytes).digest('hex')
    if (contractActual !== expected) {
      return {
        ok: false,
        error: `${v.manifest.nativeBackend.contract} checksum mismatch (expected ${expected}, got ${contractActual})`,
      }
    }
  }
  if (nativeTarget) {
    if (entry.assets?.[nativeTarget.file] !== nativeTarget.sha256) {
      return { ok: false, error: `registry does not pin ${nativeTarget.file} with the manifest checksum` }
    }
    try {
      const resp = await net.fetch(pluginReleaseAssetUrl(entry.repo, entry.latestVersion, nativeTarget.file))
      if (resp.status !== 200) return { ok: false, error: `${nativeTarget.file} download returned ${resp.status}` }
      nativeBytes = new Uint8Array(await resp.arrayBuffer())
    } catch (e) {
      return { ok: false, error: `${nativeTarget.file} download failed: ${(e as Error).message}` }
    }
    const nativeActual = createHash('sha256').update(nativeBytes).digest('hex')
    if (nativeActual !== nativeTarget.sha256) {
      return {
        ok: false,
        error: `${nativeTarget.file} checksum mismatch (expected ${nativeTarget.sha256}, got ${nativeActual})`,
      }
    }
  }

  const destDir = pluginDir(entry.id)
  try {
    migrateLegacyStorage(entry.id)
    const metadata = snapshotFiles([installedJsonPath(), unpackedJsonPath(), pendingPluginStorageDeletionsPath()])
    replacePackageAtomically(
      destDir,
      (incomingDir) => {
        writeFileSync(join(incomingDir, 'plugin.js'), pluginBytes)
        writeFileSync(join(incomingDir, 'manifest.json'), manifestText)
        if (v.manifest.api && contractBytes !== null) {
          writeFileSync(join(incomingDir, v.manifest.api.contract), contractBytes)
        }
        if (v.manifest.nativeBackend && backendContractBytes !== null) {
          writeFileSync(join(incomingDir, v.manifest.nativeBackend.contract), backendContractBytes)
        }
        if (nativeTarget && nativeBytes) writeFileSync(join(incomingDir, nativeTarget.file), nativeBytes)
      },
      () => {
        addInstalledId(entry.id)
        removeUnpackedId(entry.id)
        cancelStorageRemoval(entry.id)
      },
      () => restoreFiles(metadata),
    )
  } catch (e) {
    return { ok: false, error: `install write failed: ${(e as Error).message}` }
  }

  return { ok: true, id: entry.id }
}
