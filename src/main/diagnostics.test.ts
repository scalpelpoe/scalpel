import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Store from 'electron-store'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../shared/types'

const HOME = '/home/exile'

vi.mock('electron', () => ({
  app: {
    isReady: () => true,
    getPath: (key: string) => (key === 'home' ? HOME : '/tmp/userData'),
  },
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  shell: { openExternal: vi.fn(), showItemInFolder: vi.fn() },
}))

import { _redactForTests as redact, _trimLogToTailForTests as trimLogToTail, registerDiagnostics } from './diagnostics'

const SETTINGS = {
  filterPath: 'D:\\poe\\filters\\strict.filter',
  filterDir: 'D:\\poe\\filters',
  filterPathPoe2: 'E:\\poe2\\filters\\loot.filter',
} as Partial<AppSettings>

beforeAll(() => {
  registerDiagnostics({
    store: { store: SETTINGS } as unknown as Store<AppSettings>,
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
