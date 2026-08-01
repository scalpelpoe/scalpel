import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  writeFileSync: (p: string, data: string) => {
    mockFs.files.set(p, data)
  },
  mkdirSync: () => {},
}))

beforeEach(() => {
  mockFs.files.clear()
  vi.resetModules()
})

const unpackedPath = join(TEST_USER_DATA, 'plugins', 'unpacked.json')

function readMockJson(path: string): unknown {
  const value = mockFs.files.get(path)
  if (value == null) throw new Error(`Expected mock file to exist: ${path}`)
  return JSON.parse(value)
}

describe('readUnpackedIds', () => {
  it('returns [] when file does not exist', async () => {
    const { readUnpackedIds } = await import('./unpacked-list')
    expect(readUnpackedIds()).toEqual([])
  })

  it('returns [] when file is unparseable', async () => {
    mockFs.files.set(unpackedPath, 'not json')
    const { readUnpackedIds } = await import('./unpacked-list')
    expect(readUnpackedIds()).toEqual([])
  })

  it('returns [] when file is not an array', async () => {
    mockFs.files.set(unpackedPath, JSON.stringify({ foo: 'bar' }))
    const { readUnpackedIds } = await import('./unpacked-list')
    expect(readUnpackedIds()).toEqual([])
  })

  it('returns ids from a valid array', async () => {
    mockFs.files.set(unpackedPath, JSON.stringify(['alpha', 'beta']))
    const { readUnpackedIds } = await import('./unpacked-list')
    expect(readUnpackedIds()).toEqual(['alpha', 'beta'])
  })

  it('filters out non-string entries', async () => {
    mockFs.files.set(unpackedPath, JSON.stringify(['alpha', 42, null, 'beta']))
    const { readUnpackedIds } = await import('./unpacked-list')
    expect(readUnpackedIds()).toEqual(['alpha', 'beta'])
  })
})

describe('addUnpackedId', () => {
  it('appends an id when not present and returns true', async () => {
    const { addUnpackedId } = await import('./unpacked-list')
    const changed = addUnpackedId('my-plugin')
    expect(changed).toBe(true)
    expect(readMockJson(unpackedPath)).toEqual(['my-plugin'])
  })

  it('does not duplicate an id and returns false', async () => {
    mockFs.files.set(unpackedPath, JSON.stringify(['my-plugin']))
    const { addUnpackedId } = await import('./unpacked-list')
    const changed = addUnpackedId('my-plugin')
    expect(changed).toBe(false)
    expect(readMockJson(unpackedPath)).toEqual(['my-plugin'])
  })
})

describe('readUnpackedEntries', () => {
  it('reads a legacy string array as entries without a source dir', async () => {
    mockFs.files.set(unpackedPath, JSON.stringify(['alpha', 'beta']))
    const { readUnpackedEntries } = await import('./unpacked-list')
    expect(readUnpackedEntries()).toEqual([{ id: 'alpha' }, { id: 'beta' }])
  })

  it('reads object entries with their source dir', async () => {
    mockFs.files.set(unpackedPath, JSON.stringify([{ id: 'alpha', sourceDir: '/src/alpha' }, 'beta']))
    const { readUnpackedEntries } = await import('./unpacked-list')
    expect(readUnpackedEntries()).toEqual([{ id: 'alpha', sourceDir: '/src/alpha' }, { id: 'beta' }])
  })

  it('filters malformed entries', async () => {
    mockFs.files.set(unpackedPath, JSON.stringify([42, null, { sourceDir: '/src/x' }, { id: 7 }, 'beta']))
    const { readUnpackedEntries } = await import('./unpacked-list')
    expect(readUnpackedEntries()).toEqual([{ id: 'beta' }])
  })
})

describe('readUnpackedIds with object entries', () => {
  it('still returns plain ids', async () => {
    mockFs.files.set(unpackedPath, JSON.stringify([{ id: 'alpha', sourceDir: '/src/alpha' }, 'beta']))
    const { readUnpackedIds } = await import('./unpacked-list')
    expect(readUnpackedIds()).toEqual(['alpha', 'beta'])
  })
})

describe('addUnpackedId with a source dir', () => {
  it('records the source dir alongside the id', async () => {
    const { addUnpackedId } = await import('./unpacked-list')
    expect(addUnpackedId('my-plugin', '/src/my-plugin')).toBe(true)
    expect(readMockJson(unpackedPath)).toEqual([{ id: 'my-plugin', sourceDir: '/src/my-plugin' }])
  })

  it('updates the source dir of an id loaded from a different directory', async () => {
    mockFs.files.set(unpackedPath, JSON.stringify([{ id: 'my-plugin', sourceDir: '/old' }]))
    const { addUnpackedId } = await import('./unpacked-list')
    expect(addUnpackedId('my-plugin', '/new')).toBe(true)
    expect(readMockJson(unpackedPath)).toEqual([{ id: 'my-plugin', sourceDir: '/new' }])
  })

  it('upgrades a legacy string entry in place', async () => {
    mockFs.files.set(unpackedPath, JSON.stringify(['my-plugin']))
    const { addUnpackedId } = await import('./unpacked-list')
    expect(addUnpackedId('my-plugin', '/src/my-plugin')).toBe(true)
    expect(readMockJson(unpackedPath)).toEqual([{ id: 'my-plugin', sourceDir: '/src/my-plugin' }])
  })

  it('returns false when nothing changed', async () => {
    mockFs.files.set(unpackedPath, JSON.stringify([{ id: 'my-plugin', sourceDir: '/src/my-plugin' }]))
    const { addUnpackedId } = await import('./unpacked-list')
    expect(addUnpackedId('my-plugin', '/src/my-plugin')).toBe(false)
  })

  it('keeps a known source dir when re-added without one', async () => {
    mockFs.files.set(unpackedPath, JSON.stringify([{ id: 'my-plugin', sourceDir: '/src/my-plugin' }]))
    const { addUnpackedId } = await import('./unpacked-list')
    expect(addUnpackedId('my-plugin')).toBe(false)
    expect(readMockJson(unpackedPath)).toEqual([{ id: 'my-plugin', sourceDir: '/src/my-plugin' }])
  })
})

describe('getUnpackedSourceDir', () => {
  it('returns the recorded source dir', async () => {
    mockFs.files.set(unpackedPath, JSON.stringify([{ id: 'alpha', sourceDir: '/src/alpha' }]))
    const { getUnpackedSourceDir } = await import('./unpacked-list')
    expect(getUnpackedSourceDir('alpha')).toBe('/src/alpha')
  })

  it('returns null for a legacy entry with no source dir', async () => {
    mockFs.files.set(unpackedPath, JSON.stringify(['alpha']))
    const { getUnpackedSourceDir } = await import('./unpacked-list')
    expect(getUnpackedSourceDir('alpha')).toBeNull()
  })

  it('returns null for an unknown id', async () => {
    const { getUnpackedSourceDir } = await import('./unpacked-list')
    expect(getUnpackedSourceDir('nope')).toBeNull()
  })
})

describe('removeUnpackedId', () => {
  it('removes an id and returns true', async () => {
    mockFs.files.set(unpackedPath, JSON.stringify(['alpha', 'beta']))
    const { removeUnpackedId } = await import('./unpacked-list')
    const changed = removeUnpackedId('alpha')
    expect(changed).toBe(true)
    expect(readMockJson(unpackedPath)).toEqual(['beta'])
  })

  it('removes an object entry', async () => {
    mockFs.files.set(unpackedPath, JSON.stringify([{ id: 'alpha', sourceDir: '/src/alpha' }, 'beta']))
    const { removeUnpackedId } = await import('./unpacked-list')
    expect(removeUnpackedId('alpha')).toBe(true)
    expect(readMockJson(unpackedPath)).toEqual(['beta'])
  })

  it('returns false when id is not present', async () => {
    mockFs.files.set(unpackedPath, JSON.stringify(['beta']))
    const { removeUnpackedId } = await import('./unpacked-list')
    const changed = removeUnpackedId('alpha')
    expect(changed).toBe(false)
  })
})
