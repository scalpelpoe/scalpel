import { mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MOCK_USER_DATA = vi.hoisted(() =>
  require('node:path').join(require('node:os').tmpdir(), `scalpel-filter-state-${Date.now()}`),
)

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
  const PRIOR_E2E = process.env.SCALPEL_E2E
  beforeEach(() => {
    clearFilterState()
  })
  afterEach(() => {
    if (PRIOR_E2E === undefined) delete process.env.SCALPEL_E2E
    else process.env.SCALPEL_E2E = PRIOR_E2E
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

  it('auto-repairs a damaged filter on load', () => {
    delete process.env.SCALPEL_E2E
    // Block keeps a real condition (Rarity), so repair strips only the dangling
    // BaseType and leaves a valid block to inspect (rather than removing it).
    const damaged = ['#name: Dmg', 'Show', '\tRarity Normal', '\tBaseType ==', '\tSetTextColor 255 0 0 255', ''].join(
      '\n',
    )
    const path = writeFilter(damaged)
    const file = loadFilter(path)
    expect(file).not.toBeNull()
    // On-disk file was repaired.
    expect(readFileSync(path, 'utf-8')).not.toMatch(/BaseType ==/)
    // Loaded model has no empty conditions and kept the Rarity condition.
    expect(getCurrentFilter()!.blocks[0].conditions.every((c) => c.values.length > 0)).toBe(true)
    expect(getCurrentFilter()!.blocks[0].conditions.some((c) => c.type === 'Rarity')).toBe(true)
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
