import { describe, expect, it } from 'vitest'
import { groupLauncherItems, launcherCategoryForItem, layoutCategoryClusters } from './launcher-categories'
import type { LauncherItem } from './launcher'

function item(action: string, label: string): LauncherItem {
  return { action, label }
}

describe('launcherCategoryForItem', () => {
  it('maps built-ins to expected groups', () => {
    expect(launcherCategoryForItem('openSettings', 'Settings')).toBe('app')
    expect(launcherCategoryForItem('openRegex', 'Regex Tool')).toBe('devtools')
    expect(launcherCategoryForItem('toggleCheatSheets', 'Cheat Sheets')).toBe('reference')
  })

  it('infers plugin categories from id and label', () => {
    expect(launcherCategoryForItem('plugin-overlay:scalpel-strats', 'Strats — Atlas')).toBe('reference')
    expect(launcherCategoryForItem('plugin-overlay:scalpel-pob', 'PoB')).toBe('app')
    expect(launcherCategoryForItem('plugin-overlay:dps-meter', 'DPS overlay')).toBe('toggles')
  })
})

describe('groupLauncherItems', () => {
  it('orders non-empty categories reference → devtools → app → toggles', () => {
    const groups = groupLauncherItems([
      item('openSettings', 'Settings'),
      item('openRegex', 'Regex Tool'),
      item('toggleCheatSheets', 'Cheat Sheets'),
    ])
    expect(groups.map((g) => g.category)).toEqual(['reference', 'devtools', 'app'])
  })
})

describe('layoutCategoryClusters', () => {
  it('allocates angle proportional to item count with gaps', () => {
    const layouts = layoutCategoryClusters([
      { category: 'reference', count: 2 },
      { category: 'devtools', count: 1 },
    ])
    expect(layouts).toHaveLength(2)
    expect(layouts[0].itemAngles).toHaveLength(2)
    expect(layouts[1].itemAngles).toHaveLength(1)
    expect(layouts[0].end).toBeLessThan(layouts[1].start)
  })
})
