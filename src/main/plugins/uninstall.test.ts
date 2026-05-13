import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join, sep } from 'path'

const TEST_USER_DATA = '/test/userData'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => TEST_USER_DATA) },
}))

const mockFs = {
  files: new Map<string, string>(),
  dirsRemoved: [] as string[],
}

vi.mock('fs', () => ({
  readFileSync: (p: string) => {
    const v = mockFs.files.get(p)
    if (v == null) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return v
  },
  existsSync: (p: string) => {
    if (mockFs.files.has(p)) return true
    // directory exists iff any file path starts with it
    for (const k of mockFs.files.keys()) {
      if (k.startsWith(p + sep)) return true
    }
    return false
  },
  writeFileSync: (p: string, data: string) => {
    mockFs.files.set(p, data)
  },
  mkdirSync: () => {},
  rmSync: (p: string, opts: { recursive?: boolean; force?: boolean }) => {
    mockFs.dirsRemoved.push(p)
    if (opts?.recursive) {
      for (const k of [...mockFs.files.keys()]) {
        if (k === p || k.startsWith(p + '/')) mockFs.files.delete(k)
      }
    } else {
      mockFs.files.delete(p)
    }
  },
}))

beforeEach(() => {
  mockFs.files.clear()
  mockFs.dirsRemoved.length = 0
  vi.resetModules()
})

describe('uninstallPlugin', () => {
  it('removes the plugin directory and updates installed.json', async () => {
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'installed.json'), JSON.stringify(['hello-world', 'other']))
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'hello-world', 'plugin.js'), 'X')
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'hello-world', 'manifest.json'), '{}')

    const { uninstallPlugin } = await import('./uninstall')
    const r = uninstallPlugin('hello-world')
    expect(r.ok).toBe(true)
    expect(mockFs.dirsRemoved).toContain(join(TEST_USER_DATA, 'plugins', 'hello-world'))
    const installed = JSON.parse(mockFs.files.get(join(TEST_USER_DATA, 'plugins', 'installed.json'))!)
    expect(installed).toEqual(['other'])
  })

  it('is a no-op success when the plugin is not installed', async () => {
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'installed.json'), JSON.stringify(['other']))
    const { uninstallPlugin } = await import('./uninstall')
    const r = uninstallPlugin('hello-world')
    expect(r.ok).toBe(true)
    const installed = JSON.parse(mockFs.files.get(join(TEST_USER_DATA, 'plugins', 'installed.json'))!)
    expect(installed).toEqual(['other'])
  })

  it('rejects malformed plugin ids defensively', async () => {
    const { uninstallPlugin } = await import('./uninstall')
    const r = uninstallPlugin('../../etc/passwd')
    expect(r.ok).toBe(false)
  })
})
