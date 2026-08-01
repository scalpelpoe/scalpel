import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, net } from 'electron'
import { pluginReleaseAssetUrl } from '@shared/endpoints'
import type { RegistryEntry } from '@shared/plugin-registry-types'
import { versionMatches } from '@shared/version-match'
import type { InstallResult } from './install-types'
import { addInstalledId } from './installed-list'
import { validateManifest } from './manifest-validator'
import { pluginDir } from './paths'

function currentScalpelVersion(): string {
  return app.getVersion()
}

export async function installFromRegistry(entry: RegistryEntry): Promise<InstallResult> {
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

  // 4.5. Verify plugin.js checksum
  const actual = createHash('sha256').update(pluginBytes).digest('hex')
  if (actual !== entry.sha256) {
    return { ok: false, error: `plugin.js checksum mismatch (expected ${entry.sha256}, got ${actual})` }
  }

  // 5. Write atomically: stage into a temp dir, then swap the whole directory
  // into place - move any existing install aside first and restore it if the
  // swap throws. A failed write can no longer delete, half-overwrite, or tear a
  // working plugin into a mismatched plugin.js/manifest.json pair.
  const destDir = pluginDir(entry.id)
  const tmpDir = `${destDir}.incoming`
  const bakDir = `${destDir}.backup`
  try {
    rmSync(tmpDir, { recursive: true, force: true })
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(join(tmpDir, 'plugin.js'), pluginBytes)
    writeFileSync(join(tmpDir, 'manifest.json'), manifestText)

    rmSync(bakDir, { recursive: true, force: true })
    const hadPrevious = existsSync(destDir)
    if (hadPrevious) renameSync(destDir, bakDir)
    try {
      renameSync(tmpDir, destDir)
    } catch (swapErr) {
      // Restore the previous install if the swap threw (move it back into place).
      if (hadPrevious) renameSync(bakDir, destDir)
      throw swapErr
    }
    rmSync(bakDir, { recursive: true, force: true })

    // 6. Append to installed.json
    addInstalledId(entry.id)
  } catch (e) {
    rmSync(tmpDir, { recursive: true, force: true })
    return { ok: false, error: `install write failed: ${(e as Error).message}` }
  }

  return { ok: true, id: entry.id }
}
