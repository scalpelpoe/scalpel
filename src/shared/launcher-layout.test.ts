import { describe, expect, it } from 'vitest'
import { evenRingAngles, groupedRingLayout, twoTierChildSlots } from './launcher-layout'
import { normalizeLauncherStyle } from './launcher'
import type { LauncherItem } from './launcher'

function item(action: string, category?: LauncherItem['category']): LauncherItem {
  return { action, label: action, category }
}

describe('normalizeLauncherStyle', () => {
  it('maps legacy fan to hub', () => {
    expect(normalizeLauncherStyle('fan')).toBe('hub')
  })
})

describe('evenRingAngles', () => {
  it('spaces items evenly on a full ring', () => {
    const angles = evenRingAngles(4)
    const step = angles[1] - angles[0]
    expect(angles[2] - angles[1]).toBeCloseTo(step, 5)
  })
})

describe('groupedRingLayout', () => {
  it('tiles wedges without gaps between adjacent categories', () => {
    const all = [item('a', 'reference'), item('b', 'reference'), item('c', 'devtools'), item('d', 'app')]
    const { wedges } = groupedRingLayout(all)
    expect(wedges[0].end).toBeCloseTo(wedges[1].start, 5)
    expect(wedges[1].end).toBeCloseTo(wedges[2].start, 5)
  })
})

describe('twoTierChildSlots', () => {
  it('expands a category on its own even ring', () => {
    const all = Array.from({ length: 14 }, (_, i) =>
      item(`tool-${i}`, i < 6 ? 'reference' : i < 10 ? 'devtools' : i < 11 ? 'app' : 'toggles'),
    )
    const expanded = twoTierChildSlots(all, 'reference', { x: 200, y: 200 })
    expect(expanded).toHaveLength(6)
    const angles = evenRingAngles(6)
    for (let i = 0; i < 6; i++) {
      expect(expanded[i].angle).toBeCloseTo(angles[i], 5)
    }
  })
})
