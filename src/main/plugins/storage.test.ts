import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_USER_DATA = '/test/userData'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => TEST_USER_DATA) },
}))

const mockFs = {
  files: new Map<string, string>(),
  writes: [] as Array<{ path: string; data: string }>,
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
    mockFs.writes.push({ path: p, data })
  },
  mkdirSync: () => {},
}))

beforeEach(() => {
  mockFs.files.clear()
  mockFs.writes.length = 0
  vi.useFakeTimers()
  vi.resetModules()
})

afterEach(() => {
  vi.useRealTimers()
})

const storagePath = join(TEST_USER_DATA, 'plugins', 'p1', 'storage.json')

describe('plugin storage', () => {
  it('returns null when key is missing and file does not exist', async () => {
    const { getValue } = await import('./storage')
    expect(getValue('p1', 'k')).toBeNull()
  })

  it('round-trips a value through set + get', async () => {
    const { setValue, getValue, flushAll } = await import('./storage')
    setValue('p1', 'k', { a: 1 })
    flushAll()
    expect(getValue('p1', 'k')).toEqual({ a: 1 })
  })

  it('debounces writes', async () => {
    const { setValue, flushAll } = await import('./storage')
    setValue('p1', 'a', 1)
    setValue('p1', 'b', 2)
    setValue('p1', 'c', 3)
    expect(mockFs.writes.length).toBe(0)
    vi.advanceTimersByTime(150)
    expect(mockFs.writes.length).toBe(1)
    flushAll()
    expect(mockFs.writes.length).toBe(1)
  })

  it('deleteValue removes the key', async () => {
    const { setValue, deleteValue, getValue, flushAll } = await import('./storage')
    setValue('p1', 'k', 1)
    flushAll()
    deleteValue('p1', 'k')
    flushAll()
    expect(getValue('p1', 'k')).toBeNull()
  })

  it('keys returns all keys for a plugin', async () => {
    const { setValue, listKeys, flushAll } = await import('./storage')
    setValue('p1', 'a', 1)
    setValue('p1', 'b', 2)
    flushAll()
    expect(listKeys('p1').sort()).toEqual(['a', 'b'])
  })

  it('different plugins have isolated stores', async () => {
    const { setValue, getValue, flushAll } = await import('./storage')
    setValue('p1', 'k', 'one')
    setValue('p2', 'k', 'two')
    flushAll()
    expect(getValue('p1', 'k')).toBe('one')
    expect(getValue('p2', 'k')).toBe('two')
  })

  it('rejects setValue when serialized size exceeds 5MB', async () => {
    const { setValue } = await import('./storage')
    const big = 'x'.repeat(6 * 1024 * 1024)
    expect(() => setValue('p1', 'k', big)).toThrow(/size/i)
  })

  it('writes go to the per-plugin storage file', async () => {
    const { setValue, flushAll } = await import('./storage')
    setValue('p1', 'k', 1)
    flushAll()
    expect(mockFs.writes[0].path).toBe(storagePath)
  })
})
