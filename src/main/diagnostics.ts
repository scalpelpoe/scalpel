import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { release } from 'node:os'
import { join } from 'node:path'
import { app, type BrowserWindow, ipcMain, screen, shell } from 'electron'
import type Store from 'electron-store'
import type { BugReportResult, RendererDiagnosticPayload, SerializedDiagnosticError } from '../shared/diagnostics'
import { serializeDiagnosticError } from '../shared/diagnostics'
import { DISCORD_INVITE_URL, GITHUB_NEW_ISSUE_URL } from '../shared/endpoints'
import type { AppSettings } from '../shared/types'
import { getActiveProfile } from './profiles/profile-settings'

// Tail of the log embedded in a generated bug report.
const MAX_LOG_BYTES = 256 * 1024
// Hard cap for scalpel.log on disk. Past this it's trimmed back to its most
// recent half so the file never grows without bound.
const MAX_LOG_FILE_BYTES = 4 * 1024 * 1024
const EARLY_LOGS: string[] = []

// Provider-based diagnostics: each module registers a stateless getter.
// runtimeDiagnosticsSummary() calls every provider and merges their output.
const providers = new Map<string, () => Record<string, unknown>>()

export function registerDiagnosticProvider(name: string, provider: () => Record<string, unknown>): void {
  providers.set(name, provider)
}

export function runtimeDiagnosticsSummary(): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [name, provider] of providers) {
    try {
      result[name] = provider()
    } catch (err) {
      result[name] = { error: String(err) }
    }
  }
  return result
}

let initialized = false
let storeRef: Store<AppSettings> | null = null
let getAppWindowRef: (() => BrowserWindow | null) | null = null
let showAppWindowRef: (() => void) | null = null

function isDevRuntime(): boolean {
  return !app.isPackaged
}

function environmentSummary(): Record<string, unknown> {
  return {
    appVersion: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    osRelease: release(),
    packaged: app.isPackaged,
    devRuntime: isDevRuntime(),
  }
}

function diagnosticsDir(): string | null {
  if (!app.isReady()) return null
  const dir = join(app.getPath('userData'), 'diagnostics')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function logPath(): string | null {
  const dir = diagnosticsDir()
  return dir ? join(dir, 'scalpel.log') : null
}

function redact(text: string): string {
  let out = text
  try {
    const home = app.isReady() ? app.getPath('home') : ''
    if (home) out = out.split(home).join('<home>')
  } catch {
    // app paths may be unavailable during early process errors.
  }
  const _settings = storeRef?.store
  const legacyData = ((storeRef as unknown as { store: Record<string, unknown> } | null)?.store ?? {}) as Record<
    string,
    unknown
  >
  for (const value of [
    legacyData['filterPathPoe1'],
    legacyData['filterPathPoe2'],
    legacyData['filterDirPoe1'],
    legacyData['filterDirPoe2'],
    legacyData['filterPath'],
    legacyData['filterDir'],
  ]) {
    if (typeof value === 'string' && value.length > 0) out = out.split(value).join('<path>')
  }
  out = out.replace(
    /(POESESSID|session|token|cookie|authorization)(["':=\s]+)(?:Bearer\s+)?[^\s"',}]+/gi,
    '$1$2<redacted>',
  )
  out = out.replace(/[A-Za-z]:\\Users\\[^\\\r\n]+/g, '<home>')
  return out
}

function formatError(error: SerializedDiagnosticError): string {
  const header = `${error.name ? `${error.name}: ` : ''}${error.message}`
  return error.stack ? `${header}\n${error.stack}` : header
}

function appendDiagnosticLine(line: string): void {
  const sanitized = redact(line)
  const path = logPath()
  if (!path) {
    EARLY_LOGS.push(sanitized)
    return
  }
  if (EARLY_LOGS.length > 0) {
    appendFileSync(path, `${EARLY_LOGS.splice(0).join('\n')}\n`, 'utf-8')
  }
  appendFileSync(path, `${sanitized}\n`, 'utf-8')
  trimLogToTail(path)
}

// Keep scalpel.log bounded: once it exceeds maxBytes, rewrite it with only its
// most recent half, starting at a line boundary so no partial line survives.
// Trimming to the half (rather than exactly maxBytes) means it only rewrites
// once per half-cap of growth instead of on every subsequent append.
function trimLogToTail(path: string, maxBytes = MAX_LOG_FILE_BYTES): void {
  let size: number
  try {
    size = statSync(path).size
  } catch {
    return
  }
  if (size <= maxBytes) return
  const raw = readFileSync(path)
  const tail = raw.subarray(raw.length - Math.floor(maxBytes / 2))
  const newlineIndex = tail.indexOf(0x0a)
  writeFileSync(path, newlineIndex >= 0 ? tail.subarray(newlineIndex + 1) : tail)
}

export function recordMainDiagnostic(kind: string, error: unknown): void {
  const serialized = serializeDiagnosticError(error)
  appendDiagnosticLine(`[${new Date().toISOString()}] [main:${kind}] ${formatError(serialized)}`)
}

/** Synchronous one-line breadcrumb (no stack). Used to trace the shutdown
 *  sequence: appendFileSync flushes before returning, so the last line written
 *  survives even a native abort or a hang in the very next call. If the log ends
 *  at "uIOhook.stop() calling" with no "returned", the uiohook worker-thread
 *  join wedged; if it ends earlier, the crash beat the quit handlers. */
export function recordMainBreadcrumb(message: string): void {
  appendDiagnosticLine(`[${new Date().toISOString()}] [main:breadcrumb] ${message}`)
}

/** Wrap a native-event listener (uiohook-napi, electron-overlay-window) so a
 *  thrown exception is logged instead of propagating back into the addon's
 *  threadsafe-function dispatch. Those addons call napi_fatal_error when the JS
 *  callback leaves a pending exception (napi_call_function returns non-ok),
 *  aborting the whole process with "FATAL ERROR: tsfn_to_js_proxy
 *  napi_call_function". Catching inside the listener prevents that abort.
 *  The process-level uncaughtException handler does NOT cover this path. */
export function guardNativeListener<A extends unknown[]>(
  label: string,
  fn: (...args: A) => void,
): (...args: A) => void {
  return (...args: A) => {
    try {
      fn(...args)
    } catch (err) {
      recordMainDiagnostic(`native-listener:${label}`, err)
    }
  }
}

function recordRendererDiagnostic(payload: RendererDiagnosticPayload): void {
  appendDiagnosticLine(
    `[${payload.timestamp}] [${payload.source}:${payload.kind}] ${payload.context ? `${payload.context}\n` : ''}${formatError(
      payload.error,
    )}`,
  )
  if (isDevRuntime()) {
    const appWindow = getAppWindowRef?.()
    if (appWindow && !appWindow.isDestroyed()) {
      showAppWindowRef?.()
      appWindow.webContents.openDevTools({ mode: 'detach' })
      appWindow.webContents.send('diagnostics:dev-error', payload)
    }
  }
}

function recentLog(): string {
  const path = logPath()
  if (!path || !existsSync(path)) return ''
  const raw = readFileSync(path)
  return raw.slice(Math.max(0, raw.length - MAX_LOG_BYTES)).toString('utf-8')
}

function settingsSummary(): Record<string, unknown> {
  const s = storeRef?.store
  if (!s) return {}
  const profile = storeRef ? getActiveProfile(storeRef) : null
  return {
    poeVersion: s.poeVersion,
    league: profile?.league ?? '',
    updateChannel: s.updateChannel,
    developerMode: s.developerMode,
    filterConfigured: Boolean(profile?.filterPath),
    filterDirConfigured: Boolean(profile?.filterDir),
    closeOnClickOutside: s.closeOnClickOutside,
    overlayScale: s.overlayScale,
    openSide: s.openSide,
    stashScrollEnabled: s.stashScrollEnabled,
    cheatSheetsCategories: profile?.cheatSheets?.categories?.length ?? 0,
  }
}

function collectPlatformDiagnostics(): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  if (process.platform === 'linux') {
    result.sessionType = process.env.XDG_SESSION_TYPE
    result.desktopSession = process.env.XDG_CURRENT_DESKTOP || process.env.DESKTOP_SESSION
    result.waylandDisplayPresent = Boolean(process.env.WAYLAND_DISPLAY)
    result.x11DisplayPresent = Boolean(process.env.DISPLAY)
  }

  try {
    const ozonePlatform = app.commandLine?.getSwitchValue?.('ozone-platform')
    if (ozonePlatform) result.ozonePlatform = ozonePlatform
  } catch {
    /* app.commandLine unavailable (e.g. early startup or test) */
  }

  try {
    const displays = screen.getAllDisplays()
    result.displayCount = displays.length
    result.displays = displays.map((d) => ({
      size: { width: d.size.width, height: d.size.height },
      workAreaSize: { width: d.workAreaSize.width, height: d.workAreaSize.height },
      scaleFactor: d.scaleFactor,
      rotation: d.rotation,
    }))
  } catch {
    /* screen API unavailable */
  }

  try {
    const gpuStatus = app.getGPUFeatureStatus?.()
    if (gpuStatus) result.gpuFeatureStatus = gpuStatus
  } catch {
    /* app.getGPUFeatureStatus unavailable */
  }

  return result
}

function collectLogDiagnostics(): Record<string, unknown> {
  const result: Record<string, unknown> = {
    crashReporterUploadEnabled: false,
  }

  const path = logPath()
  if (path && existsSync(path)) {
    try {
      const size = statSync(path).size
      result.logFileBytes = size
      result.logTailBytesIncluded = Math.min(size, MAX_LOG_BYTES)
      result.logTruncatedInReport = size > MAX_LOG_BYTES
    } catch {
      /* permission error reading log */
    }
  } else {
    result.logFileBytes = 0
    result.logTailBytesIncluded = 0
    result.logTruncatedInReport = false
  }

  try {
    const crashDir = app.getPath('crashDumps')
    if (crashDir && existsSync(crashDir)) {
      const dmpFiles = readdirSync(crashDir).filter((f) => f.endsWith('.dmp'))
      result.recentCrashDumpCount = dmpFiles.length
      if (dmpFiles.length > 0) {
        const now = Date.now()
        let newest = 0
        for (const f of dmpFiles) {
          try {
            const mtime = statSync(join(crashDir, f)).mtimeMs
            if (mtime > newest) newest = mtime
          } catch {
            /* individual file stat failure */
          }
        }
        if (newest > 0) {
          result.newestCrashDumpAgeHours = Math.round(((now - newest) / (1000 * 60 * 60)) * 10) / 10
        }
      }
    }
  } catch {
    /* crash dumps unavailable */
  }

  return result
}

function githubIssueUrl(reportPath: string): string {
  const title = encodeURIComponent('Bug report')
  const body = redact(
    [
      'Describe what happened:',
      '',
      'Expected behavior:',
      '',
      'Steps to reproduce:',
      '',
      'Environment:',
      '```json',
      JSON.stringify(environmentSummary(), null, 2),
      '```',
      '',
      'Settings summary:',
      '```json',
      JSON.stringify(settingsSummary(), null, 2),
      '```',
      '',
      'Runtime diagnostics:',
      '```json',
      JSON.stringify(runtimeDiagnosticsSummary(), null, 2),
      '```',
      '',
      `Diagnostics report:`,
      `A local diagnostics report was generated at: ${reportPath}`,
      'Please review it before attaching. It is not uploaded automatically.',
      '',
      `Join Aer0's & Fred's Discord to help Scalpel Development and/or help debug this issue: ${DISCORD_INVITE_URL}`,
    ].join('\n'),
  )
  return `${GITHUB_NEW_ISSUE_URL}?title=${title}&body=${encodeURIComponent(body)}`
}

function createBugReport(): BugReportResult {
  const dir = diagnosticsDir()
  if (!dir) throw new Error('Diagnostics directory is not available yet')
  const createdAt = new Date().toISOString()
  const reportPath = join(dir, `scalpel-report-${createdAt.replace(/[:.]/g, '-')}.txt`)
  const content = redact(
    [
      'Scalpel diagnostics report',
      `Created: ${createdAt}`,
      '',
      'Environment:',
      JSON.stringify(environmentSummary(), null, 2),
      '',
      'Settings summary:',
      JSON.stringify(settingsSummary(), null, 2),
      '',
      'Runtime diagnostics:',
      JSON.stringify(runtimeDiagnosticsSummary(), null, 2),
      '',
      'Recent diagnostics log:',
      recentLog() || '<empty>',
    ].join('\n'),
  )
  writeFileSync(reportPath, content, 'utf-8')
  return {
    reportPath,
    githubIssueUrl: githubIssueUrl(reportPath),
  }
}

export async function createAndOpenBugReport(): Promise<BugReportResult> {
  const report = createBugReport()
  await shell.openExternal(report.githubIssueUrl)
  shell.showItemInFolder(report.reportPath)
  return report
}

export function installEarlyDiagnostics(): void {
  process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT]', err)
    recordMainDiagnostic('uncaughtException', err)
  })
  process.on('unhandledRejection', (err) => {
    console.error('[UNHANDLED REJECTION]', err)
    recordMainDiagnostic('unhandledRejection', err)
  })
}

export function registerDiagnostics(deps: {
  store: Store<AppSettings>
  getAppWindow: () => BrowserWindow | null
  showAppWindow: () => void
}): void {
  if (initialized) return
  initialized = true
  storeRef = deps.store
  getAppWindowRef = deps.getAppWindow
  showAppWindowRef = deps.showAppWindow

  ipcMain.on('diagnostics:renderer-error', (_event, payload: RendererDiagnosticPayload) => {
    recordRendererDiagnostic(payload)
  })
  ipcMain.handle('diagnostics:create-report', async (): Promise<BugReportResult> => {
    return createAndOpenBugReport()
  })
  ipcMain.handle('diagnostics:show-report', (_event, reportPath: string) => {
    shell.showItemInFolder(reportPath)
  })

  registerDiagnosticProvider('platformDiagnostics', collectPlatformDiagnostics)
  registerDiagnosticProvider('logDiagnostics', collectLogDiagnostics)
}

/** Test-only: the redaction pass that scrubs report and log content. */
export const _redactForTests = redact

/** Test-only: trims a log file to its most recent tail when it exceeds maxBytes. */
export const _trimLogToTailForTests = trimLogToTail

/** Test-only: returns the depersonalized environment summary object. */
export const _environmentSummaryForTests = environmentSummary

/** Test-only: returns the depersonalized settings summary object. */
export const _settingsSummaryForTests = settingsSummary

/** Test-only: builds the GitHub issue URL from a local report path. */
export const _githubIssueUrlForTests = githubIssueUrl

/** Test-only: returns the aggregated runtime diagnostics summary. */
export const _runtimeDiagnosticsSummaryForTests = runtimeDiagnosticsSummary
