import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { release } from 'node:os'
import { join } from 'node:path'
import { app, type BrowserWindow, ipcMain, shell } from 'electron'
import type Store from 'electron-store'
import type { BugReportResult, RendererDiagnosticPayload, SerializedDiagnosticError } from '../shared/diagnostics'
import { serializeDiagnosticError } from '../shared/diagnostics'
import { DISCORD_INVITE_URL, GITHUB_NEW_ISSUE_URL } from '../shared/endpoints'
import type { AppSettings } from '../shared/types'

// Tail of the log embedded in a generated bug report.
const MAX_LOG_BYTES = 256 * 1024
// Hard cap for scalpel.log on disk. Past this it's trimmed back to its most
// recent half so the file never grows without bound.
const MAX_LOG_FILE_BYTES = 4 * 1024 * 1024
const EARLY_LOGS: string[] = []

let initialized = false
let storeRef: Store<AppSettings> | null = null
let getAppWindowRef: (() => BrowserWindow | null) | null = null
let showAppWindowRef: (() => void) | null = null

function isDevRuntime(): boolean {
  return !app.isPackaged
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
  const settings = storeRef?.store
  for (const value of [
    settings?.filterPath,
    settings?.filterDir,
    settings?.filterPathPoe1,
    settings?.filterPathPoe2,
    settings?.filterDirPoe1,
    settings?.filterDirPoe2,
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
  return {
    poeVersion: s.poeVersion,
    league: s.league,
    updateChannel: s.updateChannel,
    developerMode: s.developerMode,
    filterConfigured: Boolean(s.filterPath),
    filterDirConfigured: Boolean(s.filterDir),
    closeOnClickOutside: s.closeOnClickOutside,
    overlayScale: s.overlayScale,
    openSide: s.openSide,
    stashScrollEnabled: s.stashScrollEnabled,
    cheatSheetsCategories: s.cheatSheets?.categories?.length ?? 0,
  }
}

function githubIssueUrl(reportPath: string): string {
  const title = encodeURIComponent('Bug report')
  const body = encodeURIComponent(
    [
      'Describe what happened:',
      '',
      'Expected behavior:',
      '',
      'Steps to reproduce:',
      '',
      `Diagnostics report generated at: ${redact(reportPath)}`,
      'Please attach the generated report file.',
      '',
      `Join Aer0's & Fred's Discord to help Scalpel Development and/or help debug this issue: ${DISCORD_INVITE_URL}`,
    ].join('\n'),
  )
  return `${GITHUB_NEW_ISSUE_URL}?title=${title}&body=${body}`
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
      `Version: ${app.getVersion()}`,
      `Electron: ${process.versions.electron}`,
      `Chrome: ${process.versions.chrome}`,
      `Node: ${process.versions.node}`,
      `Platform: ${process.platform} ${process.arch} ${release()}`.trim(),
      `Packaged: ${app.isPackaged}`,
      `Dev runtime: ${isDevRuntime()}`,
      '',
      'Settings summary:',
      JSON.stringify(settingsSummary(), null, 2),
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
}

/** Test-only: the redaction pass that scrubs report and log content. */
export const _redactForTests = redact

/** Test-only: trims a log file to its most recent tail when it exceeds maxBytes. */
export const _trimLogToTailForTests = trimLogToTail
