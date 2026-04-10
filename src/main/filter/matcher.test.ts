import { describe, it, expect } from 'vitest'
import { evaluateBlock, findMatchingBlocks } from './matcher'
import type { PoeItem, FilterCondition, FilterBlock, FilterFile } from '../../shared/types'

function makeItem(overrides: Partial<PoeItem> = {}): PoeItem {
  return {
    itemClass: 'Rings',
    rarity: 'Rare',
    name: 'Test Ring',
    baseType: 'Ruby Ring',
    mapTier: 0,
    itemLevel: 75,
    quality: 0,
    sockets: '',
    linkedSockets: 0,
    armour: 0,
    evasion: 0,
    energyShield: 0,
    ward: 0,
    block: 0,
    reqStr: 0,
    reqDex: 0,
    reqInt: 0,
    corrupted: false,
    identified: true,
    mirrored: false,
    synthesised: false,
    fractured: false,
    transfigured: false,
    blighted: false,
    scourged: false,
    zanaMemory: false,
    implicitCount: 0,
    gemLevel: 0,
    stackSize: 1,
    influence: [],
    explicits: [],
    implicits: [],
    enchants: [],
    imbues: [],
    ...overrides,
  }
}

function makeBlock(overrides: Partial<FilterBlock> = {}): FilterBlock {
  return {
    id: 'test-block',
    visibility: 'Show',
    conditions: [],
    actions: [],
    continue: false,
    lineStart: 1,
    lineEnd: 1,
    ...overrides,
  }
}

function makeCond(type: string, values: string[], operator: string = '='): FilterCondition {
  return { type, operator: operator as FilterCondition['operator'], values }
}

function makeFilter(blocks: FilterBlock[]): FilterFile {
  return { path: 'test.filter', blocks, rawLines: [] }
}

describe('evaluateBlock', () => {
  it('matches item by Class condition', () => {
    const block = makeBlock({ conditions: [makeCond('Class', ['Rings'])] })
    const item = makeItem()
    const result = evaluateBlock(block, item)
    expect(result.matches).toBe(true)
  })

  it('fails when Class does not match', () => {
    const block = makeBlock({ conditions: [makeCond('Class', ['Amulets'])] })
    const item = makeItem()
    const result = evaluateBlock(block, item)
    expect(result.matches).toBe(false)
  })

  it('matches item by BaseType condition', () => {
    const block = makeBlock({ conditions: [makeCond('BaseType', ['Ruby Ring'])] })
    const item = makeItem()
    const result = evaluateBlock(block, item)
    expect(result.matches).toBe(true)
  })

  it('matches BaseType with substring matching', () => {
    const block = makeBlock({ conditions: [makeCond('BaseType', ['Ruby'])] })
    const item = makeItem()
    const result = evaluateBlock(block, item)
    expect(result.matches).toBe(true)
  })

  it('matches BaseType with exact match operator ==', () => {
    const block = makeBlock({ conditions: [makeCond('BaseType', ['Ruby'], '==')] })
    const item = makeItem()
    const result = evaluateBlock(block, item)
    expect(result.matches).toBe(false) // "Ruby" !== "Ruby Ring"
  })

  it('matches item by Rarity condition', () => {
    const block = makeBlock({ conditions: [makeCond('Rarity', ['Rare'])] })
    const item = makeItem()
    const result = evaluateBlock(block, item)
    expect(result.matches).toBe(true)
  })

  it('matches Rarity with comparison operators', () => {
    const item = makeItem({ rarity: 'Rare' })

    const geBlock = makeBlock({ conditions: [makeCond('Rarity', ['Magic'], '>=')] })
    expect(evaluateBlock(geBlock, item).matches).toBe(true)

    const leBlock = makeBlock({ conditions: [makeCond('Rarity', ['Unique'], '<=')] })
    expect(evaluateBlock(leBlock, item).matches).toBe(true)

    const gtBlock = makeBlock({ conditions: [makeCond('Rarity', ['Rare'], '>')] })
    expect(evaluateBlock(gtBlock, item).matches).toBe(false)
  })

  it('matches item by ItemLevel with >= operator', () => {
    const block = makeBlock({ conditions: [makeCond('ItemLevel', ['70'], '>=')] })
    const item = makeItem({ itemLevel: 75 })
    const result = evaluateBlock(block, item)
    expect(result.matches).toBe(true)
  })

  it('fails ItemLevel with >= when item level is too low', () => {
    const block = makeBlock({ conditions: [makeCond('ItemLevel', ['80'], '>=')] })
    const item = makeItem({ itemLevel: 75 })
    const result = evaluateBlock(block, item)
    expect(result.matches).toBe(false)
  })

  it('matches ItemLevel with <= operator', () => {
    const block = makeBlock({ conditions: [makeCond('ItemLevel', ['80'], '<=')] })
    const item = makeItem({ itemLevel: 75 })
    expect(evaluateBlock(block, item).matches).toBe(true)
  })

  it('matches ItemLevel with = operator', () => {
    const block = makeBlock({ conditions: [makeCond('ItemLevel', ['75'], '=')] })
    const item = makeItem({ itemLevel: 75 })
    expect(evaluateBlock(block, item).matches).toBe(true)
  })

  it('matches item by StackSize', () => {
    const block = makeBlock({ conditions: [makeCond('StackSize', ['5'], '>=')] })
    const item = makeItem({ stackSize: 10 })
    expect(evaluateBlock(block, item).matches).toBe(true)
  })

  it('fails StackSize when below threshold', () => {
    const block = makeBlock({ conditions: [makeCond('StackSize', ['5'], '>=')] })
    const item = makeItem({ stackSize: 3 })
    expect(evaluateBlock(block, item).matches).toBe(false)
  })

  it('uses AND logic for multiple conditions', () => {
    const block = makeBlock({
      conditions: [makeCond('Class', ['Rings']), makeCond('Rarity', ['Rare']), makeCond('ItemLevel', ['70'], '>=')],
    })
    const item = makeItem({ itemClass: 'Rings', rarity: 'Rare', itemLevel: 75 })
    expect(evaluateBlock(block, item).matches).toBe(true)
  })

  it('fails when any condition in AND logic fails', () => {
    const block = makeBlock({
      conditions: [makeCond('Class', ['Rings']), makeCond('Rarity', ['Unique']), makeCond('ItemLevel', ['70'], '>=')],
    })
    const item = makeItem({ itemClass: 'Rings', rarity: 'Rare', itemLevel: 75 })
    expect(evaluateBlock(block, item).matches).toBe(false)
  })

  it('matches a block with no conditions', () => {
    const block = makeBlock({ conditions: [] })
    const item = makeItem()
    expect(evaluateBlock(block, item).matches).toBe(true)
  })

  it('reports hasUnknowns for unevaluable conditions', () => {
    const block = makeBlock({ conditions: [makeCond('DropLevel', ['50'], '>=')] })
    const item = makeItem()
    const result = evaluateBlock(block, item)
    expect(result.hasUnknowns).toBe(true)
  })
})

describe('findMatchingBlocks', () => {
  it('returns first matching block as isFirstMatch', () => {
    const blocks = [
      makeBlock({ id: 'b1', conditions: [makeCond('Rarity', ['Unique'])] }),
      makeBlock({ id: 'b2', conditions: [makeCond('Rarity', ['Rare'])] }),
      makeBlock({ id: 'b3', conditions: [makeCond('Class', ['Rings'])] }),
    ]
    const filter = makeFilter(blocks)
    const item = makeItem({ rarity: 'Rare', itemClass: 'Rings' })

    const results = findMatchingBlocks(filter, item)
    expect(results).toHaveLength(1)
    expect(results[0].blockIndex).toBe(1)
    expect(results[0].isFirstMatch).toBe(true)
  })

  it('non-matching items fall through all blocks', () => {
    const blocks = [
      makeBlock({ id: 'b1', conditions: [makeCond('Rarity', ['Unique'])] }),
      makeBlock({ id: 'b2', conditions: [makeCond('Class', ['Amulets'])] }),
    ]
    const filter = makeFilter(blocks)
    const item = makeItem({ rarity: 'Rare', itemClass: 'Rings' })

    const results = findMatchingBlocks(filter, item)
    expect(results).toHaveLength(0)
  })

  it('returns first matching block respecting Show/Hide priority order', () => {
    const blocks = [
      makeBlock({ id: 'b1', visibility: 'Hide', conditions: [makeCond('Class', ['Rings'])] }),
      makeBlock({ id: 'b2', visibility: 'Show', conditions: [makeCond('Class', ['Rings'])] }),
    ]
    const filter = makeFilter(blocks)
    const item = makeItem({ itemClass: 'Rings' })

    const results = findMatchingBlocks(filter, item)
    expect(results).toHaveLength(1)
    expect(results[0].block.visibility).toBe('Hide')
    expect(results[0].isFirstMatch).toBe(true)
  })

  it('handles Continue blocks - keeps searching after matching', () => {
    const blocks = [
      makeBlock({ id: 'b1', visibility: 'Show', continue: true, conditions: [makeCond('Class', ['Rings'])] }),
      makeBlock({ id: 'b2', visibility: 'Show', conditions: [makeCond('Class', ['Rings'])] }),
    ]
    const filter = makeFilter(blocks)
    const item = makeItem({ itemClass: 'Rings' })

    const results = findMatchingBlocks(filter, item)
    expect(results).toHaveLength(2)
    expect(results[0].isFirstMatch).toBe(false) // Continue block is not the "real" match
    expect(results[1].isFirstMatch).toBe(true)
  })
})
