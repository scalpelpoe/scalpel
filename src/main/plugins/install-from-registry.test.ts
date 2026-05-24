import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const PLUGIN_BYTES = new Uint8Array([1, 2, 3])
const PLUGIN_SHA = createHash('sha256').update(PLUGIN_BYTES).digest('hex')

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
}

vi.mock('fs', () => ({
  readFileSync: (p: string) => {
    const v = mockFs.files.get(p)
    if (v == null) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return v
  },
  existsSync: (p: string) => mockFs.files.has(p) || mockFs.bufs.has(p),
  writeFileSync: (p: string, data: string | Uint8Array) => {
    if (typeof data === 'string') mockFs.files.set(p, data)
    else mockFs.bufs.set(p, data)
  },
  mkdirSync: () => {},
  rmSync: () => {},
}))

beforeEach(() => {
  mockFs.files.clear()
  mockFs.bufs.clear()
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
})
