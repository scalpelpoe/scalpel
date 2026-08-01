import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_USER_DATA = '/test/userData'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => TEST_USER_DATA) },
  net: {},
  protocol: {},
}))

const mockFs = {
  mtimes: new Map<string, number>(),
}

vi.mock('fs', () => ({
  existsSync: (p: string) => mockFs.mtimes.has(p),
  statSync: (p: string) => {
    const m = mockFs.mtimes.get(p)
    if (m == null) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return { mtimeMs: m }
  },
}))

const entryPath = join(TEST_USER_DATA, 'plugins', 'hello-world', 'plugin.js')

beforeEach(() => {
  mockFs.mtimes.clear()
  vi.resetModules()
})

describe('versionedPluginEntryUrl', () => {
  it('cache-keys the entry URL on version and the entry file mtime', async () => {
    mockFs.mtimes.set(entryPath, 1_700_000_000_123)
    const { versionedPluginEntryUrl } = await import('./entry-url')
    expect(versionedPluginEntryUrl('hello-world', '1.0.0')).toBe(
      'scalpel-plugin://hello-world/plugin.js?v=1.0.0-1700000000123',
    )
  })

  it('changes when the entry file is rewritten at the same version', async () => {
    mockFs.mtimes.set(entryPath, 1_700_000_000_000)
    const { versionedPluginEntryUrl } = await import('./entry-url')
    const before = versionedPluginEntryUrl('hello-world', '1.0.0')
    mockFs.mtimes.set(entryPath, 1_700_000_009_000)
    expect(versionedPluginEntryUrl('hello-world', '1.0.0')).not.toBe(before)
  })

  it('falls back to the version alone when the entry file cannot be stat-ed', async () => {
    const { versionedPluginEntryUrl } = await import('./entry-url')
    expect(versionedPluginEntryUrl('hello-world', '1.0.0')).toBe('scalpel-plugin://hello-world/plugin.js?v=1.0.0')
  })
})
