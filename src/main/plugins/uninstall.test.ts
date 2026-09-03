import { join, sep } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  renameSync: (from: string, to: string) => {
    for (const key of [...mockFs.files.keys()]) {
      if (key === from || key.startsWith(`${from}${sep}`)) {
        mockFs.files.set(to + key.slice(from.length), mockFs.files.get(key)!)
        mockFs.files.delete(key)
      }
    }
  },
  rmSync: (p: string, opts: { recursive?: boolean; force?: boolean }) => {
    mockFs.dirsRemoved.push(p)
    if (opts?.recursive) {
      for (const k of [...mockFs.files.keys()]) {
        if (k === p || k.startsWith(`${p}${sep}`)) mockFs.files.delete(k)
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
    expect(mockFs.files.has(join(TEST_USER_DATA, 'plugins', 'hello-world', 'plugin.js'))).toBe(false)
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

  it('removes id from unpacked.json when uninstalling a side-loaded plugin', async () => {
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'installed.json'), JSON.stringify(['hello-world']))
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'unpacked.json'), JSON.stringify(['hello-world']))
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'hello-world', 'plugin.js'), 'X')

    const { uninstallPlugin } = await import('./uninstall')
    uninstallPlugin('hello-world')

    const raw = mockFs.files.get(join(TEST_USER_DATA, 'plugins', 'unpacked.json'))
    const unpacked = raw != null ? JSON.parse(raw) : []
    expect(unpacked).toEqual([])
  })

  it('moves legacy in-package storage aside before removing the package', async () => {
    const legacyFile = join(TEST_USER_DATA, 'plugins', 'hello-world', 'storage.json')
    const storageFile = join(TEST_USER_DATA, 'plugin-storage', 'hello-world', 'storage.json')
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'installed.json'), JSON.stringify(['hello-world']))
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'hello-world', 'plugin.js'), 'X')
    mockFs.files.set(legacyFile, JSON.stringify({ key: 'value' }))

    const { uninstallPlugin } = await import('./uninstall')
    expect(uninstallPlugin('hello-world')).toEqual({ ok: true })

    expect(mockFs.files.has(legacyFile)).toBe(false)
    expect(mockFs.files.get(storageFile)).toBe(JSON.stringify({ key: 'value' }))
  })

  it('keeps storage available until shutdown, then removes it', async () => {
    const storageFile = join(TEST_USER_DATA, 'plugin-storage', 'hello-world', 'storage.json')
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'installed.json'), JSON.stringify(['hello-world']))
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'hello-world', 'plugin.js'), 'X')
    mockFs.files.set(storageFile, JSON.stringify({ key: 'value' }))

    const { finalizePendingStorageRemovals, getValue, setValue } = await import('./storage')
    const { uninstallPlugin } = await import('./uninstall')

    // Warm the in-memory cache.
    expect(getValue('hello-world', 'key')).toBe('value')

    // Write a new value to mark the plugin dirty.
    setValue('hello-world', 'key', 'stale')

    // The old renderer graph remains active until restart.
    uninstallPlugin('hello-world')
    expect(getValue('hello-world', 'key')).toBe('stale')

    finalizePendingStorageRemovals()
    expect(mockFs.files.has(storageFile)).toBe(false)
  })
})
