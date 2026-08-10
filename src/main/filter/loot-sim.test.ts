import { describe, expect, it } from 'vitest'
import type { FilterFile } from '@shared/types'
import { extractAlertFromChain, simulateLootDrops } from './loot-sim'

function filter(blocks: FilterFile['blocks']): FilterFile {
  return { path: 't.filter', blocks, rawLines: [] }
}

describe('extractAlertFromChain', () => {
  it('later alert sound wins', () => {
    const alert = extractAlertFromChain([
      {
        id: '1',
        visibility: 'Show',
        conditions: [],
        actions: [{ type: 'PlayAlertSound', values: ['1', '100'] }],
        continue: true,
        lineStart: 1,
        lineEnd: 2,
      },
      {
        id: '2',
        visibility: 'Show',
        conditions: [],
        actions: [{ type: 'PlayAlertSound', values: ['6', '300'] }],
        continue: false,
        lineStart: 3,
        lineEnd: 4,
      },
    ])
    expect(alert).toEqual({ kind: 'builtin', value: '6', volume: '300' })
  })
})

describe('simulateLootDrops', () => {
  it('marks matching Show currency as shown with label actions', () => {
    const f = filter([
      {
        id: '1',
        visibility: 'Show',
        conditions: [
          { type: 'Class', operator: '=', values: ['Stackable Currency'] },
          { type: 'BaseType', operator: '==', values: ['Divine Orb'], explicitOperator: true },
        ],
        actions: [
          { type: 'SetTextColor', values: ['255', '0', '0', '255'] },
          { type: 'SetBackgroundColor', values: ['255', '255', '255', '255'] },
          { type: 'PlayAlertSound', values: ['6', '300'] },
        ],
        continue: false,
        lineStart: 1,
        lineEnd: 6,
        tierTag: { typePath: 'currency', tier: 's' },
      },
      {
        id: '2',
        visibility: 'Hide',
        conditions: [{ type: 'Class', operator: '=', values: ['Stackable Currency'] }],
        actions: [],
        continue: false,
        lineStart: 7,
        lineEnd: 9,
      },
    ])

    const result = simulateLootDrops(
      f,
      {
        pool: [{ name: 'Divine Orb', baseType: 'Divine Orb', itemClass: 'Stackable Currency', rarity: 'Normal' }],
        count: 5,
        seed: 42,
      },
      2,
    )
    expect(result.drops).toHaveLength(5)
    expect(result.shown).toBe(5)
    expect(result.hidden).toBe(0)
    expect(result.drops[0].alert.kind).toBe('builtin')
    expect(result.drops[0].blocks?.[0].actions.some((a) => a.type === 'SetTextColor')).toBe(true)
  })
})
