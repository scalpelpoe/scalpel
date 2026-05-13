import { describe, it, expect, vi, beforeEach } from 'vitest'
import { join } from 'path'

const TEST_USER_DATA = '/test/userData'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => TEST_USER_DATA) },
}))

const mockFs = {
  files: new Map<string, string>(),
}

vi.mock('fs', () => ({
  readFileSync: (p: string) => {
    const v = mockFs.files.get(p)
    if (v == null) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return v
  },
  existsSync: (p: string) => mockFs.files.has(p),
}))

beforeEach(() => {
  mockFs.files.clear()
  vi.resetModules()
})

const validManifest = (id: string, version = '1.0.0') =>
  JSON.stringify({
    manifestVersion: 1,
    id,
    version,
    name: id,
    description: 'd',
    author: 'a',
    scalpelMinVersion: '>=0.20.0',
  })

describe('getInstalledPlugins', () => {
  it('returns [] when installed.json does not exist', async () => {
    const { getInstalledPlugins } = await import('./manager')
    expect(getInstalledPlugins()).toEqual([])
  })

  it('returns [] when installed.json is unparseable', async () => {
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'installed.json'), 'not json')
    const { getInstalledPlugins } = await import('./manager')
    expect(getInstalledPlugins()).toEqual([])
  })

  it('reads each installed plugin manifest in order', async () => {
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'installed.json'), JSON.stringify(['alpha', 'beta']))
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'alpha', 'manifest.json'), validManifest('alpha'))
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'beta', 'manifest.json'), validManifest('beta'))
    const { getInstalledPlugins } = await import('./manager')
    const list = getInstalledPlugins()
    expect(list.map((p) => p.manifest.id)).toEqual(['alpha', 'beta'])
  })

  it('skips an entry when its manifest is missing', async () => {
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'installed.json'), JSON.stringify(['alpha', 'beta']))
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'alpha', 'manifest.json'), validManifest('alpha'))
    const { getInstalledPlugins } = await import('./manager')
    expect(getInstalledPlugins().map((p) => p.manifest.id)).toEqual(['alpha'])
  })

  it('skips an entry whose manifest fails validation', async () => {
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'installed.json'), JSON.stringify(['bad']))
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'bad', 'manifest.json'), JSON.stringify({ manifestVersion: 99 }))
    const { getInstalledPlugins } = await import('./manager')
    expect(getInstalledPlugins()).toEqual([])
  })

  it('skips an entry whose declared id does not match its directory', async () => {
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'installed.json'), JSON.stringify(['alpha']))
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'alpha', 'manifest.json'), validManifest('something-else'))
    const { getInstalledPlugins } = await import('./manager')
    expect(getInstalledPlugins()).toEqual([])
  })

  it('includes the entry file path for each plugin', async () => {
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'installed.json'), JSON.stringify(['alpha']))
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'alpha', 'manifest.json'), validManifest('alpha'))
    const { getInstalledPlugins } = await import('./manager')
    const [p] = getInstalledPlugins()
    expect(p.entryPath).toBe(join(TEST_USER_DATA, 'plugins', 'alpha', 'plugin.js'))
  })
})
