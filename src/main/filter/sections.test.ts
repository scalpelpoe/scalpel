import { describe, expect, it } from 'vitest'
import type { FilterFile } from '@shared/types'
import { buildFilterSections } from './sections'

function filter(blocks: FilterFile['blocks']): FilterFile {
  return { path: 'x.filter', blocks, rawLines: [] }
}

describe('buildFilterSections', () => {
  it('groups NeverSink tiers into Currency / Emotions sections', () => {
    const sections = buildFilterSections(
      filter([
        {
          id: '1',
          visibility: 'Show',
          conditions: [{ type: 'BaseType', operator: '=', values: ['Divine Orb', 'Mirror of Kalandra'] }],
          actions: [
            { type: 'SetTextColor', values: ['255', '0', '0', '255'] },
            { type: 'SetBackgroundColor', values: ['255', '255', '255', '255'] },
            { type: 'SetBorderColor', values: ['255', '0', '0', '255'] },
          ],
          continue: false,
          lineStart: 1,
          lineEnd: 5,
          tierTag: { typePath: 'currency', tier: 's' },
        },
        {
          id: '2',
          visibility: 'Hide',
          conditions: [{ type: 'BaseType', operator: '=', values: ['Exalted Orb'] }],
          actions: [],
          continue: false,
          lineStart: 6,
          lineEnd: 8,
          tierTag: { typePath: 'currency', tier: 'd' },
        },
        {
          id: '3',
          visibility: 'Show',
          conditions: [{ type: 'BaseType', operator: '=', values: ['Diluted Liquid Fear'] }],
          actions: [],
          continue: false,
          lineStart: 9,
          lineEnd: 11,
          tierTag: { typePath: 'currency->emotions', tier: 's' },
        },
      ]),
    )

    expect(sections.map((s) => s.typePath)).toEqual(['currency', 'currency->emotions'])
    expect(sections[0].title).toBe('Currency')
    expect(sections[0].tiers.map((t) => t.tier)).toEqual(['s', 'd'])
    expect(sections[0].tiers[0].label).toBe('S tier')
    expect(sections[0].tiers[0].baseTypes).toEqual(['Divine Orb', 'Mirror of Kalandra'])
    expect(sections[0].tiers[0].previewActions.some((a) => a.type === 'SetTextColor')).toBe(true)
    expect(sections[0].shownCount).toBe(1)
    expect(sections[1].title).toBe('Emotions (Delirium)')
  })

  it('skips untagged and empty Continue decorators', () => {
    const sections = buildFilterSections(
      filter([
        {
          id: '1',
          visibility: 'Show',
          conditions: [],
          actions: [],
          continue: true,
          lineStart: 1,
          lineEnd: 2,
          tierTag: { typePath: 'decorators', tier: 'beam' },
        },
        {
          id: '2',
          visibility: 'Show',
          conditions: [{ type: 'BaseType', operator: '=', values: ['Gold'] }],
          actions: [],
          continue: false,
          lineStart: 3,
          lineEnd: 4,
        },
      ]),
    )
    expect(sections).toEqual([])
  })
})
