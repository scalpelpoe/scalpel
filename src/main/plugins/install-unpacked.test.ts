import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_USER_DATA = '/test/userData'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => TEST_USER_DATA) },
}))

const mockFs = {
  files: new Map<string, string>(),
  dirs: new Set<string>(),
  copied: [] as Array<{ from: string; to: string }>,
}

vi.mock('fs', () => ({
  readFileSync: (p: string) => {
    const v = mockFs.files.get(p)
    if (v == null) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return v
  },
  existsSync: (p: string) => mockFs.files.has(p) || mockFs.dirs.has(p),
  writeFileSync: (p: string, data: string) => {
    mockFs.files.set(p, data)
  },
  copyFileSync: (from: string, to: string) => {
    const data = mockFs.files.get(from)
    if (data == null) throw new Error('source missing')
    mockFs.files.set(to, data)
    mockFs.copied.push({ from, to })
  },
  mkdirSync: (p: string) => {
    mockFs.dirs.add(p)
  },
  rmSync: () => {},
  readdirSync: (p: string) =>
    [...mockFs.files.keys()].filter((f) => f.startsWith(`${p}/`)).map((f) => f.slice(p.length + 1)),
}))

const SRC_PLUGIN = join('/src', 'plugin')

beforeEach(() => {
  mockFs.files.clear()
  mockFs.dirs.clear()
  mockFs.copied.length = 0
  vi.resetModules()
})

const validManifest = JSON.stringify({
  manifestVersion: 1,
  id: 'hello-world',
  version: '1.0.0',
  name: 'Hello World',
  description: 'd',
  author: 'a',
  scalpelMinVersion: '>=0.0.0',
})

describe('installUnpacked', () => {
  it('rejects when manifest.json is missing', async () => {
    mockFs.dirs.add(SRC_PLUGIN)
    const { installUnpacked } = await import('./install-unpacked')
    const r = installUnpacked(SRC_PLUGIN)
    expect(r.ok).toBe(false)
  })

  it('rejects when plugin.js is missing', async () => {
    mockFs.files.set(join(SRC_PLUGIN, 'manifest.json'), validManifest)
    mockFs.dirs.add(SRC_PLUGIN)
    const { installUnpacked } = await import('./install-unpacked')
    const r = installUnpacked(SRC_PLUGIN)
    expect(r.ok).toBe(false)
  })

  it('rejects when manifest fails validation', async () => {
    mockFs.files.set(join(SRC_PLUGIN, 'manifest.json'), JSON.stringify({ manifestVersion: 99 }))
    mockFs.files.set(join(SRC_PLUGIN, 'plugin.js'), '// stub')
    mockFs.dirs.add(SRC_PLUGIN)
    const { installUnpacked } = await import('./install-unpacked')
    const r = installUnpacked(SRC_PLUGIN)
    expect(r.ok).toBe(false)
  })

  it('copies manifest + plugin.js to userData/plugins/<id>/', async () => {
    mockFs.files.set(join(SRC_PLUGIN, 'manifest.json'), validManifest)
    mockFs.files.set(join(SRC_PLUGIN, 'plugin.js'), '// stub')
    mockFs.dirs.add(SRC_PLUGIN)
    const { installUnpacked } = await import('./install-unpacked')
    const r = installUnpacked(SRC_PLUGIN)
    expect(r.ok).toBe(true)
    const destDir = join(TEST_USER_DATA, 'plugins', 'hello-world')
    expect(mockFs.files.has(join(destDir, 'manifest.json'))).toBe(true)
    expect(mockFs.files.has(join(destDir, 'plugin.js'))).toBe(true)
  })

  it('copies a declared API contract', async () => {
    const apiManifest = JSON.stringify({
      ...JSON.parse(validManifest),
      api: { version: '1.0.0', contract: 'api.openrpc.json' },
    })
    mockFs.files.set(join(SRC_PLUGIN, 'manifest.json'), apiManifest)
    mockFs.files.set(join(SRC_PLUGIN, 'plugin.js'), '// stub')
    mockFs.files.set(join(SRC_PLUGIN, 'api.openrpc.json'), '{"openrpc":"1.4.0"}')
    mockFs.dirs.add(SRC_PLUGIN)

    const { installUnpacked } = await import('./install-unpacked')
    const r = installUnpacked(SRC_PLUGIN)

    expect(r.ok).toBe(true)
    const destDir = join(TEST_USER_DATA, 'plugins', 'hello-world')
    expect(mockFs.files.get(join(destDir, 'api.openrpc.json'))).toBe('{"openrpc":"1.4.0"}')
  })

  it('rejects an API provider whose declared contract is missing', async () => {
    mockFs.files.set(
      join(SRC_PLUGIN, 'manifest.json'),
      JSON.stringify({
        ...JSON.parse(validManifest),
        api: { version: '1.0.0', contract: 'api.openrpc.json' },
      }),
    )
    mockFs.files.set(join(SRC_PLUGIN, 'plugin.js'), '// stub')
    mockFs.dirs.add(SRC_PLUGIN)

    const { installUnpacked } = await import('./install-unpacked')
    const r = installUnpacked(SRC_PLUGIN)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('api.openrpc.json')
  })

  it('verifies and copies a declared native backend', async () => {
    const nativeBytes = 'native worker bytes'
    const nativeManifest = JSON.stringify({
      ...JSON.parse(validManifest),
      nativeBackend: {
        protocolVersion: 1,
        contract: 'backend.openrpc.json',
        targets: {
          'win32-x64': {
            file: 'worker.exe',
            sha256: createHash('sha256').update(nativeBytes).digest('hex'),
          },
        },
      },
    })
    mockFs.files.set(join(SRC_PLUGIN, 'manifest.json'), nativeManifest)
    mockFs.files.set(join(SRC_PLUGIN, 'plugin.js'), '// stub')
    mockFs.files.set(join(SRC_PLUGIN, 'backend.openrpc.json'), '{}')
    mockFs.files.set(join(SRC_PLUGIN, 'worker.exe'), nativeBytes)
    mockFs.dirs.add(SRC_PLUGIN)

    const { installUnpacked } = await import('./install-unpacked')
    const r = installUnpacked(SRC_PLUGIN)

    expect(r.ok).toBe(true)
    const destDir = join(TEST_USER_DATA, 'plugins', 'hello-world')
    expect(mockFs.files.get(join(destDir, 'backend.openrpc.json'))).toBe('{}')
    expect(mockFs.files.get(join(destDir, 'worker.exe'))).toBe(nativeBytes)
  })

  it('rejects a native backend whose checksum does not match', async () => {
    mockFs.files.set(
      join(SRC_PLUGIN, 'manifest.json'),
      JSON.stringify({
        ...JSON.parse(validManifest),
        nativeBackend: {
          protocolVersion: 1,
          contract: 'backend.openrpc.json',
          targets: { 'win32-x64': { file: 'worker.exe', sha256: '0'.repeat(64) } },
        },
      }),
    )
    mockFs.files.set(join(SRC_PLUGIN, 'plugin.js'), '// stub')
    mockFs.files.set(join(SRC_PLUGIN, 'backend.openrpc.json'), '{}')
    mockFs.files.set(join(SRC_PLUGIN, 'worker.exe'), 'tampered')
    mockFs.dirs.add(SRC_PLUGIN)

    const { installUnpacked } = await import('./install-unpacked')
    const r = installUnpacked(SRC_PLUGIN)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('checksum mismatch')
  })

  it('appends id to installed.json when new', async () => {
    mockFs.files.set(join(SRC_PLUGIN, 'manifest.json'), validManifest)
    mockFs.files.set(join(SRC_PLUGIN, 'plugin.js'), '// stub')
    mockFs.dirs.add(SRC_PLUGIN)
    const { installUnpacked } = await import('./install-unpacked')
    installUnpacked(SRC_PLUGIN)
    const installed = JSON.parse(mockFs.files.get(join(TEST_USER_DATA, 'plugins', 'installed.json'))!)
    expect(installed).toEqual(['hello-world'])
  })

  it('does not duplicate id when already installed', async () => {
    mockFs.files.set(join(TEST_USER_DATA, 'plugins', 'installed.json'), JSON.stringify(['hello-world']))
    mockFs.files.set(join(SRC_PLUGIN, 'manifest.json'), validManifest)
    mockFs.files.set(join(SRC_PLUGIN, 'plugin.js'), '// stub')
    mockFs.dirs.add(SRC_PLUGIN)
    const { installUnpacked } = await import('./install-unpacked')
    installUnpacked(SRC_PLUGIN)
    const installed = JSON.parse(mockFs.files.get(join(TEST_USER_DATA, 'plugins', 'installed.json'))!)
    expect(installed).toEqual(['hello-world'])
  })

  it('marks id in unpacked.json on install, with the directory it came from', async () => {
    mockFs.files.set(join(SRC_PLUGIN, 'manifest.json'), validManifest)
    mockFs.files.set(join(SRC_PLUGIN, 'plugin.js'), '// stub')
    mockFs.dirs.add(SRC_PLUGIN)
    const { installUnpacked } = await import('./install-unpacked')
    installUnpacked(SRC_PLUGIN)
    const unpacked = JSON.parse(mockFs.files.get(join(TEST_USER_DATA, 'plugins', 'unpacked.json'))!)
    expect(unpacked).toEqual([{ id: 'hello-world', sourceDir: SRC_PLUGIN }])
  })

  it('re-points an existing entry at the directory it was last loaded from', async () => {
    mockFs.files.set(
      join(TEST_USER_DATA, 'plugins', 'unpacked.json'),
      JSON.stringify([{ id: 'hello-world', sourceDir: '/old/location' }]),
    )
    mockFs.files.set(join(SRC_PLUGIN, 'manifest.json'), validManifest)
    mockFs.files.set(join(SRC_PLUGIN, 'plugin.js'), '// stub')
    mockFs.dirs.add(SRC_PLUGIN)
    const { installUnpacked } = await import('./install-unpacked')
    installUnpacked(SRC_PLUGIN)
    const unpacked = JSON.parse(mockFs.files.get(join(TEST_USER_DATA, 'plugins', 'unpacked.json'))!)
    expect(unpacked).toEqual([{ id: 'hello-world', sourceDir: SRC_PLUGIN }])
  })
})
