import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join as pathJoin } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const MOCK_USER_DATA = pathJoin(tmpdir(), 'scalpel-test')

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => MOCK_USER_DATA) } }))

import { app } from 'electron'

describe('cheat-sheet storage paths', () => {
  it('builds the per-category subdir under userData', async () => {
    const { categoryDir } = await import('./cheat-sheet-storage')
    expect(categoryDir('cat-abc')).toBe(pathJoin(MOCK_USER_DATA, 'cheat-sheets', 'cat-abc'))
  })

  it('builds the per-sheet file path with extension', async () => {
    const { sheetFilePath } = await import('./cheat-sheet-storage')
    expect(sheetFilePath('cat-abc', 'sheet-xyz', 'png')).toBe(
      pathJoin(MOCK_USER_DATA, 'cheat-sheets', 'cat-abc', 'sheet-xyz.png'),
    )
  })

  it('generates a unique sheet id', async () => {
    const { generateSheetId } = await import('./cheat-sheet-storage')
    const a = generateSheetId()
    const b = generateSheetId()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[a-z0-9]+$/)
  })
})

describe('cheat-sheet file IO', () => {
  let testRoot: string
  beforeEach(() => {
    testRoot = mkdtempSync(pathJoin(tmpdir(), 'cs-'))
    vi.mocked(app.getPath).mockReturnValue(testRoot)
  })

  it('saveSheetBuffer writes the file and creates the category dir', async () => {
    const { saveSheetBuffer } = await import('./cheat-sheet-storage')
    const data = Buffer.from('fake png bytes')
    const path = saveSheetBuffer('cat-1', 'sheet-1', 'png', data)
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path)).toEqual(data)
    rmSync(testRoot, { recursive: true, force: true })
  })

  it('removeSheetFile deletes the file and is idempotent', async () => {
    const { saveSheetBuffer, removeSheetFile } = await import('./cheat-sheet-storage')
    const path = saveSheetBuffer('cat-1', 'sheet-1', 'png', Buffer.from('x'))
    removeSheetFile('cat-1', 'sheet-1', 'png')
    expect(existsSync(path)).toBe(false)
    removeSheetFile('cat-1', 'sheet-1', 'png')
    rmSync(testRoot, { recursive: true, force: true })
  })
})

describe('fetchImageBuffer', () => {
  it('returns buffer + ext for a data:image/png URL', async () => {
    const { fetchImageBuffer } = await import('./cheat-sheet-storage')
    const dataUrl = `data:image/png;base64,${Buffer.from('fake').toString('base64')}`
    const result = await fetchImageBuffer(dataUrl)
    expect(result.ext).toBe('png')
    expect(result.buffer).toEqual(Buffer.from('fake'))
  })

  it('rejects non-image data URLs', async () => {
    const { fetchImageBuffer } = await import('./cheat-sheet-storage')
    await expect(fetchImageBuffer('data:text/plain;base64,YWJj')).rejects.toThrow(/isn't an image/i)
  })
})
