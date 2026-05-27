import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Store from 'electron-store'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../shared/types'

const HOME = '/home/exile'

const STORE_GET_MOCK = vi.fn().mockReturnValue(null)

vi.mock('electron', () => ({
  app: {
    isReady: () => true,
    getPath: (key: string) => (key === 'home' ? HOME : '/tmp/userData'),
    getVersion: () => '0.9.9-rc1',
    isPackaged: true,
  },
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  shell: { openExternal: vi.fn(), showItemInFolder: vi.fn() },
}))

import {
  _redactForTests as redact,
  _trimLogToTailForTests as trimLogToTail,
  _environmentSummaryForTests as environmentSummary,
  _settingsSummaryForTests as settingsSummary,
  _githubIssueUrlForTests as githubIssueUrl,
  _runtimeDiagnosticsSummaryForTests as runtimeDiagnosticsSummary,
  registerDiagnostics,
} from './diagnostics'

const SETTINGS = {
  filterPath: 'D:\\poe\\filters\\strict.filter',
  filterDir: 'D:\\poe\\filters',
  filterPathPoe2: 'E:\\poe2\\filters\\loot.filter',
} as Partial<AppSettings>

beforeAll(() => {
  ;(process.versions as Record<string, string>).electron = '31.0.0'
  ;(process.versions as Record<string, string>).chrome = '126.0.6478.234'
  registerDiagnostics({
    store: { store: SETTINGS, get: STORE_GET_MOCK } as unknown as Store<AppSettings>,
    getAppWindow: () => null,
    showAppWindow: () => {},
  })
})

describe('redact', () => {
  it('scrubs the POESESSID cookie value', () => {
    const out = redact('POESESSID=abc123secret')
    expect(out).toBe('POESESSID=<redacted>')
  })

  it('scrubs a POESESSID embedded in a Cookie header', () => {
    const out = redact('Cookie: POESESSID=abc123secret; theme=dark')
    expect(out).not.toContain('abc123secret')
  })

  it('scrubs bearer tokens behind an authorization keyword', () => {
    const out = redact('authorization: Bearer eyJhbGci.secret.signature')
    expect(out).toContain('authorization: <redacted>')
    expect(out).not.toContain('eyJhbGci')
  })

  it('scrubs session/token/cookie key-value pairs', () => {
    expect(redact('token=xyz789')).toBe('token=<redacted>')
    expect(redact('session: "deadbeef"')).not.toContain('deadbeef')
  })

  it('replaces the user home directory with <home>', () => {
    expect(redact(`${HOME}/.config/scalpel/scalpel.log`)).toBe('<home>/.config/scalpel/scalpel.log')
  })

  it('replaces Windows user paths with <home>', () => {
    const out = redact('C:\\Users\\bob\\AppData\\Roaming\\Scalpel\\error.txt')
    expect(out).not.toContain('bob')
    expect(out).toContain('<home>')
  })

  it('replaces configured filter paths with <path>', () => {
    expect(redact('failed to read D:\\poe\\filters\\strict.filter')).toBe('failed to read <path>')
    expect(redact('loaded E:\\poe2\\filters\\loot.filter')).toContain('<path>')
  })

  it('leaves non-sensitive text untouched', () => {
    const line = 'overlay attached to game window 12345'
    expect(redact(line)).toBe(line)
  })
})

describe('trimLogToTail', () => {
  it('leaves a file under the cap untouched', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'scalpel-log-')), 'scalpel.log')
    const content = 'line-0\nline-1\nline-2\n'
    writeFileSync(path, content)
    trimLogToTail(path, 500)
    expect(readFileSync(path, 'utf-8')).toBe(content)
  })

  it('caps an oversized file to its most recent tail at a line boundary', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'scalpel-log-')), 'scalpel.log')
    writeFileSync(path, `${Array.from({ length: 500 }, (_, i) => `line-${i}`).join('\n')}\n`)
    trimLogToTail(path, 500)
    const result = readFileSync(path, 'utf-8')
    expect(Buffer.byteLength(result)).toBeLessThanOrEqual(500)
    expect(result.startsWith('line-')).toBe(true) // no partial leading line
    expect(result).toContain('line-499') // most recent content retained
  })

  it('is a no-op when the file does not exist', () => {
    expect(() => trimLogToTail(join(tmpdir(), 'scalpel-missing.log'), 500)).not.toThrow()
  })
})

describe('environmentSummary', () => {
  it('returns expected environment keys', () => {
    const env = environmentSummary()
    expect(env).toHaveProperty('appVersion')
    expect(env).toHaveProperty('electron')
    expect(env).toHaveProperty('chrome')
    expect(env).toHaveProperty('node')
    expect(env).toHaveProperty('platform')
    expect(env).toHaveProperty('arch')
    expect(env).toHaveProperty('osRelease')
    expect(env).toHaveProperty('packaged')
    expect(env).toHaveProperty('devRuntime')
  })

  it('returns truthy version strings', () => {
    const env = environmentSummary() as unknown as Record<string, string>
    expect(typeof env.appVersion).toBe('string')
    expect(env.appVersion.length).toBeGreaterThan(0)
    expect(typeof env.electron).toBe('string')
    expect(env.electron.length).toBeGreaterThan(0)
    expect(typeof env.chrome).toBe('string')
    expect(env.chrome.length).toBeGreaterThan(0)
    expect(typeof env.node).toBe('string')
    expect(env.node.length).toBeGreaterThan(0)
  })
})

describe('settingsSummary', () => {
  it('includes the league field (not a configure boolean)', () => {
    const summary = settingsSummary()
    expect(summary).toHaveProperty('league')
    expect(summary).not.toHaveProperty('leagueConfigured')
  })

  it('does not expose raw configured filter paths', () => {
    const summary = settingsSummary()
    expect(typeof summary.filterConfigured).toBe('boolean')
    expect(typeof summary.filterDirConfigured).toBe('boolean')
    expect(JSON.stringify(summary)).not.toContain('D:\\\\poe\\\\filters')
    expect(JSON.stringify(summary)).not.toContain('E:\\\\poe2\\\\filters')
  })
})

describe('githubIssueUrl', () => {
  const fakePath = '/tmp/scalpel-report.txt'

  it('includes environment fields in the body', () => {
    const url = githubIssueUrl(fakePath)
    const body = decodeURIComponent(url)
    expect(body).toContain('Environment:')
    expect(body).toContain('appVersion')
    expect(body).toContain('electron')
    expect(body).toContain('node')
    expect(body).toContain('platform')
    expect(body).toContain('arch')
    expect(body).toContain('osRelease')
  })

  it('says nothing is uploaded automatically', () => {
    const url = githubIssueUrl(fakePath)
    const body = decodeURIComponent(url)
    expect(body).toContain('It is not uploaded automatically')
  })

  it('does not include raw configured filter paths', () => {
    const url = githubIssueUrl(fakePath)
    const body = decodeURIComponent(url)
    expect(body).not.toContain('strict.filter')
    expect(body).not.toContain('loot.filter')
  })

  it('includes league field in settings summary', () => {
    const url = githubIssueUrl(fakePath)
    const body = decodeURIComponent(url)
    expect(body).toContain('"league"')
  })

  it('includes Runtime diagnostics section', () => {
    const url = githubIssueUrl(fakePath)
    const body = decodeURIComponent(url)
    expect(body).toContain('Runtime diagnostics:')
    expect(body).toContain('platformDiagnostics')
    expect(body).toContain('logDiagnostics')
  })

  it('does not include raw configured filter paths in Runtime diagnostics', () => {
    const url = githubIssueUrl(fakePath)
    const body = decodeURIComponent(url)
    // The Runtime diagnostics section is JSON after the Settings summary block.
    // Filter paths should not appear anywhere in the body.
    expect(body).not.toContain('strict.filter')
    expect(body).not.toContain('loot.filter')
  })
})

describe('runtimeDiagnosticsSummary', () => {
  it('returns an object with registered provider keys', () => {
    const summary = runtimeDiagnosticsSummary()
    expect(summary).toHaveProperty('platformDiagnostics')
    expect(summary).toHaveProperty('logDiagnostics')
  })

  it('logDiagnostics reports crash upload as disabled', () => {
    const summary = runtimeDiagnosticsSummary()
    const logDiag = summary.logDiagnostics as Record<string, unknown>
    expect(logDiag.crashReporterUploadEnabled).toBe(false)
  })

  it('logDiagnostics includes the expected shape', () => {
    const summary = runtimeDiagnosticsSummary()
    const logDiag = summary.logDiagnostics as Record<string, unknown>
    expect(logDiag).toHaveProperty('logFileBytes')
    expect(logDiag).toHaveProperty('logTailBytesIncluded')
    expect(logDiag).toHaveProperty('logTruncatedInReport')
  })
})
