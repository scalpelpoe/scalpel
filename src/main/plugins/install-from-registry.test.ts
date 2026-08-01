import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const PLUGIN_BYTES = new Uint8Array([1, 2, 3])
const PLUGIN_SHA = createHash('sha256').update(PLUGIN_BYTES).digest('hex')

const NEW_BYTES = new Uint8Array([9, 9, 9])
const NEW_SHA = createHash('sha256').update(NEW_BYTES).digest('hex')

const TEST_USER_DATA = '/test/userData'

const { mockNetFetchFn } = vi.hoisted(() => ({
  mockNetFetchFn: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => TEST_USER_DATA), getVersion: vi.fn(() => '1.0.0') },
  net: { fetch: mockNetFetchFn },
}))

const mockFs = {
  files: new Map<string, string>(),
  bufs: new Map<string, Uint8Array>(),
  failRenameFrom: null as string | null,
}

vi.mock('fs', () => ({
  readFileSync: (p: string) => {
    const v = mockFs.files.get(p)
    if (v == null) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return v
  },
  existsSync: (p: string) => {
    if (mockFs.files.has(p) || mockFs.bufs.has(p)) return true
    for (const k of mockFs.files.keys()) if (k.startsWith(`${p}/`) || k.startsWith(`${p}\\`)) return true
    for (const k of mockFs.bufs.keys()) if (k.startsWith(`${p}/`) || k.startsWith(`${p}\\`)) return true
    return false
  },
  writeFileSync: (p: string, data: string | Uint8Array) => {
    if (typeof data === 'string') mockFs.files.set(p, data)
    else mockFs.bufs.set(p, data)
  },
  renameSync: (from: string, to: string) => {
    if (mockFs.failRenameFrom === from) throw new Error('simulated rename failure')
    const move = <T>(map: Map<string, T>): void => {
      for (const key of [...map.keys()]) {
        if (key === from) {
          map.set(to, map.get(key) as T)
          map.delete(key)
        } else if (key.startsWith(`${from}/`) || key.startsWith(`${from}\\`)) {
          map.set(to + key.slice(from.length), map.get(key) as T)
          map.delete(key)
        }
      }
    }
    move(mockFs.bufs)
    move(mockFs.files)
  },
  mkdirSync: () => {},
  rmSync: () => {},
}))

beforeEach(() => {
  mockFs.files.clear()
  mockFs.bufs.clear()
  mockFs.failRenameFrom = null
  mockNetFetchFn.mockReset()
  vi.resetModules()
})

const validEntry = {
  id: 'hello-world',
  name: 'Hello World',
  author: 'filterscalpel',
  description: 'd',
  repo: 'filterscalpel/scalpel-plugin-hello-world',
  latestVersion: '1.0.0',
  scalpelMinVersion: '>=0.0.0',
  sha256: PLUGIN_SHA,
}

const matchingManifest = {
  manifestVersion: 1,
  id: 'hello-world',
  version: '1.0.0',
  name: 'Hello World',
  description: 'd',
  author: 'filterscalpel',
  scalpelMinVersion: '>=0.0.0',
}

function readMockJson(path: string): unknown {
  const value = mockFs.files.get(path)
  if (value == null) throw new Error(`Expected mock file to exist: ${path}`)
  return JSON.parse(value)
}

function fetchResponses(map: Record<string, Response>) {
  mockNetFetchFn.mockImplementation(async (url: string) => {
    const r = map[url]
    if (r) return r
    return new Response(null, { status: 404 })
  })
}

describe('installFromRegistry', () => {
  it('downloads plugin.js + manifest.json and writes them to userData', async () => {
    fetchResponses({
      'https://github.com/filterscalpel/scalpel-plugin-hello-world/releases/download/v1.0.0/plugin.js': new Response(
        PLUGIN_BYTES,
      ),
      'https://github.com/filterscalpel/scalpel-plugin-hello-world/releases/download/v1.0.0/manifest.json':
        new Response(JSON.stringify(matchingManifest)),
    })
    const { installFromRegistry } = await import('./install-from-registry')
    const r = await installFromRegistry(validEntry)
    expect(r.ok).toBe(true)
    expect(mockFs.bufs.has(join(TEST_USER_DATA, 'plugins', 'hello-world', 'plugin.js'))).toBe(true)
    expect(mockFs.files.has(join(TEST_USER_DATA, 'plugins', 'hello-world', 'manifest.json'))).toBe(true)
  })

  it('appends to installed.json on success', async () => {
    fetchResponses({
      'https://github.com/filterscalpel/scalpel-plugin-hello-world/releases/download/v1.0.0/plugin.js': new Response(
        PLUGIN_BYTES,
      ),
      'https://github.com/filterscalpel/scalpel-plugin-hello-world/releases/download/v1.0.0/manifest.json':
        new Response(JSON.stringify(matchingManifest)),
    })
    const { installFromRegistry } = await import('./install-from-registry')
    await installFromRegistry(validEntry)
    const installed = readMockJson(join(TEST_USER_DATA, 'plugins', 'installed.json'))
    expect(installed).toEqual(['hello-world'])
  })

  it('does not duplicate the id when already installed', async () => {
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'installed.json'), JSON.stringify(['hello-world']))
    fetchResponses({
      'https://github.com/filterscalpel/scalpel-plugin-hello-world/releases/download/v1.0.0/plugin.js': new Response(
        PLUGIN_BYTES,
      ),
      'https://github.com/filterscalpel/scalpel-plugin-hello-world/releases/download/v1.0.0/manifest.json':
        new Response(JSON.stringify(matchingManifest)),
    })
    const { installFromRegistry } = await import('./install-from-registry')
    await installFromRegistry(validEntry)
    const installed = readMockJson(join(TEST_USER_DATA, 'plugins', 'installed.json'))
    expect(installed).toEqual(['hello-world'])
  })

  it('rejects when manifest id does not match the registry id', async () => {
    fetchResponses({
      'https://github.com/filterscalpel/scalpel-plugin-hello-world/releases/download/v1.0.0/plugin.js': new Response(
        PLUGIN_BYTES,
      ),
      'https://github.com/filterscalpel/scalpel-plugin-hello-world/releases/download/v1.0.0/manifest.json':
        new Response(JSON.stringify({ ...matchingManifest, id: 'something-else' })),
    })
    const { installFromRegistry } = await import('./install-from-registry')
    const r = await installFromRegistry(validEntry)
    expect(r.ok).toBe(false)
  })

  it('rejects when manifest version does not match the registry latestVersion', async () => {
    fetchResponses({
      'https://github.com/filterscalpel/scalpel-plugin-hello-world/releases/download/v1.0.0/plugin.js': new Response(
        PLUGIN_BYTES,
      ),
      'https://github.com/filterscalpel/scalpel-plugin-hello-world/releases/download/v1.0.0/manifest.json':
        new Response(JSON.stringify({ ...matchingManifest, version: '0.5.0' })),
    })
    const { installFromRegistry } = await import('./install-from-registry')
    const r = await installFromRegistry(validEntry)
    expect(r.ok).toBe(false)
  })

  it('rejects when the plugin.js download 404s', async () => {
    fetchResponses({
      'https://github.com/filterscalpel/scalpel-plugin-hello-world/releases/download/v1.0.0/manifest.json':
        new Response(JSON.stringify(matchingManifest)),
    })
    const { installFromRegistry } = await import('./install-from-registry')
    const r = await installFromRegistry(validEntry)
    expect(r.ok).toBe(false)
  })

  it('rejects when scalpelMinVersion is not satisfied', async () => {
    fetchResponses({})
    const entry = { ...validEntry, scalpelMinVersion: '>=99.0.0' }
    const { installFromRegistry } = await import('./install-from-registry')
    const r = await installFromRegistry(entry)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.toLowerCase()).toContain('version')
  })

  it('rejects when plugin.js checksum does not match', async () => {
    fetchResponses({
      'https://github.com/filterscalpel/scalpel-plugin-hello-world/releases/download/v1.0.0/plugin.js': new Response(
        PLUGIN_BYTES,
      ),
      'https://github.com/filterscalpel/scalpel-plugin-hello-world/releases/download/v1.0.0/manifest.json':
        new Response(JSON.stringify(matchingManifest)),
    })
    const entry = { ...validEntry, sha256: '0'.repeat(64) }
    const { installFromRegistry } = await import('./install-from-registry')
    const r = await installFromRegistry(entry)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.toLowerCase()).toContain('checksum')
  })

  it('preserves the existing plugin when a write throws (no delete on failure)', async () => {
    // Pre-seed an older working install on disk.
    const destPluginJs = join(TEST_USER_DATA, 'plugins', 'hello-world', 'plugin.js')
    mockFs.bufs.set(destPluginJs, PLUGIN_BYTES)
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'installed.json'), JSON.stringify(['hello-world']))

    // Make the manifest write throw (staged into the .incoming temp dir).
    const realSet = mockFs.files.set.bind(mockFs.files)
    vi.spyOn(mockFs.files, 'set').mockImplementation((p: string, v: string) => {
      if (p.endsWith('manifest.json')) throw new Error('disk full')
      return realSet(p, v)
    })

    const newEntry = { ...validEntry, latestVersion: '2.0.0', sha256: NEW_SHA }
    fetchResponses({
      'https://github.com/filterscalpel/scalpel-plugin-hello-world/releases/download/v2.0.0/plugin.js': new Response(
        NEW_BYTES,
      ),
      'https://github.com/filterscalpel/scalpel-plugin-hello-world/releases/download/v2.0.0/manifest.json':
        new Response(JSON.stringify({ ...matchingManifest, version: '2.0.0' })),
    })

    const { installFromRegistry } = await import('./install-from-registry')
    const r = await installFromRegistry(newEntry)

    expect(r.ok).toBe(false)
    // The live plugin.js is untouched (still the OLD bytes), not deleted.
    expect(mockFs.bufs.get(destPluginJs)).toEqual(PLUGIN_BYTES)
    vi.restoreAllMocks()
  })

  it('restores the previous plugin when the final swap rename throws', async () => {
    const destPluginJs = join(TEST_USER_DATA, 'plugins', 'hello-world', 'plugin.js')
    mockFs.bufs.set(destPluginJs, PLUGIN_BYTES)
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'installed.json'), JSON.stringify(['hello-world']))
    // Throw on the temp -> dest swap (after the old install was moved aside).
    mockFs.failRenameFrom = join(TEST_USER_DATA, 'plugins', 'hello-world.incoming')

    const newEntry = { ...validEntry, latestVersion: '2.0.0', sha256: NEW_SHA }
    fetchResponses({
      'https://github.com/filterscalpel/scalpel-plugin-hello-world/releases/download/v2.0.0/plugin.js': new Response(
        NEW_BYTES,
      ),
      'https://github.com/filterscalpel/scalpel-plugin-hello-world/releases/download/v2.0.0/manifest.json':
        new Response(JSON.stringify({ ...matchingManifest, version: '2.0.0' })),
    })

    const { installFromRegistry } = await import('./install-from-registry')
    const r = await installFromRegistry(newEntry)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('install write failed')
    // The previous install was moved to backup, then restored to destDir.
    expect(mockFs.bufs.get(destPluginJs)).toEqual(PLUGIN_BYTES)
  })

  it('overwrites an existing plugin in place (update path)', async () => {
    // Pre-seed an older install on disk + in installed.json.
    mockFs.bufs.set(join(TEST_USER_DATA, 'plugins', 'hello-world', 'plugin.js'), PLUGIN_BYTES)
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'installed.json'), JSON.stringify(['hello-world']))

    const newManifest = { ...matchingManifest, version: '2.0.0' }
    const newEntry = { ...validEntry, latestVersion: '2.0.0', sha256: NEW_SHA }
    fetchResponses({
      'https://github.com/filterscalpel/scalpel-plugin-hello-world/releases/download/v2.0.0/plugin.js': new Response(
        NEW_BYTES,
      ),
      'https://github.com/filterscalpel/scalpel-plugin-hello-world/releases/download/v2.0.0/manifest.json':
        new Response(JSON.stringify(newManifest)),
    })

    const { installFromRegistry } = await import('./install-from-registry')
    const r = await installFromRegistry(newEntry)

    expect(r.ok).toBe(true)
    expect(mockFs.bufs.get(join(TEST_USER_DATA, 'plugins', 'hello-world', 'plugin.js'))).toEqual(NEW_BYTES)
    expect(readMockJson(join(TEST_USER_DATA, 'plugins', 'hello-world', 'manifest.json'))).toMatchObject({
      version: '2.0.0',
    })
    expect(readMockJson(join(TEST_USER_DATA, 'plugins', 'installed.json'))).toEqual(['hello-world'])
  })
})
