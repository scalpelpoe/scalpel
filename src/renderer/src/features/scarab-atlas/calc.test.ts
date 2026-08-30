import { describe, expect, it } from 'vitest'
import { calculateOptimalStrategy, calculatePoolEV, getEffectiveWeight } from './calc'
import type { ScarabCalcState, ScarabCatalog } from './types'

const catalog: ScarabCatalog = {
  version: 1,
  vendorCategoryOrder: ['cheap', 'rich', 'boosty'],
  categories: [
    {
      id: 'cheap',
      name: 'Cheap',
      atlasModifier: 'blockable',
      investmentBoost: true,
      scarabs: [{ id: 'c1', name: 'Cheap Scarab', weight: 1000, signature: 'Cheap', limit: null }],
    },
    {
      id: 'rich',
      name: 'Rich',
      atlasModifier: 'blockable',
      investmentBoost: true,
      scarabs: [{ id: 'r1', name: 'Rich Scarab', weight: 100, signature: 'Rich', limit: null }],
    },
    {
      id: 'boosty',
      name: 'Boosty',
      atlasModifier: 'boostable',
      investmentBoost: false,
      scarabs: [{ id: 'b1', name: 'Boosty Scarab', weight: 200, signature: 'Boosty', limit: null }],
    },
  ],
}

const state: ScarabCalcState = {
  remarkableRelics: false,
  blocked: [],
  boosted: [],
  invested: [],
  weightOverrides: {},
  priceOverrides: {},
}

const prices = {
  'Cheap Scarab': 1,
  'Rich Scarab': 50,
  'Boosty Scarab': 20,
}

describe('scarab atlas calc', () => {
  it('applies remarkable relics as weight^0.9', () => {
    const w = getEffectiveWeight(catalog.categories[0].scarabs[0], {
      ...state,
      remarkableRelics: true,
    })
    expect(w).toBeCloseTo(Math.pow(1000, 0.9), 5)
  })

  it('blocks the cheap category below pool EV', () => {
    const optimal = calculateOptimalStrategy(catalog, state, prices)
    expect(optimal.blocks).toContain('cheap')
    expect(optimal.blocks).not.toContain('rich')
    expect(optimal.ev).toBeGreaterThan(
      calculatePoolEV(catalog, state, prices, { blocks: [], boosts: [], investments: [] }),
    )
  })
})
