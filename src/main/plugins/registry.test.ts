import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    expect(cached.url).toBe('https://raw.githubusercontent.com/scalpelpoe/scalpel-plugins-registry/main/registry.json')
    expect(cached.etag).toBe('"abc123"')
    expect(cached.snapshot.plugins[0].id).toBe('hello-world')
  })

  it('uses cached registry on a 304 response', async () => {
    const cachePath = join(TEST_USER_DATA, 'plugins', 'registry-cache.json')
    mockFs.files.set(
      cachePath,
      JSON.stringify({
        url: 'https://raw.githubusercontent.com/scalpelpoe/scalpel-plugins-registry/main/registry.json',
        etag: '"abc123"',
        snapshot: validRegistry,
      }),
    )
    mockNetFetch(async () => new Response(null, { status: 304 }))
    const { fetchRegistry } = await import('./registry')
    const result = await fetchRegistry()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.snapshot.plugins[0].id).toBe('hello-world')
  })

  it('returns the cached registry when the network fetch throws', async () => {
    const cachePath = join(TEST_USER_DATA, 'plugins', 'registry-cache.json')
    mockFs.files.set(
      cachePath,
      JSON.stringify({
        url: 'https://raw.githubusercontent.com/scalpelpoe/scalpel-plugins-registry/main/registry.json',
        etag: '"abc123"',
        snapshot: validRegistry,
      }),
    )
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

  it('never reuses a cache written for a different registry URL', async () => {
    const cachePath = join(TEST_USER_DATA, 'plugins', 'registry-cache.json')
    mockFs.files.set(
      cachePath,
      JSON.stringify({ url: 'https://attacker.example/registry.json', etag: '"evil"', snapshot: validRegistry }),
    )
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

  it('keeps valid supplemental asset hashes and drops malformed asset maps', async () => {
    const withAssets = {
      ...validRegistry,
      plugins: [{ ...validRegistry.plugins[0], assets: { 'worker.exe': 'b'.repeat(64) } }],
    }
    mockNetFetch(async () => new Response(JSON.stringify(withAssets), { status: 200 }))
    const { fetchRegistry } = await import('./registry')
    const validResult = await fetchRegistry()
    expect(validResult.ok).toBe(true)
    if (validResult.ok) expect(validResult.snapshot.plugins[0].assets).toEqual({ 'worker.exe': 'b'.repeat(64) })

    const malformed = {
      ...validRegistry,
      plugins: [{ ...validRegistry.plugins[0], assets: { '../worker.exe': 'b'.repeat(64) } }],
    }
    mockNetFetch(async () => new Response(JSON.stringify(malformed), { status: 200 }))
    const malformedResult = await fetchRegistry()
    expect(malformedResult.ok).toBe(true)
    if (malformedResult.ok) expect(malformedResult.snapshot.plugins[0].assets).toBeUndefined()

    const trailingDot = {
      ...validRegistry,
      plugins: [{ ...validRegistry.plugins[0], assets: { 'plugin.js.': 'b'.repeat(64) } }],
    }
    mockNetFetch(async () => new Response(JSON.stringify(trailingDot), { status: 200 }))
    const trailingDotResult = await fetchRegistry()
    expect(trailingDotResult.ok).toBe(true)
    if (trailingDotResult.ok) expect(trailingDotResult.snapshot.plugins[0].assets).toBeUndefined()
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

describe('scalpelMinVersion gate', () => {
  const futureEntry = {
    ...validRegistry.plugins[0],
    id: 'future-plugin',
    scalpelMinVersion: '>=999.0.0',
  }
  const mixedRegistry = { schemaVersion: 1, plugins: [validRegistry.plugins[0], futureEntry] }

  it('hides entries this build cannot run', async () => {
    mockNetFetch(async () => new Response(JSON.stringify(mixedRegistry), { status: 200 }))
    const { fetchRegistry } = await import('./registry')
    const result = await fetchRegistry()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.snapshot.plugins.map((p) => p.id)).toEqual(['hello-world'])
    }
  })

  it('caches the unfiltered list so an app upgrade can reveal hidden entries', async () => {
    mockNetFetch(async () => new Response(JSON.stringify(mixedRegistry), { status: 200 }))
    const { fetchRegistry } = await import('./registry')
    await fetchRegistry()
    const cachePath = join(TEST_USER_DATA, 'plugins', 'registry-cache.json')
    const cached = JSON.parse(mockFs.files.get(cachePath)!)
    expect(cached.snapshot.plugins.map((p: { id: string }) => p.id)).toEqual(['hello-world', 'future-plugin'])
  })

  it('filters the cached snapshot on a 304 too', async () => {
    const cachePath = join(TEST_USER_DATA, 'plugins', 'registry-cache.json')
    mockFs.files.set(
      cachePath,
      JSON.stringify({
        url: 'https://raw.githubusercontent.com/scalpelpoe/scalpel-plugins-registry/main/registry.json',
        etag: '"abc123"',
        snapshot: mixedRegistry,
      }),
    )
    mockNetFetch(async () => new Response(null, { status: 304 }))
    const { fetchRegistry } = await import('./registry')
    const result = await fetchRegistry()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.snapshot.plugins.map((p) => p.id)).toEqual(['hello-world'])
    }
  })
})

describe('featured flag', () => {
  const withFeatured = (featured: unknown): unknown => ({
    ...validRegistry,
    plugins: [{ ...validRegistry.plugins[0], featured }],
  })

  it('passes through featured: true', async () => {
    mockNetFetch(async () => new Response(JSON.stringify(withFeatured(true)), { status: 200 }))
    const { fetchRegistry } = await import('./registry')
    const result = await fetchRegistry()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.snapshot.plugins[0].featured).toBe(true)
  })

  it('leaves featured undefined when absent', async () => {
    mockNetFetch(async () => new Response(JSON.stringify(validRegistry), { status: 200 }))
    const { fetchRegistry } = await import('./registry')
    const result = await fetchRegistry()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.snapshot.plugins[0].featured).toBeUndefined()
  })

  it('drops a non-boolean featured without rejecting the entry', async () => {
    mockNetFetch(async () => new Response(JSON.stringify(withFeatured('yes')), { status: 200 }))
    const { fetchRegistry } = await import('./registry')
    const result = await fetchRegistry()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.snapshot.plugins).toHaveLength(1)
      expect(result.snapshot.plugins[0].featured).toBeUndefined()
    }
  })
})
