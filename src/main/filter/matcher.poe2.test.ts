import { describe, expect, it } from 'vitest'
import type { FilterCondition, PoeItem } from '../../shared/types'
import { evaluatePoe2Condition } from './matcher.poe2'

function makeItem(overrides: Partial<PoeItem> = {}): PoeItem {
  return {
    itemClass: 'Rings',
    rarity: 'Rare',
    name: '',
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
  } as PoeItem
}

function cond(type: string, values: string[], operator: FilterCondition['operator'] = '='): FilterCondition {
  return { type, operator, values }
}

describe('evaluatePoe2Condition', () => {
  it('returns "unknown" for unknown condition types so the engine doesn\'t poison or auto-pass blocks', () => {
    expect(evaluatePoe2Condition(cond('SomeRandomCondition', ['True']), makeItem())).toBe('unknown')
  })

  it('evaluates HasVaalUniqueMod definitively from item.hasVaalUniqueMod', () => {
    expect(evaluatePoe2Condition(cond('HasVaalUniqueMod', ['True']), makeItem())).toBe('fail')
    expect(evaluatePoe2Condition(cond('HasVaalUniqueMod', ['False']), makeItem())).toBe('pass')
    const v = makeItem({ hasVaalUniqueMod: true })
    expect(evaluatePoe2Condition(cond('HasVaalUniqueMod', ['True']), v)).toBe('pass')
    expect(evaluatePoe2Condition(cond('HasVaalUniqueMod', ['False']), v)).toBe('fail')
  })

  it('evaluates IsVaalUnique as (rarity Unique AND has a vaal unique mod)', () => {
    // Reported scenario: a normal/uncorrupted item must FAIL IsVaalUnique True.
    expect(evaluatePoe2Condition(cond('IsVaalUnique', ['True']), makeItem())).toBe('fail')
    expect(evaluatePoe2Condition(cond('IsVaalUnique', ['False']), makeItem())).toBe('pass')
    // Unique but no vaal mod -> not a vaal unique.
    const uniqueNoVaal = makeItem({ rarity: 'Unique' })
    expect(evaluatePoe2Condition(cond('IsVaalUnique', ['True']), uniqueNoVaal)).toBe('fail')
    // Vaal mod but not Unique rarity -> not a vaal unique.
    const rareWithVaal = makeItem({ rarity: 'Rare', hasVaalUniqueMod: true })
    expect(evaluatePoe2Condition(cond('IsVaalUnique', ['True']), rareWithVaal)).toBe('fail')
    // Unique + vaal mod -> vaal unique.
    const vaalUnique = makeItem({ rarity: 'Unique', hasVaalUniqueMod: true })
    expect(evaluatePoe2Condition(cond('IsVaalUnique', ['True']), vaalUnique)).toBe('pass')
    expect(evaluatePoe2Condition(cond('IsVaalUnique', ['False']), vaalUnique)).toBe('fail')
  })

  it('evaluates TwiceCorrupted definitively from item.twiceCorrupted', () => {
    // Uncorrupted item (the reported Headhunter scenario): a TwiceCorrupted True
    // rule must FAIL so the twice-corrupted block does not match it.
    expect(evaluatePoe2Condition(cond('TwiceCorrupted', ['True']), makeItem())).toBe('fail')
    expect(evaluatePoe2Condition(cond('TwiceCorrupted', ['False']), makeItem())).toBe('pass')
    const tc = makeItem({ twiceCorrupted: true })
    expect(evaluatePoe2Condition(cond('TwiceCorrupted', ['True']), tc)).toBe('pass')
    expect(evaluatePoe2Condition(cond('TwiceCorrupted', ['False']), tc)).toBe('fail')
  })

  describe('UnidentifiedItemTier', () => {
    it('returns "unknown" when the field isn\'t populated', () => {
      expect(evaluatePoe2Condition(cond('UnidentifiedItemTier', ['1'], '>='), makeItem())).toBe('unknown')
    })

    it('compares numerically when the field is set', () => {
      const item = makeItem({ unidentifiedItemTier: 3 })
      expect(evaluatePoe2Condition(cond('UnidentifiedItemTier', ['2'], '>='), item)).toBe('pass')
      expect(evaluatePoe2Condition(cond('UnidentifiedItemTier', ['5'], '>='), item)).toBe('fail')
      expect(evaluatePoe2Condition(cond('UnidentifiedItemTier', ['3'], '='), item)).toBe('pass')
    })
  })
})
