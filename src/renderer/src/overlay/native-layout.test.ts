import { describe, expect, it, vi } from 'vitest'

const { findRelated } = vi.hoisted(() => ({ findRelated: vi.fn() }))
vi.mock('../shared/related-items', () => ({ findRelated }))

import { shouldReserveNativeSister } from './native-layout'

const priceCheckData = { item: { name: 'Some Unique' } } as never
const overlayData = {} as never

function args(overrides: Partial<Parameters<typeof shouldReserveNativeSister>[0]> = {}) {
  return {
    windowLocal: true,
    isHidden: false,
    view: 'pricecheck',
    tierSisterOpen: false,
    overlayData: null,
    priceCheckData: null,
    poeVersion: 1 as 1 | 2 | null,
    ...overrides,
  }
}

describe('shouldReserveNativeSister', () => {
  it('does not reserve space outside the regular window or while hidden', () => {
    findRelated.mockReturnValue({ query: [], items: [] })
    expect(shouldReserveNativeSister(args({ windowLocal: false, priceCheckData }))).toBe(false)
    expect(shouldReserveNativeSister(args({ isHidden: true, priceCheckData }))).toBe(false)
  })

  it('reserves space for an open tier sister on the item tab', () => {
    expect(shouldReserveNativeSister(args({ view: 'item', tierSisterOpen: true, overlayData }))).toBe(true)
    expect(shouldReserveNativeSister(args({ view: 'item', tierSisterOpen: false, overlayData }))).toBe(false)
  })

  it('reserves price-check space only when a related-items entry actually renders', () => {
    findRelated.mockReturnValue(null)
    expect(shouldReserveNativeSister(args({ priceCheckData }))).toBe(false)
    findRelated.mockReturnValue({ query: [], items: [] })
    expect(shouldReserveNativeSister(args({ priceCheckData }))).toBe(true)
    expect(findRelated).toHaveBeenCalledWith('Some Unique', 1)
  })
})
