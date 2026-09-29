import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, net } from 'electron'
import { pluginReleaseAssetUrl } from '@shared/endpoints'
import type { RegistryEntry } from '@shared/plugin-registry-types'
import { minVersionSatisfied } from '@shared/version-match'
import type { PluginManifest } from '../../plugin-sdk/src/types'
import type { InstallResult } from './install-types'
import { replacePackageAtomically, restoreFiles, snapshotFiles } from './install-transaction'
import { addInstalledId } from './installed-list'
import { validateManifest } from './manifest-validator'
import { installedJsonPath, pendingPluginStorageDeletionsPath, pluginDir, unpackedJsonPath } from './paths'
import { cancelStorageRemoval, carryLegacyStorage, migrateLegacyStorage } from './storage'
import { removeUnpackedId } from './unpacked-list'
import { nativeTargetForHost, type NativeHostPlatform, unsupportedNativePlatformMessage } from './native-platform'

type NativeTarget = NonNullable<NonNullable<PluginManifest['nativeBackend']>['targets']['win32-x64']>

/** Everything a registry install needs on disk, downloaded and hash-verified but
 *  not yet written anywhere. Preparing is slow and network-bound; committing is
 *  a synchronous file swap, so only the commit has to hold the lifecycle lock. */
export interface PreparedRegistryInstall {
  entry: RegistryEntry
  manifest: PluginManifest
  manifestText: string
  pluginBytes: Uint8Array
  contractBytes: Uint8Array | null
  backendContractBytes: Uint8Array | null
  nativeTarget: NativeTarget | undefined
  nativeBytes: Uint8Array | null
}

export type PrepareRegistryInstallResult =
  | { ok: true; prepared: PreparedRegistryInstall }
  | { ok: false; error: string }

type AssetDownload = { ok: true; bytes: Uint8Array } | { ok: false; error: string }

function currentScalpelVersion(): string {
  return app.getVersion()
}

async function downloadPinnedAsset(entry: RegistryEntry, file: string, expectedSha256: string): Promise<AssetDownload> {
  let bytes: Uint8Array
  try {
    const resp = await net.fetch(pluginReleaseAssetUrl(entry.repo, entry.latestVersion, file))
    if (resp.status !== 200) return { ok: false, error: `${file} download returned ${resp.status}` }
    bytes = new Uint8Array(await resp.arrayBuffer())
  } catch (e) {
    return { ok: false, error: `${file} download failed: ${(e as Error).message}` }
  }
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== expectedSha256) {
    return { ok: false, error: `${file} checksum mismatch (expected ${expectedSha256}, got ${actual})` }
  }
  return { ok: true, bytes }
}

/** Download + verify a registry package. Writes nothing, so a failure here (or a
 *  reconcile racing it) leaves the installed package exactly as it was. */
export async function prepareRegistryInstall(
  entry: RegistryEntry,
  options: {
    allowNativeBackend?: boolean
    host?: NativeHostPlatform
  } = {},
): Promise<PrepareRegistryInstallResult> {
  // 1. Version check
  if (!minVersionSatisfied(entry.scalpelMinVersion, currentScalpelVersion())) {
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
  const nativeTargetName = nativeTargetForHost(options.host)
  if (v.manifest.nativeBackend && !nativeTargetName) {
    return { ok: false, error: unsupportedNativePlatformMessage(options.host) }
  }

  // 4.5. Verify plugin.js checksum
  const actual = createHash('sha256').update(pluginBytes).digest('hex')
  if (actual !== entry.sha256) {
    return { ok: false, error: `plugin.js checksum mismatch (expected ${entry.sha256}, got ${actual})` }
  }

  // 5. Resolve the pins for every declared asset before spending a request on
  //    any of them, then fetch the (at most three) assets concurrently.
  const nativeTarget = nativeTargetName ? v.manifest.nativeBackend?.targets[nativeTargetName] : undefined
  let contractPin: string | null = null
  if (v.manifest.api) {
    const expected = entry.assets?.[v.manifest.api.contract]
    if (!expected) return { ok: false, error: `registry does not pin ${v.manifest.api.contract}` }
    contractPin = expected
  }
  let backendContractPin: string | null = null
  if (v.manifest.nativeBackend) {
    const expected = entry.assets?.[v.manifest.nativeBackend.contract]
    if (!expected) return { ok: false, error: `registry does not pin ${v.manifest.nativeBackend.contract}` }
    backendContractPin = expected
  }
  if (nativeTarget && entry.assets?.[nativeTarget.file] !== nativeTarget.sha256) {
    return { ok: false, error: `registry does not pin ${nativeTarget.file} with the manifest checksum` }
  }

  const [contract, backendContract, native] = await Promise.all([
    v.manifest.api && contractPin ? downloadPinnedAsset(entry, v.manifest.api.contract, contractPin) : null,
    v.manifest.nativeBackend && backendContractPin
      ? downloadPinnedAsset(entry, v.manifest.nativeBackend.contract, backendContractPin)
      : null,
    nativeTarget ? downloadPinnedAsset(entry, nativeTarget.file, nativeTarget.sha256) : null,
  ])
  // Report in declaration order so a multi-asset failure always names the same one.
  for (const download of [contract, backendContract, native]) {
    if (download && !download.ok) return download
  }

  return {
    ok: true,
    prepared: {
      entry,
      manifest: v.manifest,
      manifestText,
      pluginBytes,
      contractBytes: contract?.ok ? contract.bytes : null,
      backendContractBytes: backendContract?.ok ? backendContract.bytes : null,
      nativeTarget,
      nativeBytes: native?.ok ? native.bytes : null,
    },
  }
}

/** Swap a prepared package onto disk. Synchronous, so the caller only has to
 *  keep the plugin stopped for the swap rather than for the whole download. */
export function commitRegistryInstall(
  prepared: PreparedRegistryInstall,
  validateMutation?: (manifest: PluginManifest) => string | null,
): InstallResult {
  const { entry, manifest, manifestText, pluginBytes, contractBytes, backendContractBytes, nativeTarget, nativeBytes } =
    prepared
  const mutationError = validateMutation?.(manifest)
  if (mutationError) return { ok: false, error: `plugin dependency check failed: ${mutationError}` }

  const destDir = pluginDir(entry.id)
  try {
    migrateLegacyStorage(entry.id)
    const metadata = snapshotFiles([installedJsonPath(), unpackedJsonPath(), pendingPluginStorageDeletionsPath()])
    replacePackageAtomically(
      destDir,
      (incomingDir) => {
        carryLegacyStorage(entry.id, incomingDir)
        writeFileSync(join(incomingDir, 'plugin.js'), pluginBytes)
        writeFileSync(join(incomingDir, 'manifest.json'), manifestText)
        if (manifest.api && contractBytes !== null) {
          writeFileSync(join(incomingDir, manifest.api.contract), contractBytes)
        }
        if (manifest.nativeBackend && backendContractBytes !== null) {
          writeFileSync(join(incomingDir, manifest.nativeBackend.contract), backendContractBytes)
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

export async function installFromRegistry(
  entry: RegistryEntry,
  options: {
    allowNativeBackend?: boolean
    validateMutation?: (manifest: PluginManifest) => string | null
    host?: NativeHostPlatform
  } = {},
): Promise<InstallResult> {
  const prepared = await prepareRegistryInstall(entry, options)
  if (!prepared.ok) return prepared
  return commitRegistryInstall(prepared.prepared, options.validateMutation)
}
