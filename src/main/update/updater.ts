import { BrowserWindow, ipcMain, app } from 'electron'
import { createHash } from 'crypto'
import { createWriteStream, existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import type { InstallManifest } from '../../shared/types'
import { findBrickedMatch } from '../../shared/version-match'

import { GITHUB_RELEASES_API, ELECTRON_RELEASES } from '../../shared/endpoints'
const CHECK_DELAY = 5000
const CHECK_INTERVAL = 60_000
const MAX_RETRIES = 3

let targetWindows: (() => BrowserWindow | null)[] = []
let installDir: string = ''
let checking = false
let pendingRemote: InstallManifest | null = null
// Cached state so the app window can pull current status on mount (events fired before
// the window opened would otherwise be missed).
let updateAvailableVersion: string | null = null
let updateReady = false
let brickedReleaseInfo: { version: string; message: string | null } | null = null

function broadcast(channel: string, ...args: unknown[]): void {
  for (const getWin of targetWindows) {
    const win = getWin()
    if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
  }
}

/** User-writable directory for staging downloads before applying */
function getStagingDir(): string {
  return join(app.getPath('userData'), 'update-staging')
}

function readLocalManifest(): InstallManifest | null {
  // Check userData first (writable location), then installDir (legacy/bootstrapper)
  const userDataManifest = join(app.getPath('userData'), 'install-manifest.json')
  const installManifest = join(installDir, 'install-manifest.json')

  for (const p of [userDataManifest, installManifest]) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, 'utf8'))
      } catch {
        /* try next */
      }
    }
  }
  return null
}

function writeLocalManifest(manifest: InstallManifest): void {
  // Always write to userData (guaranteed writable)
  const manifestPath = join(app.getPath('userData'), 'install-manifest.json')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Cache-Control': 'no-cache',
      'User-Agent': 'Scalpel-Updater',
      Accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return res.json() as Promise<T>
}

async function downloadFile(
  url: string,
  dest: string,
  expectedSize: number,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} fetching ${url}`)

  const fileStream = createWriteStream(dest)
  const reader = res.body.getReader()
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    fileStream.write(Buffer.from(value))
    received += value.byteLength
    if (onProgress && expectedSize > 0) {
      onProgress(Math.round((received / expectedSize) * 100))
    }
  }

  await new Promise<void>((resolve, reject) => {
    fileStream.end(() => resolve())
    fileStream.on('error', reject)
  })
}

function computeSha512(filePath: string): string {
  const data = readFileSync(filePath)
  return createHash('sha512').update(data).digest('base64')
}

/** Cached release asset URLs from the latest GitHub Release */
let cachedAssetUrls: Record<string, string> = {}

async function checkForUpdates(channel: string): Promise<void> {
  if (checking) return
  checking = true

  try {
    // Fetch release from GitHub API.
    // Beta channel: fetch all releases (including pre-releases), pick the newest.
    // Stable channel: fetch only the latest non-pre-release.
    let release: { tag_name: string; assets: Array<{ name: string; browser_download_url: string }> }
    if (channel === 'beta') {
      const releases = await fetchJson<
        Array<{ tag_name: string; prerelease: boolean; assets: Array<{ name: string; browser_download_url: string }> }>
      >(GITHUB_RELEASES_API.replace('/latest', ''))
      const candidate = releases.find((r) => r.assets.some((a) => a.name === 'manifest.json'))
      if (!candidate) {
        checking = false
        return
      }
      release = candidate
    } else {
      release = await fetchJson<{
        tag_name: string
        assets: Array<{ name: string; browser_download_url: string }>
      }>(GITHUB_RELEASES_API)
    }

    // Find manifest.json asset
    const manifestAsset = release.assets.find((a) => a.name === 'manifest.json')
    if (!manifestAsset) return

    // Cache all asset URLs for downloads
    cachedAssetUrls = {}
    for (const asset of release.assets) {
      cachedAssetUrls[asset.name] = asset.browser_download_url
    }

    const remote = await fetchJson<InstallManifest>(manifestAsset.browser_download_url)
    const local = readLocalManifest()
    const pkg = require('../../package.json')
    const runningVersion = pkg.version as string

    // Advisory: if the running version matches a bricked rule, surface a banner asking the
    // user to reinstall. Separate from the update flow -- they see this even if auto-update
    // never resolves for them.
    if (findBrickedMatch(remote.brickedReleases, runningVersion)) {
      brickedReleaseInfo = { version: runningVersion, message: remote.brickedMessage ?? null }
      broadcast('bricked-release', brickedReleaseInfo)
    }

    // If no local manifest, write one from current running versions
    if (!local) {
      const baseline: InstallManifest = {
        version: runningVersion,
        electronVersion: process.versions.electron,
        asarUrl: '',
        asarSha512: '',
        asarSize: 0,
        nativeModules: remote.nativeModules,
      }
      writeLocalManifest(baseline)
    } else if (local.version !== runningVersion) {
      // Manifest is stale (e.g. user manually reinstalled a newer version).
      // Sync it to the running version so we don't re-download what we already have.
      local.version = runningVersion
      local.electronVersion = process.versions.electron
      writeLocalManifest(local)
    }

    if (runningVersion === remote.version) {
      return
    }

    const electronChanged = local?.electronVersion !== remote.electronVersion
    const nativeModulesChanged = Object.entries(remote.nativeModules).some(
      ([name, version]) => local?.nativeModules[name] !== version,
    )

    if (electronChanged || nativeModulesChanged) {
      await handleFullUpgrade(remote, channel)
    } else {
      await handleAsarUpdate(remote, channel)
    }
  } catch (err) {
    console.error('[Updater] Check failed:', (err as Error).message)
  } finally {
    checking = false
  }
}

async function handleAsarUpdate(remote: InstallManifest, channel: string): Promise<void> {
  updateAvailableVersion = remote.version
  broadcast('update-available', remote.version)
  pendingRemote = remote
}

async function handleFullUpgrade(remote: InstallManifest, channel: string): Promise<void> {
  updateAvailableVersion = remote.version
  broadcast('update-available', remote.version)
  pendingRemote = remote
}

async function downloadAsarUpdate(): Promise<void> {
  if (!pendingRemote) return

  const remote = pendingRemote
  const stagingDir = getStagingDir()
  mkdirSync(stagingDir, { recursive: true })
  const asarNewPath = join(stagingDir, 'app.asar.new')
  const asarUrl = cachedAssetUrls['app.asar']
  if (!asarUrl) {
    console.error('[Updater] No app.asar asset found in release')
    return
  }

  let lastError: Error | null = null
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await downloadFile(asarUrl, asarNewPath, remote.asarSize, (percent) => {
        broadcast('update-download-progress', percent)
      })

      const hash = computeSha512(asarNewPath)
      if (hash !== remote.asarSha512) {
        throw new Error(`Hash mismatch: expected ${remote.asarSha512}, got ${hash}`)
      }

      // Download unpacked native modules zip if present in release assets
      const unpackedZipUrl = cachedAssetUrls['app.asar.unpacked.zip']
      if (unpackedZipUrl) {
        const unpackedZipPath = join(stagingDir, 'app.asar.unpacked.zip')
        await downloadFile(unpackedZipUrl, unpackedZipPath, remote.unpackedSize || 0)

        // Extract the zip to staging/app.asar.unpacked/
        const { execSync: exec } = require('child_process')
        const unpackedDir = join(stagingDir, 'app.asar.unpacked')
        mkdirSync(unpackedDir, { recursive: true })
        exec(
          `powershell -NoProfile -Command "Expand-Archive -Path '${unpackedZipPath}' -DestinationPath '${unpackedDir}' -Force"`,
          { stdio: 'ignore', windowsHide: true },
        )
        unlinkSync(unpackedZipPath)
      }

      // Write pending manifest to staging
      writeFileSync(join(stagingDir, 'manifest.pending.json'), JSON.stringify(remote, null, 2))

      updateReady = true
      broadcast('update-downloaded')
      pendingRemote = null
      return
    } catch (err) {
      lastError = err as Error
      console.error(`[Updater] Download attempt ${attempt} failed:`, lastError.message)
      try {
        if (existsSync(asarNewPath)) unlinkSync(asarNewPath)
      } catch {
        /* ignore cleanup errors */
      }
    }
  }

  console.error('[Updater] All download attempts failed:', lastError?.message)
}

async function downloadFullUpgrade(): Promise<void> {
  if (!pendingRemote) return

  const remote = pendingRemote
  const stagingDir = getStagingDir()
  mkdirSync(stagingDir, { recursive: true })
  const electronZipUrl = `${ELECTRON_RELEASES}/v${remote.electronVersion}/electron-v${remote.electronVersion}-win32-x64.zip`
  const asarUrl = cachedAssetUrls['app.asar']
  if (!asarUrl) {
    console.error('[Updater] No app.asar asset found in release')
    return
  }

  try {
    const zipPath = join(stagingDir, 'electron.zip')
    const totalSize = 80_000_000 + remote.asarSize

    await downloadFile(electronZipUrl, zipPath, 80_000_000, (percent) => {
      const totalReceived = (percent / 100) * 80_000_000
      broadcast('update-download-progress', Math.round((totalReceived / totalSize) * 100))
    })

    const asarPath = join(stagingDir, 'app.asar.staged')
    await downloadFile(asarUrl, asarPath, remote.asarSize, (percent) => {
      const asarReceived = (percent / 100) * remote.asarSize
      broadcast('update-download-progress', Math.round(((80_000_000 + asarReceived) / totalSize) * 100))
    })

    const hash = computeSha512(asarPath)
    if (hash !== remote.asarSha512) {
      throw new Error('ASAR hash mismatch')
    }

    writeFileSync(join(stagingDir, '.complete'), '')
    writeFileSync(join(stagingDir, '.electron-version'), remote.electronVersion)
    writeFileSync(join(stagingDir, 'manifest.pending.json'), JSON.stringify(remote, null, 2))

    updateReady = true
    broadcast('update-downloaded')
    pendingRemote = null
  } catch (err) {
    console.error('[Updater] Full upgrade download failed:', (err as Error).message)
    rmSync(stagingDir, { recursive: true, force: true })
  }
}

export function initUpdater(
  windows: Array<() => BrowserWindow | null>,
  dir: string,
  channel: string,
  onUpdateApplied?: () => void,
): void {
  targetWindows = windows
  installDir = dir

  // Check if we just updated and notify renderer
  const justUpdatedPath = join(app.getPath('userData'), 'just-updated.json')
  const overlayStatePath = join(app.getPath('userData'), 'overlay-state.json')
  if (existsSync(justUpdatedPath)) {
    try {
      const { version } = JSON.parse(readFileSync(justUpdatedPath, 'utf8'))
      unlinkSync(justUpdatedPath)

      let savedState: Record<string, unknown> | null = null
      if (existsSync(overlayStatePath)) {
        try {
          savedState = JSON.parse(readFileSync(overlayStatePath, 'utf8'))
        } catch {}
        try {
          unlinkSync(overlayStatePath)
        } catch {}
      }

      // Send after a delay so the renderer is fully ready
      setTimeout(() => {
        broadcast('update-applied', version, savedState)
        onUpdateApplied?.()
      }, 3000)
    } catch {
      try {
        unlinkSync(justUpdatedPath)
      } catch {}
    }
  }

  const check = (): void => {
    checkForUpdates(channel).catch((err) => {
      console.error('[Updater] Check failed:', err.message)
    })
  }
  setTimeout(check, CHECK_DELAY)
  setInterval(check, CHECK_INTERVAL)
}

ipcMain.handle('get-update-state', () => ({
  updateVersion: updateAvailableVersion,
  updateReady,
  brickedRelease: brickedReleaseInfo,
}))

ipcMain.handle('download-update', async () => {
  if (!pendingRemote) return

  const local = readLocalManifest()
  const electronChanged = local && local.electronVersion !== pendingRemote.electronVersion

  if (electronChanged) {
    await downloadFullUpgrade()
  } else {
    await downloadAsarUpdate()
  }
})

ipcMain.on('save-overlay-state', (_event, state: Record<string, unknown>) => {
  try {
    writeFileSync(join(app.getPath('userData'), 'overlay-state.json'), JSON.stringify(state))
  } catch {
    /* non-critical */
  }
})

ipcMain.handle('install-update', () => {
  const stagingDir = getStagingDir()
  const asarNew = join(stagingDir, 'app.asar.new')
  const electronZip = join(stagingDir, 'electron.zip')
  const fullUpgradeAsar = join(stagingDir, 'app.asar.staged')
  const pendingManifest = join(stagingDir, 'manifest.pending.json')
  const resourcesDir = process.resourcesPath || join(dirname(process.execPath), 'resources')
  const installDir = dirname(resourcesDir)
  const asarPath = join(resourcesDir, 'app.asar')
  const asarUnpackedSrc = join(stagingDir, 'app.asar.unpacked')
  const asarUnpackedDest = join(resourcesDir, 'app.asar.unpacked')
  const exePath = process.execPath
  const userDataDir = app.getPath('userData')

  const isFullUpgrade = existsSync(electronZip) && existsSync(join(stagingDir, '.complete'))
  const isAsarUpdate = existsSync(asarNew)

  if (!isFullUpgrade && !isAsarUpdate) {
    // No pending update, just relaunch
    app.relaunch()
    app.exit(0)
    return
  }

  // Save the version we're updating to so we can show a banner after restart
  try {
    const pending = JSON.parse(readFileSync(pendingManifest, 'utf8'))
    writeFileSync(join(userDataDir, 'just-updated.json'), JSON.stringify({ version: pending.version }))
  } catch {
    /* non-critical */
  }

  const batPath = join(userDataDir, 'apply-update.bat')
  const batLines = ['@echo off', 'timeout /t 2 /nobreak > nul']

  if (isFullUpgrade) {
    // Full Electron upgrade: extract the zip over the install directory, then copy asar.
    // The zip contains electron.exe which needs to be renamed to match the installed exe name.
    const electronExe = join(installDir, 'electron.exe')
    batLines.push(
      `powershell -NoProfile -Command "Expand-Archive -Path '${electronZip}' -DestinationPath '${installDir}' -Force"`,
      `if exist "${electronExe}" (move /y "${electronExe}" "${exePath}")`,
      `copy /y "${fullUpgradeAsar}" "${asarPath}"`,
    )
  } else {
    // Asar-only update
    batLines.push(`copy /y "${asarNew}" "${asarPath}"`)
  }

  // Copy unpacked native modules if present
  if (existsSync(asarUnpackedSrc)) {
    batLines.push(`xcopy /y /e /i "${asarUnpackedSrc}" "${asarUnpackedDest}"`)
  }
  // Update manifest
  if (existsSync(pendingManifest)) {
    batLines.push(`copy /y "${pendingManifest}" "${join(userDataDir, 'install-manifest.json')}"`)
  }
  // Clean up staging, relaunch, self-delete
  batLines.push(
    `rmdir /s /q "${stagingDir}"`,
    `start "" "${isFullUpgrade ? join(installDir, 'Scalpel.exe') : exePath}"`,
    `del "%~f0"`,
  )

  writeFileSync(batPath, batLines.join('\r\n'))

  // Use a VBScript wrapper to run the batch file invisibly
  const vbsPath = join(userDataDir, 'apply-update.vbs')
  writeFileSync(vbsPath, `CreateObject("WScript.Shell").Run """${batPath}""", 0, False\r\n`)

  const { spawn } = require('child_process')
  spawn('wscript.exe', [vbsPath], {
    detached: true,
    stdio: 'ignore',
  }).unref()

  app.exit(0)
})
