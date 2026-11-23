import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ screen: { dipToScreenPoint: (p: { x: number; y: number }) => p } }))
vi.mock('koffi', () => ({ default: { load: () => ({ func: () => () => true }) } }))

import { warpWith } from './windows-pointer'

describe('warpWith', () => {
  it('converts DIP to physical then sets, rounding to ints', () => {
    const set = vi.fn()
    warpWith({ x: 10.2, y: 20.7 }, { dipToScreen: (p) => ({ x: p.x * 1.5, y: p.y * 1.5 }), set })
    expect(set).toHaveBeenCalledWith(15, 31)
  })
})
