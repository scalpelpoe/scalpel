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
  failCopyTo: null as string | null,
  failWritePath: null as string | null,
  failWrites: 0,
}

vi.mock('fs', () => ({
  readFileSync: (p: string) => {
    const v = mockFs.files.get(p)
    if (v == null) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return v
  },
  existsSync: (p: string) => {
    if (mockFs.files.has(p) || mockFs.dirs.has(p)) return true
    for (const key of mockFs.files.keys()) {
      if (key.startsWith(`${p}/`) || key.startsWith(`${p}\\`)) return true
    }
    return false
  },
  writeFileSync: (p: string, data: string) => {
    if (mockFs.failWritePath === p && mockFs.failWrites > 0) {
      mockFs.failWrites--
      throw new Error('simulated metadata write failure')
    }
    mockFs.files.set(p, data)
  },
  copyFileSync: (from: string, to: string) => {
    if (mockFs.failCopyTo === to) throw new Error('simulated copy failure')
    const data = mockFs.files.get(from)
    if (data == null) throw new Error('source missing')
    mockFs.files.set(to, data)
    mockFs.copied.push({ from, to })
  },
  mkdirSync: (p: string) => {
    mockFs.dirs.add(p)
  },
  renameSync: (from: string, to: string) => {
    for (const key of [...mockFs.files.keys()]) {
      if (key === from || key.startsWith(`${from}/`) || key.startsWith(`${from}\\`)) {
        mockFs.files.set(to + key.slice(from.length), mockFs.files.get(key)!)
        mockFs.files.delete(key)
      }
    }
    for (const dir of [...mockFs.dirs]) {
      if (dir === from || dir.startsWith(`${from}/`) || dir.startsWith(`${from}\\`)) {
        mockFs.dirs.add(to + dir.slice(from.length))
        mockFs.dirs.delete(dir)
      }
    }
  },
  rmSync: (p: string, options?: { recursive?: boolean }) => {
    if (options?.recursive) {
      for (const key of [...mockFs.files.keys()]) {
        if (key === p || key.startsWith(`${p}/`) || key.startsWith(`${p}\\`)) mockFs.files.delete(key)
      }
      for (const dir of [...mockFs.dirs]) {
        if (dir === p || dir.startsWith(`${p}/`) || dir.startsWith(`${p}\\`)) mockFs.dirs.delete(dir)
      }
    } else {
      mockFs.files.delete(p)
      mockFs.dirs.delete(p)
    }
  },
  readdirSync: (p: string) =>
    [...mockFs.files.keys()].filter((f) => f.startsWith(`${p}/`)).map((f) => f.slice(p.length + 1)),
}))

const SRC_PLUGIN = join('/src', 'plugin')
const DIST_PLUGIN = join(SRC_PLUGIN, 'dist')

beforeEach(() => {
  mockFs.files.clear()
  mockFs.dirs.clear()
  mockFs.copied.length = 0
  mockFs.failCopyTo = null
  mockFs.failWritePath = null
  mockFs.failWrites = 0
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
  it('rejects when neither the selected directory nor its immediate dist contains the package', async () => {
    mockFs.dirs.add(SRC_PLUGIN)
    const { installUnpacked } = await import('./install-unpacked')
    const r = installUnpacked(SRC_PLUGIN)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain('manifest.json')
      expect(r.error).toContain('plugin.js')
      expect(r.error).toContain('directly')
      expect(r.error).toContain('immediate dist')
    }
  })

  it('rejects when plugin.js is missing', async () => {
    mockFs.files.set(join(SRC_PLUGIN, 'manifest.json'), validManifest)
    mockFs.dirs.add(SRC_PLUGIN)
    const { installUnpacked } = await import('./install-unpacked')
    const r = installUnpacked(SRC_PLUGIN)
    expect(r.ok).toBe(false)
  })

  it('does not recursively search below the immediate dist directory', async () => {
    const nestedPackage = join(DIST_PLUGIN, 'nested')
    mockFs.files.set(join(nestedPackage, 'manifest.json'), validManifest)
    mockFs.files.set(join(nestedPackage, 'plugin.js'), '// nested')

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

  it('uses the immediate dist package and stores that directory as its provenance', async () => {
    mockFs.files.set(join(SRC_PLUGIN, 'manifest.json'), validManifest)
    mockFs.files.set(join(DIST_PLUGIN, 'manifest.json'), validManifest)
    mockFs.files.set(join(DIST_PLUGIN, 'plugin.js'), '// built plugin')

    const { installUnpacked } = await import('./install-unpacked')
    const r = installUnpacked(SRC_PLUGIN)

    expect(r).toEqual({ ok: true, id: 'hello-world' })
    const destDir = join(TEST_USER_DATA, 'plugins', 'hello-world')
    expect(mockFs.files.get(join(destDir, 'plugin.js'))).toBe('// built plugin')
    const unpacked = JSON.parse(mockFs.files.get(join(TEST_USER_DATA, 'plugins', 'unpacked.json'))!)
    expect(unpacked).toEqual([{ id: 'hello-world', sourceDir: DIST_PLUGIN }])
  })

  it('prefers the selected directory when both it and dist contain packages', async () => {
    const distManifest = JSON.stringify({ ...JSON.parse(validManifest), id: 'dist-plugin', name: 'Dist Plugin' })
    mockFs.files.set(join(SRC_PLUGIN, 'manifest.json'), validManifest)
    mockFs.files.set(join(SRC_PLUGIN, 'plugin.js'), '// root plugin')
    mockFs.files.set(join(DIST_PLUGIN, 'manifest.json'), distManifest)
    mockFs.files.set(join(DIST_PLUGIN, 'plugin.js'), '// dist plugin')

    const { installUnpacked } = await import('./install-unpacked')
    const r = installUnpacked(SRC_PLUGIN)

    expect(r).toEqual({ ok: true, id: 'hello-world' })
    const destDir = join(TEST_USER_DATA, 'plugins', 'hello-world')
    expect(mockFs.files.get(join(destDir, 'plugin.js'))).toBe('// root plugin')
    const unpacked = JSON.parse(mockFs.files.get(join(TEST_USER_DATA, 'plugins', 'unpacked.json'))!)
    expect(unpacked).toEqual([{ id: 'hello-world', sourceDir: SRC_PLUGIN }])
  })

  it('copies a declared API contract', async () => {
    const apiManifest = JSON.stringify({
      ...JSON.parse(validManifest),
      api: { version: '1.0.0', contract: 'api.binpb', service: 'example.greeting.v1.GreetingProvider' },
    })
    mockFs.files.set(join(SRC_PLUGIN, 'manifest.json'), apiManifest)
    mockFs.files.set(join(SRC_PLUGIN, 'plugin.js'), '// stub')
    mockFs.files.set(join(SRC_PLUGIN, 'api.binpb'), 'descriptor bytes')
    mockFs.dirs.add(SRC_PLUGIN)

    const { installUnpacked } = await import('./install-unpacked')
    const r = installUnpacked(SRC_PLUGIN)

    expect(r.ok).toBe(true)
    const destDir = join(TEST_USER_DATA, 'plugins', 'hello-world')
    expect(mockFs.files.get(join(destDir, 'api.binpb'))).toBe('descriptor bytes')
  })

  it('rejects an API provider whose declared contract is missing', async () => {
    mockFs.files.set(
      join(SRC_PLUGIN, 'manifest.json'),
      JSON.stringify({
        ...JSON.parse(validManifest),
        api: { version: '1.0.0', contract: 'api.binpb', service: 'example.greeting.v1.GreetingProvider' },
      }),
    )
    mockFs.files.set(join(SRC_PLUGIN, 'plugin.js'), '// stub')
    mockFs.dirs.add(SRC_PLUGIN)

    const { installUnpacked } = await import('./install-unpacked')
    const r = installUnpacked(SRC_PLUGIN)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('api.binpb')
  })

  it('verifies and copies a declared native backend', async () => {
    const nativeBytes = 'native worker bytes'
    const nativeManifest = JSON.stringify({
      ...JSON.parse(validManifest),
      nativeBackend: {
        protocolVersion: 1,
        contract: 'backend.binpb',
        service: 'example.items.v1.ItemAnalyzer',
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
    mockFs.files.set(join(SRC_PLUGIN, 'backend.binpb'), 'descriptor bytes')
    mockFs.files.set(join(SRC_PLUGIN, 'worker.exe'), nativeBytes)
    mockFs.dirs.add(SRC_PLUGIN)

    const { installUnpacked } = await import('./install-unpacked')
    const r = installUnpacked(SRC_PLUGIN)

    expect(r.ok).toBe(true)
    const destDir = join(TEST_USER_DATA, 'plugins', 'hello-world')
    expect(mockFs.files.get(join(destDir, 'backend.binpb'))).toBe('descriptor bytes')
    expect(mockFs.files.get(join(destDir, 'worker.exe'))).toBe(nativeBytes)
  })

  it('resolves API and native backend assets from the immediate dist package', async () => {
    const nativeBytes = 'dist native worker bytes'
    const manifest = JSON.stringify({
      ...JSON.parse(validManifest),
      api: { version: '1.0.0', contract: 'api.binpb', service: 'example.greeting.v1.GreetingProvider' },
      nativeBackend: {
        protocolVersion: 1,
        contract: 'backend.binpb',
        service: 'example.items.v1.ItemAnalyzer',
        targets: {
          'win32-x64': {
            file: 'worker.exe',
            sha256: createHash('sha256').update(nativeBytes).digest('hex'),
          },
        },
      },
    })
    mockFs.files.set(join(DIST_PLUGIN, 'manifest.json'), manifest)
    mockFs.files.set(join(DIST_PLUGIN, 'plugin.js'), '// built plugin')
    mockFs.files.set(join(DIST_PLUGIN, 'api.binpb'), 'dist api contract')
    mockFs.files.set(join(DIST_PLUGIN, 'backend.binpb'), 'dist backend contract')
    mockFs.files.set(join(DIST_PLUGIN, 'worker.exe'), nativeBytes)
    mockFs.files.set(join(SRC_PLUGIN, 'api.binpb'), 'root api decoy')
    mockFs.files.set(join(SRC_PLUGIN, 'backend.binpb'), 'root backend decoy')
    mockFs.files.set(join(SRC_PLUGIN, 'worker.exe'), 'root worker decoy')

    const { installUnpacked } = await import('./install-unpacked')
    const r = installUnpacked(SRC_PLUGIN)

    expect(r.ok).toBe(true)
    const destDir = join(TEST_USER_DATA, 'plugins', 'hello-world')
    expect(mockFs.files.get(join(destDir, 'api.binpb'))).toBe('dist api contract')
    expect(mockFs.files.get(join(destDir, 'backend.binpb'))).toBe('dist backend contract')
    expect(mockFs.files.get(join(destDir, 'worker.exe'))).toBe(nativeBytes)
    expect(mockFs.copied).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: join(DIST_PLUGIN, 'api.binpb') }),
        expect.objectContaining({ from: join(DIST_PLUGIN, 'backend.binpb') }),
        expect.objectContaining({ from: join(DIST_PLUGIN, 'worker.exe') }),
      ]),
    )
  })

  it('does not resolve a dist package contract from the selected directory', async () => {
    const manifest = JSON.stringify({
      ...JSON.parse(validManifest),
      api: { version: '1.0.0', contract: 'api.binpb', service: 'example.greeting.v1.GreetingProvider' },
    })
    mockFs.files.set(join(DIST_PLUGIN, 'manifest.json'), manifest)
    mockFs.files.set(join(DIST_PLUGIN, 'plugin.js'), '// built plugin')
    mockFs.files.set(join(SRC_PLUGIN, 'api.binpb'), 'root-only contract')

    const { installUnpacked } = await import('./install-unpacked')
    const r = installUnpacked(SRC_PLUGIN)

    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('api.binpb')
  })

  it('rejects a native backend whose checksum does not match', async () => {
    mockFs.files.set(
      join(SRC_PLUGIN, 'manifest.json'),
      JSON.stringify({
        ...JSON.parse(validManifest),
        nativeBackend: {
          protocolVersion: 1,
          contract: 'backend.binpb',
          service: 'example.items.v1.ItemAnalyzer',
          targets: { 'win32-x64': { file: 'worker.exe', sha256: '0'.repeat(64) } },
        },
      }),
    )
    mockFs.files.set(join(SRC_PLUGIN, 'plugin.js'), '// stub')
    mockFs.files.set(join(SRC_PLUGIN, 'backend.binpb'), 'descriptor bytes')
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

  it('removes files left by the previous package', async () => {
    const destDir = join(TEST_USER_DATA, 'plugins', 'hello-world')
    mockFs.files.set(join(destDir, 'plugin.js'), '// old')
    mockFs.files.set(join(destDir, 'obsolete.bin'), 'obsolete')
    mockFs.files.set(join(SRC_PLUGIN, 'manifest.json'), validManifest)
    mockFs.files.set(join(SRC_PLUGIN, 'plugin.js'), '// new')

    const { installUnpacked } = await import('./install-unpacked')
    expect(installUnpacked(SRC_PLUGIN).ok).toBe(true)
    expect(mockFs.files.get(join(destDir, 'plugin.js'))).toBe('// new')
    expect(mockFs.files.has(join(destDir, 'obsolete.bin'))).toBe(false)
  })

  it('migrates legacy storage before replacing the package', async () => {
    const destDir = join(TEST_USER_DATA, 'plugins', 'hello-world')
    const legacyStorage = join(destDir, 'storage.json')
    const currentStorage = join(TEST_USER_DATA, 'plugin-storage', 'hello-world', 'storage.json')
    mockFs.files.set(join(destDir, 'plugin.js'), '// old')
    mockFs.files.set(legacyStorage, JSON.stringify({ retained: true }))
    mockFs.files.set(join(SRC_PLUGIN, 'manifest.json'), validManifest)
    mockFs.files.set(join(SRC_PLUGIN, 'plugin.js'), '// new')

    const { installUnpacked } = await import('./install-unpacked')
    expect(installUnpacked(SRC_PLUGIN).ok).toBe(true)
    expect(mockFs.files.get(currentStorage)).toBe(JSON.stringify({ retained: true }))
    expect(mockFs.files.has(legacyStorage)).toBe(false)
  })

  it('restores the old package and metadata when metadata commit fails', async () => {
    const destDir = join(TEST_USER_DATA, 'plugins', 'hello-world')
    const installedPath = join(TEST_USER_DATA, 'plugins', 'installed.json')
    const unpackedPath = join(TEST_USER_DATA, 'plugins', 'unpacked.json')
    const oldUnpacked = JSON.stringify([{ id: 'hello-world', sourceDir: '/old/location' }])
    mockFs.files.set(join(destDir, 'plugin.js'), '// old')
    mockFs.files.set(join(destDir, 'manifest.json'), JSON.stringify({ version: '0.9.0' }))
    const oldInstalled = JSON.stringify(['other-plugin'])
    mockFs.files.set(installedPath, oldInstalled)
    mockFs.files.set(unpackedPath, oldUnpacked)
    mockFs.files.set(join(SRC_PLUGIN, 'manifest.json'), validManifest)
    mockFs.files.set(join(SRC_PLUGIN, 'plugin.js'), '// new')
    mockFs.failWritePath = `${unpackedPath}.tmp`
    mockFs.failWrites = 1

    const { installUnpacked } = await import('./install-unpacked')
    expect(installUnpacked(SRC_PLUGIN).ok).toBe(false)
    expect(mockFs.files.get(join(destDir, 'plugin.js'))).toBe('// old')
    expect(mockFs.files.get(installedPath)).toBe(oldInstalled)
    expect(mockFs.files.get(unpackedPath)).toBe(oldUnpacked)
  })
})
