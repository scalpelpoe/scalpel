import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const MOCK_USER_DATA = vi.hoisted(() => `${process.env.TEMP ?? process.cwd()}\\scalpel-filter-state-${Date.now()}`)

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => MOCK_USER_DATA) },
}))

import { getIntents, record } from './filter/intent-recorder'
import { __hasKnownBaseTypeForTest } from './trade/clipboard'
import { clearFilterState, getColorFrequencies, getCurrentFilter, loadFilter } from './filter-state'

function writeFilter(content: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'scalpel-filter-')), 'test.filter')
  writeFileSync(path, content, 'utf-8')
  return path
}

const filterContent = `#name: Test Filter
Show
  BaseType "Zzz Scalpel Test Base"
  SetTextColor 255 0 0 255
`

describe('filter-state', () => {
  beforeEach(() => {
    clearFilterState()
  })

  it('clears loaded filter resources when loading an empty path', () => {
    const path = writeFilter(filterContent)
    expect(loadFilter(path)).not.toBeNull()
    expect(getCurrentFilter()).not.toBeNull()
    expect(getColorFrequencies().SetTextColor).toHaveLength(1)
    expect(__hasKnownBaseTypeForTest('Zzz Scalpel Test Base')).toBe(true)

    record({
      type: 'set-visibility',
      target: { typePath: 'currency', tier: 't1' },
      payload: { visibility: 'Hide' },
      timestamp: 1,
    })
    expect(getIntents().intents).toHaveLength(1)

    expect(loadFilter('')).toBeNull()

    expect(getCurrentFilter()).toBeNull()
    expect(getColorFrequencies()).toEqual({})
    expect(getIntents().intents).toEqual([])
    expect(__hasKnownBaseTypeForTest('Zzz Scalpel Test Base')).toBe(false)
  })

  it('clears stale filter state after a failed load', () => {
    const path = writeFilter(filterContent)
    expect(loadFilter(path)).not.toBeNull()
    expect(getCurrentFilter()?.path).toBe(path)

    expect(loadFilter(join(tmpdir(), 'missing-scalpel-filter.filter'))).toBeNull()

    expect(getCurrentFilter()).toBeNull()
    expect(getColorFrequencies()).toEqual({})
    expect(__hasKnownBaseTypeForTest('Zzz Scalpel Test Base')).toBe(false)
  })
})
