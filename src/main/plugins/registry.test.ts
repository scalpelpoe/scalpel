import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_USER_DATA = '/test/userData'

const { mockNetFetchFn } = vi.hoisted(() => ({
  mockNetFetchFn: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => TEST_USER_DATA) },
  net: { fetch: mockNetFetchFn },
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
  writeFileSync: (p: string, data: string) => {
    mockFs.files.set(p, data)
  },
  mkdirSync: () => {},
}))

beforeEach(() => {
  mockFs.files.clear()
  mockNetFetchFn.mockReset()
  vi.resetModules()
})

const validRegistry = {
  schemaVersion: 1,
  plugins: [
    {
      id: 'hello-world',
      name: 'Hello World',
      author: 'filterscalpel',
      description: 'd',
      repo: 'filterscalpel/scalpel-plugin-hello-world',
      latestVersion: '1.0.0',
      scalpelMinVersion: '>=0.0.0',
      sha256: 'a'.repeat(64),
    },
  ],
}

function mockNetFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  mockNetFetchFn.mockImplementation(impl)
}

describe('fetchRegistry', () => {
  it('returns the registry on a successful 200 response', async () => {
    mockNetFetch(async () => new Response(JSON.stringify(validRegistry), { status: 200 }))
    const { fetchRegistry } = await import('./registry')
    const result = await fetchRegistry()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.snapshot.plugins[0].id).toBe('hello-world')
    }
  })

  it('writes the response + etag to the cache file', async () => {
    mockNetFetch(
      async () =>
        new Response(JSON.stringify(validRegistry), {
          status: 200,
          headers: { etag: '"abc123"' },
        }),
    )
    const { fetchRegistry } = await import('./registry')
    await fetchRegistry()
    const cachePath = join(TEST_USER_DATA, 'plugins', 'registry-cache.json')
    expect(mockFs.files.has(cachePath)).toBe(true)
    const cached = JSON.parse(mockFs.files.get(cachePath)!)
    expect(cached.etag).toBe('"abc123"')
    expect(cached.snapshot.plugins[0].id).toBe('hello-world')
  })

  it('uses cached registry on a 304 response', async () => {
    const cachePath = join(TEST_USER_DATA, 'plugins', 'registry-cache.json')
    mockFs.files.set(cachePath, JSON.stringify({ etag: '"abc123"', snapshot: validRegistry }))
    mockNetFetch(async () => new Response(null, { status: 304 }))
    const { fetchRegistry } = await import('./registry')
    const result = await fetchRegistry()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.snapshot.plugins[0].id).toBe('hello-world')
  })

  it('returns the cached registry when the network fetch throws', async () => {
    const cachePath = join(TEST_USER_DATA, 'plugins', 'registry-cache.json')
    mockFs.files.set(cachePath, JSON.stringify({ etag: '"abc123"', snapshot: validRegistry }))
    mockNetFetch(async () => {
      throw new Error('network down')
    })
    const { fetchRegistry } = await import('./registry')
    const result = await fetchRegistry()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.snapshot.plugins[0].id).toBe('hello-world')
  })

  it('returns ok:false when network fails and no cache exists', async () => {
    mockNetFetch(async () => {
      throw new Error('network down')
    })
    const { fetchRegistry } = await import('./registry')
    const result = await fetchRegistry()
    expect(result.ok).toBe(false)
  })

  it('rejects a registry with the wrong schemaVersion', async () => {
    mockNetFetch(async () => new Response(JSON.stringify({ schemaVersion: 99, plugins: [] }), { status: 200 }))
    const { fetchRegistry } = await import('./registry')
    const result = await fetchRegistry()
    expect(result.ok).toBe(false)
  })

  it('rejects a registry entry with a bad id', async () => {
    const bad = {
      schemaVersion: 1,
      plugins: [{ ...validRegistry.plugins[0], id: 'BAD' }],
    }
    mockNetFetch(async () => new Response(JSON.stringify(bad), { status: 200 }))
    const { fetchRegistry } = await import('./registry')
    const result = await fetchRegistry()
    // Bad entries are skipped, not the whole registry rejected. So ok:true
    // with the bad entry dropped.
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.snapshot.plugins).toHaveLength(0)
  })

  it('uses the override URL when provided', async () => {
    const captured: string[] = []
    mockNetFetch(async (url) => {
      captured.push(url)
      return new Response(JSON.stringify(validRegistry), { status: 200 })
    })
    const { fetchRegistry } = await import('./registry')
    await fetchRegistry('file:///some/local/registry.json')
    expect(captured[0]).toBe('file:///some/local/registry.json')
  })

  it('drops an entry with a malformed sha256', async () => {
    const bad = {
      schemaVersion: 1,
      plugins: [{ ...validRegistry.plugins[0], sha256: 'not-a-hash' }],
    }
    mockNetFetch(async () => new Response(JSON.stringify(bad), { status: 200 }))
    const { fetchRegistry } = await import('./registry')
    const result = await fetchRegistry()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.snapshot.plugins).toHaveLength(0)
  })

  it('drops an entry with a malformed repo', async () => {
    const bad = {
      schemaVersion: 1,
      plugins: [{ ...validRegistry.plugins[0], repo: '../evil' }],
    }
    mockNetFetch(async () => new Response(JSON.stringify(bad), { status: 200 }))
    const { fetchRegistry } = await import('./registry')
    const result = await fetchRegistry()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.snapshot.plugins).toHaveLength(0)
  })
})
