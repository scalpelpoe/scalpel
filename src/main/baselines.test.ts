import { createHash } from 'node:crypto'
import { unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const MOCK_USER_DATA = vi.hoisted(() =>
  require('node:path').join(require('node:os').tmpdir(), `scalpel-baselines-${Date.now()}`),
)
vi.mock('electron', () => ({ app: { getPath: vi.fn(() => MOCK_USER_DATA) } }))

import { getBaselineByLocalPath, saveBaseline } from './baselines'

describe('getBaselineByLocalPath', () => {
  it('returns the content + meta for a matching local path', () => {
    const localPath = join(MOCK_USER_DATA, 'x', 'MyFilter-local.filter')
    saveBaseline('MyFilter', '#name: MyFilter\nShow\n', '/online/abc', localPath)
    const found = getBaselineByLocalPath(localPath)
    expect(found).not.toBeNull()
    expect(found?.content).toBe('#name: MyFilter\nShow\n')
    expect(found?.meta.localPath).toBe(localPath)
    expect(found?.meta.filterName).toBe('MyFilter')
  })

  it('returns null for an unknown local path', () => {
    expect(getBaselineByLocalPath(join(MOCK_USER_DATA, 'x', 'nonexistent-local.filter'))).toBeNull()
  })

  it('returns null when the matched meta has no baseline file (scan continues, finds nothing)', () => {
    const localPath = join(MOCK_USER_DATA, 'x', 'Orphan-local.filter')
    saveBaseline('Orphan', 'content', '/online/orphan', localPath)
    // Delete the .baseline file, leaving the orphaned .meta.json behind.
    const hash = createHash('md5').update('Orphan').digest('hex')
    unlinkSync(join(MOCK_USER_DATA, 'baselines', `${hash}.baseline`))
    expect(getBaselineByLocalPath(localPath)).toBeNull()
  })
})
