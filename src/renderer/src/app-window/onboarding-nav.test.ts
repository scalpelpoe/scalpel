import { describe, expect, it } from 'vitest'
import {
  backStepFromFilterFolder,
  backStepFromHotkey,
  filterStepNum,
  hasConfiguredProfile,
  nextStepAfterFilter,
  nextStepAfterOnlineSetup,
  selectedGameOrder,
  sharedStepBase,
} from './onboarding-nav'

const both = { poe1: true, poe2: true }
const onlyPoe1 = { poe1: true, poe2: false }
const onlyPoe2 = { poe1: false, poe2: true }
const noImports = { poe1: null, poe2: null }
const importedPoe1 = { poe1: 'NeverSink-local', poe2: null }
const importedPoe2 = { poe1: null, poe2: 'FilterBlast-local' }

describe('selectedGameOrder', () => {
  it('returns poe1 then poe2 when both selected', () => {
    expect(selectedGameOrder(both)).toEqual([1, 2])
  })
  it('returns just the chosen game in single-game flow', () => {
    expect(selectedGameOrder(onlyPoe1)).toEqual([1])
    expect(selectedGameOrder(onlyPoe2)).toEqual([2])
  })
})

describe('filterStepNum', () => {
  it('uses 1/2 for the only game in single-game flow', () => {
    expect(filterStepNum(onlyPoe1, 1, 'folder')).toBe(1)
    expect(filterStepNum(onlyPoe1, 1, 'filter')).toBe(2)
    expect(filterStepNum(onlyPoe2, 2, 'folder')).toBe(1)
    expect(filterStepNum(onlyPoe2, 2, 'filter')).toBe(2)
  })
  it('uses 1-4 split across both games when both selected', () => {
    expect(filterStepNum(both, 1, 'folder')).toBe(1)
    expect(filterStepNum(both, 1, 'filter')).toBe(2)
    expect(filterStepNum(both, 2, 'folder')).toBe(3)
    expect(filterStepNum(both, 2, 'filter')).toBe(4)
  })
})

describe('sharedStepBase', () => {
  it('is 4 when both games selected, 2 otherwise', () => {
    expect(sharedStepBase(both)).toBe(4)
    expect(sharedStepBase(onlyPoe1)).toBe(2)
    expect(sharedStepBase(onlyPoe2)).toBe(2)
  })
})

describe('nextStepAfterFilter', () => {
  it('routes to online-setup when an online filter was imported', () => {
    expect(nextStepAfterFilter(1, both, importedPoe1)).toBe('online-filter-setup-poe1')
    expect(nextStepAfterFilter(2, both, importedPoe2)).toBe('online-filter-setup-poe2')
  })
  it('routes to PoE2 setup after PoE1 when both games selected', () => {
    expect(nextStepAfterFilter(1, both, noImports)).toBe('filter-folder-poe2')
  })
  it('routes to hotkey after the last game', () => {
    expect(nextStepAfterFilter(2, both, noImports)).toBe('hotkey')
    expect(nextStepAfterFilter(1, onlyPoe1, noImports)).toBe('hotkey')
    expect(nextStepAfterFilter(2, onlyPoe2, noImports)).toBe('hotkey')
  })
})

describe('nextStepAfterOnlineSetup', () => {
  it('routes to PoE2 setup after PoE1 online setup when both selected', () => {
    expect(nextStepAfterOnlineSetup(1, both)).toBe('filter-folder-poe2')
  })
  it('routes to hotkey otherwise', () => {
    expect(nextStepAfterOnlineSetup(2, both)).toBe('hotkey')
    expect(nextStepAfterOnlineSetup(1, onlyPoe1)).toBe('hotkey')
  })
})

describe('backStepFromFilterFolder', () => {
  it('returns to welcome from PoE1 folder', () => {
    expect(backStepFromFilterFolder(1, both, noImports)).toBe('welcome')
    expect(backStepFromFilterFolder(1, onlyPoe1, noImports)).toBe('welcome')
  })
  it('returns to PoE1 last step from PoE2 folder when both selected', () => {
    expect(backStepFromFilterFolder(2, both, noImports)).toBe('filter-poe1')
    expect(backStepFromFilterFolder(2, both, importedPoe1)).toBe('online-filter-setup-poe1')
  })
  it('returns to welcome from PoE2 folder in PoE2-only flow', () => {
    expect(backStepFromFilterFolder(2, onlyPoe2, noImports)).toBe('welcome')
  })
})

describe('backStepFromHotkey', () => {
  it('returns to PoE2 last step when PoE2 was set up', () => {
    expect(backStepFromHotkey(both, noImports)).toBe('filter-poe2')
    expect(backStepFromHotkey(both, importedPoe2)).toBe('online-filter-setup-poe2')
  })
  it('returns to PoE1 last step in PoE1-only flow', () => {
    expect(backStepFromHotkey(onlyPoe1, noImports)).toBe('filter-poe1')
    expect(backStepFromHotkey(onlyPoe1, importedPoe1)).toBe('online-filter-setup-poe1')
  })
  it('returns to PoE2 last step in PoE2-only flow', () => {
    expect(backStepFromHotkey(onlyPoe2, noImports)).toBe('filter-poe2')
  })
})

describe('hasConfiguredProfile', () => {
  it('returns false when neither per-game filter path is set', () => {
    expect(hasConfiguredProfile({ filterPathPoe1: '', filterPathPoe2: '' })).toBe(false)
  })

  it('returns true when filterPathPoe1 is configured', () => {
    expect(hasConfiguredProfile({ filterPathPoe1: 'C:/filters/poe1.filter', filterPathPoe2: '' })).toBe(true)
  })

  it('returns true when filterPathPoe2 is configured', () => {
    expect(hasConfiguredProfile({ filterPathPoe1: '', filterPathPoe2: 'C:/filters/poe2.filter' })).toBe(true)
  })

  it('returns true when both are configured', () => {
    expect(hasConfiguredProfile({ filterPathPoe1: 'C:/poe1.filter', filterPathPoe2: 'C:/poe2.filter' })).toBe(true)
  })
})
