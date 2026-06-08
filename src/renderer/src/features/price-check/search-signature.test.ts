import { describe, it, expect } from 'vitest'
import type { StatFilter } from './types'
import { searchSignature } from './search-signature'

function f(
  overrides: Partial<Pick<StatFilter, 'id' | 'enabled' | 'min' | 'max' | 'chipState'>>,
): Pick<StatFilter, 'id' | 'enabled' | 'min' | 'max' | 'chipState'> {
  return {
    id: 'explicit.stat_x',
    enabled: true,
    min: 10,
    max: null,
    chipState: undefined,
    ...overrides,
  }
}

const baseSettings = { listedTime: '', priceOption: 'chaos_divine', statusOption: 'available' }

describe('searchSignature', () => {
  it('produces equal strings for identical inputs', () => {
    const filters = [f({}), f({ id: 'explicit.stat_y', min: 5 })]
    expect(searchSignature(filters, baseSettings)).toBe(searchSignature(filters, baseSettings))
  })

  it('changes when a filter enabled flag is flipped', () => {
    const a = [f({ enabled: true })]
    const b = [f({ enabled: false })]
    expect(searchSignature(a, baseSettings)).not.toBe(searchSignature(b, baseSettings))
  })

  it('changes when min is edited', () => {
    const a = [f({ min: 10 })]
    const b = [f({ min: 20 })]
    expect(searchSignature(a, baseSettings)).not.toBe(searchSignature(b, baseSettings))
  })

  it('changes when max is edited', () => {
    const a = [f({ max: null })]
    const b = [f({ max: 50 })]
    expect(searchSignature(a, baseSettings)).not.toBe(searchSignature(b, baseSettings))
  })

  it('changes when chipState is changed', () => {
    const a = [f({ chipState: undefined })]
    const b = [f({ chipState: 'yes' })]
    expect(searchSignature(a, baseSettings)).not.toBe(searchSignature(b, baseSettings))
  })

  it('changes when listedTime is changed', () => {
    const filters = [f({})]
    const a = searchSignature(filters, { ...baseSettings, listedTime: '' })
    const b = searchSignature(filters, { ...baseSettings, listedTime: 'day' })
    expect(a).not.toBe(b)
  })

  it('changes when priceOption is changed', () => {
    const filters = [f({})]
    const a = searchSignature(filters, { ...baseSettings, priceOption: 'chaos_divine' })
    const b = searchSignature(filters, { ...baseSettings, priceOption: 'chaos' })
    expect(a).not.toBe(b)
  })

  it('changes when statusOption is changed', () => {
    const filters = [f({})]
    const a = searchSignature(filters, { ...baseSettings, statusOption: 'available' })
    const b = searchSignature(filters, { ...baseSettings, statusOption: 'any' })
    expect(a).not.toBe(b)
  })
})
