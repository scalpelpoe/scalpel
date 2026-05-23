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

const installedPath = join(TEST_USER_DATA, 'plugins', 'installed.json')

function readMockJson(path: string): unknown {
  const value = mockFs.files.get(path)
  if (value == null) throw new Error(`Expected mock file to exist: ${path}`)
  return JSON.parse(value)
}

describe('readInstalledIds', () => {
  it('returns [] when file does not exist', async () => {
    const { readInstalledIds } = await import('./installed-list')
    expect(readInstalledIds()).toEqual([])
  })

  it('returns [] when file is unparseable', async () => {
    mockFs.files.set(installedPath, 'not json')
    const { readInstalledIds } = await import('./installed-list')
    expect(readInstalledIds()).toEqual([])
  })

  it('returns [] when file is not an array', async () => {
    mockFs.files.set(installedPath, JSON.stringify({ foo: 'bar' }))
    const { readInstalledIds } = await import('./installed-list')
    expect(readInstalledIds()).toEqual([])
  })

  it('returns ids from a valid array', async () => {
    mockFs.files.set(installedPath, JSON.stringify(['alpha', 'beta']))
    const { readInstalledIds } = await import('./installed-list')
    expect(readInstalledIds()).toEqual(['alpha', 'beta'])
  })

  it('filters out non-string entries', async () => {
    mockFs.files.set(installedPath, JSON.stringify(['alpha', 42, null, 'beta']))
    const { readInstalledIds } = await import('./installed-list')
    expect(readInstalledIds()).toEqual(['alpha', 'beta'])
  })
})

describe('addInstalledId', () => {
  it('appends an id when not present and returns true', async () => {
    const { addInstalledId } = await import('./installed-list')
    const changed = addInstalledId('my-plugin')
    expect(changed).toBe(true)
    expect(readMockJson(installedPath)).toEqual(['my-plugin'])
  })

  it('does not duplicate an id and returns false', async () => {
    mockFs.files.set(installedPath, JSON.stringify(['my-plugin']))
    const { addInstalledId } = await import('./installed-list')
    const changed = addInstalledId('my-plugin')
    expect(changed).toBe(false)
    expect(readMockJson(installedPath)).toEqual(['my-plugin'])
  })
})

describe('removeInstalledId', () => {
  it('removes an id and returns true', async () => {
    mockFs.files.set(installedPath, JSON.stringify(['alpha', 'beta']))
    const { removeInstalledId } = await import('./installed-list')
    const changed = removeInstalledId('alpha')
    expect(changed).toBe(true)
    expect(readMockJson(installedPath)).toEqual(['beta'])
  })

  it('returns false when id is not present', async () => {
    mockFs.files.set(installedPath, JSON.stringify(['beta']))
    const { removeInstalledId } = await import('./installed-list')
    const changed = removeInstalledId('alpha')
    expect(changed).toBe(false)
  })
})
