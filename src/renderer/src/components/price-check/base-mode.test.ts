import { describe, it, expect } from 'vitest'
import type { StatFilter } from './types'
import { BASE_DEFAULT_ITEM_CLASSES, applyBaseModeToFilters, shouldIncludeImplicitsInBase } from './base-mode'

function f(overrides: Partial<StatFilter>): StatFilter {
  return {
    id: 'explicit.stat_x',
    text: 'test mod',
    value: 10,
    min: 10,
    max: null,
    enabled: true,
    type: 'explicit',
    ...overrides,
  }
}

describe('BASE_DEFAULT_ITEM_CLASSES', () => {
  it('contains Blueprints and Contracts', () => {
    expect(BASE_DEFAULT_ITEM_CLASSES.has('Blueprints')).toBe(true)
    expect(BASE_DEFAULT_ITEM_CLASSES.has('Contracts')).toBe(true)
  })

  it('does not contain ordinary equipment classes', () => {
    expect(BASE_DEFAULT_ITEM_CLASSES.has('Rings')).toBe(false)
    expect(BASE_DEFAULT_ITEM_CLASSES.has('Body Armours')).toBe(false)
    expect(BASE_DEFAULT_ITEM_CLASSES.has('Maps')).toBe(false)
  })
})

describe('shouldIncludeImplicitsInBase', () => {
  it('includes implicits for non-uniques', () => {
    expect(shouldIncludeImplicitsInBase('Rare', false)).toBe(true)
    expect(shouldIncludeImplicitsInBase('Magic', false)).toBe(true)
    expect(shouldIncludeImplicitsInBase('Normal', false)).toBe(true)
  })

  it('excludes implicits for uncorrupted uniques', () => {
    expect(shouldIncludeImplicitsInBase('Unique', false)).toBe(false)
  })

  it('includes implicits for corrupted uniques', () => {
    expect(shouldIncludeImplicitsInBase('Unique', true)).toBe(true)
  })
})

describe('applyBaseModeToFilters', () => {
  it('enables basetype and ilvl', () => {
    const input = [
      f({ id: 'misc.basetype', type: 'misc', enabled: false }),
      f({ id: 'misc.ilvl', type: 'misc', enabled: false }),
    ]
    const result = applyBaseModeToFilters(input, 'Rare', false)
    expect(result.find((x) => x.id === 'misc.basetype')!.enabled).toBe(true)
    expect(result.find((x) => x.id === 'misc.ilvl')!.enabled).toBe(true)
  })

  it('disables explicit and pseudo filters', () => {
    const input = [
      f({ id: 'explicit.stat_life', type: 'explicit', enabled: true }),
      f({ id: 'pseudo.total_life', type: 'pseudo', enabled: true }),
    ]
    const result = applyBaseModeToFilters(input, 'Rare', false)
    expect(result.find((x) => x.id === 'explicit.stat_life')!.enabled).toBe(false)
    expect(result.find((x) => x.id === 'pseudo.total_life')!.enabled).toBe(false)
  })

  it('enables implicit/enchant for non-uniques', () => {
    const input = [
      f({ id: 'implicit.x', type: 'implicit', enabled: false }),
      f({ id: 'enchant.x', type: 'enchant', enabled: false }),
    ]
    const result = applyBaseModeToFilters(input, 'Rare', false)
    expect(result.find((x) => x.type === 'implicit')!.enabled).toBe(true)
    expect(result.find((x) => x.type === 'enchant')!.enabled).toBe(true)
  })

  it('disables implicit/enchant for uncorrupted uniques', () => {
    const input = [
      f({ id: 'implicit.x', type: 'implicit', enabled: true }),
      f({ id: 'enchant.x', type: 'enchant', enabled: true }),
    ]
    const result = applyBaseModeToFilters(input, 'Unique', false)
    expect(result.find((x) => x.type === 'implicit')!.enabled).toBe(false)
    expect(result.find((x) => x.type === 'enchant')!.enabled).toBe(false)
  })

  it('enables implicit/enchant for corrupted uniques', () => {
    const input = [f({ id: 'implicit.x', type: 'implicit', enabled: false })]
    const result = applyBaseModeToFilters(input, 'Unique', true)
    expect(result.find((x) => x.type === 'implicit')!.enabled).toBe(true)
  })

  it('enables foulborn mods on uniques', () => {
    const input = [f({ id: 'explicit.stat_x', type: 'explicit', foulborn: true, enabled: false })]
    const result = applyBaseModeToFilters(input, 'Unique', false)
    expect(result[0].enabled).toBe(true)
  })

  it('does not special-case foulborn mods on non-uniques', () => {
    // Foulborn only triggers on unique items; on rare items they'd be disabled like any explicit
    const input = [f({ id: 'explicit.stat_x', type: 'explicit', foulborn: true, enabled: true })]
    const result = applyBaseModeToFilters(input, 'Rare', false)
    expect(result[0].enabled).toBe(false)
  })

  it('preserves socket/misc/timeless/fractured/currency/heist filters as-is', () => {
    const input = [
      f({ id: 'socket.links', type: 'socket', enabled: true }),
      f({ id: 'misc.quality', type: 'misc', enabled: false }),
      f({ id: 'timeless-any', type: 'timeless', enabled: true }),
      f({ id: 'fractured.x', type: 'fractured', enabled: true }),
      f({ id: 'misc.fractured', type: 'currency', enabled: false }),
      f({ id: 'heist.heist_wings', type: 'heist', enabled: true }),
    ]
    const result = applyBaseModeToFilters(input, 'Rare', false)
    // Each filter's enabled state is unchanged
    for (let i = 0; i < input.length; i++) {
      expect(result[i].enabled).toBe(input[i].enabled)
    }
  })

  it('preserves gem chips so base search on a transfigured gem still finds transfigured gems', () => {
    const input = [
      f({ id: 'misc.gem_level', type: 'gem', enabled: true }),
      f({ id: 'misc.gem_transfigured', type: 'gem', enabled: true }),
      f({ id: 'misc.quality', type: 'gem', enabled: false }),
    ]
    const result = applyBaseModeToFilters(input, 'Gem', false)
    for (let i = 0; i < input.length; i++) {
      expect(result[i].enabled).toBe(input[i].enabled)
    }
  })

  it('disables weapon DPS and defence filters', () => {
    const input = [
      f({ id: 'weapon.pdps', type: 'weapon', enabled: true }),
      f({ id: 'defence.armour', type: 'defence', enabled: true }),
    ]
    const result = applyBaseModeToFilters(input, 'Rare', false)
    expect(result.find((x) => x.type === 'weapon')!.enabled).toBe(false)
    expect(result.find((x) => x.type === 'defence')!.enabled).toBe(false)
  })
})
