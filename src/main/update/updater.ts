import { createHash } from 'node:crypto'
import { execSync, spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, type BrowserWindow, ipcMain } from 'electron'
import { ELECTRON_RELEASES, GITHUB_RELEASES_API } from '../../shared/endpoints'
import type { InstallManifest } from '../../shared/types'
import { findBrickedMatch } from '../../shared/version-match'

const CHECK_DELAY = 5000
const CHECK_INTERVAL = 60_000
const MAX_RETRIES = 3
// Sentinel version broadcast by the dev-fake-update IPC. Comically high so it
// can't ever collide with a real release version comparison.
const DEV_FAKE_VERSION = '99.99.99'
// Detects the dev server (`npm run dev`). Used to skip the periodic GitHub poll
// and the destructive download/install handlers so a dev session doesn't pull a
// packaged ASAR over the working source tree. Matches the inline check pattern
// used in app-window.ts, overlay.ts, and index.ts.
const IS_DEV = !!process.env.ELECTRON_RENDERER_URL

let targetWindows: (() => BrowserWindow | null)[] = []
let installDir: string = ''
let checking = false
let currentChannel: string = 'stable'
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
    const runningVersion = app.getVersion()

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

async function handleAsarUpdate(remote: InstallManifest, _channel: string): Promise<void> {
  updateAvailableVersion = remote.version
  broadcast('update-available', remote.version)
  pendingRemote = remote
}

async function handleFullUpgrade(remote: InstallManifest, _channel: string): Promise<void> {
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
        const unpackedDir = join(stagingDir, 'app.asar.unpacked')
        mkdirSync(unpackedDir, { recursive: true })
        execSync(
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
  currentChannel = channel

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
    checkForUpdates(currentChannel).catch((err) => {
      console.error('[Updater] Check failed:', err.message)
    })
  }
  // Skip the real GitHub poll under the dev server -- otherwise the periodic check
  // would pull a packaged ASAR over the working source tree. Channel switching
  // (setUpdateChannel) also calls checkForUpdates, but bails on IS_DEV for the same
  // reason. Dev can still exercise the banner state machine via the dev-fake-update
  // IPC below.
  if (!IS_DEV) {
    setTimeout(check, CHECK_DELAY)
    setInterval(check, CHECK_INTERVAL)
  }
}

/** Wired to the settings handler so toggling the channel takes effect immediately
 *  without a restart. Clears any pending state from the prior channel (the user may
 *  have just switched away from a beta release they no longer want to install) and
 *  fires a fresh check on the new channel. */
export function setUpdateChannel(channel: string): void {
  if (channel === currentChannel) return
  currentChannel = channel
  // Rescind any pending update from the prior channel. Clear local module state and
  // tell the renderer to drop its banner; if the new channel still has an update for
  // this version, the immediate recheck below will repopulate.
  // `cachedAssetUrls` is intentionally NOT cleared -- the next checkForUpdates will
  // overwrite it, and pendingRemote being null means no caller can reach the stale
  // entries even if the new channel has no update for this version.
  if (updateAvailableVersion || pendingRemote || updateReady) {
    updateAvailableVersion = null
    pendingRemote = null
    updateReady = false
    broadcast('update-rescinded')
  }
  if (IS_DEV) return
  checkForUpdates(currentChannel).catch((err) => {
    console.error('[Updater] Channel-switch check failed:', (err as Error).message)
  })
}

// Dev-only: inject a fake "update available" event so the channel-switch rescind
// flow can be tested without a real GitHub release. Real periodic checks are gated
// off in dev so the renderer's banner state would otherwise stay empty. Production
// builds ignore this IPC since IS_DEV is false and the early-return below trips.
ipcMain.handle('dev-fake-update', (_event, version: string = DEV_FAKE_VERSION) => {
  if (!IS_DEV) return
  updateAvailableVersion = version
  broadcast('update-available', version)
})

ipcMain.handle('get-update-state', () => ({
  updateVersion: updateAvailableVersion,
  updateReady,
  brickedRelease: brickedReleaseInfo,
}))

ipcMain.handle('download-update', async () => {
  if (IS_DEV) return
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
  if (IS_DEV) return
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

  spawn('wscript.exe', [vbsPath], {
    detached: true,
    stdio: 'ignore',
  }).unref()

  app.exit(0)
})
