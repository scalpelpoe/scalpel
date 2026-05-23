import { beforeEach, describe, expect, it, vi } from 'vitest'

import { _resetForTests, getCurrentZone, ingestZoneEvent, onZoneChanged } from './zone-state'

describe('zone-state', () => {
  beforeEach(() => {
    _resetForTests()
  })

  it('starts with null current zone', () => {
    expect(getCurrentZone()).toBeNull()
  })

  it('stores and exposes a real-zone event', () => {
    ingestZoneEvent({ areaLevel: 68, areaCode: 'MapWorldsAtoll' })
    expect(getCurrentZone()).toEqual({ areaLevel: 68, areaCode: 'MapWorldsAtoll' })
  })

  it('stores town/hideout events verbatim', () => {
    ingestZoneEvent({ areaLevel: 68, areaCode: 'MapWorldsAtoll' })
    ingestZoneEvent({ areaLevel: 1, areaCode: 'HideoutLuxurious' })
    expect(getCurrentZone()).toEqual({ areaLevel: 1, areaCode: 'HideoutLuxurious' })
  })

  it('emits to subscribers on real zone change', () => {
    const cb = vi.fn()
    onZoneChanged(cb)
    ingestZoneEvent({ areaLevel: 68, areaCode: 'MapWorldsAtoll' })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith({ areaLevel: 68, areaCode: 'MapWorldsAtoll' })
  })

  it('emits town/hideout events verbatim to subscribers', () => {
    const cb = vi.fn()
    onZoneChanged(cb)
    ingestZoneEvent({ areaLevel: 1, areaCode: '3_town' })
    expect(cb).toHaveBeenCalledWith({ areaLevel: 1, areaCode: '3_town' })
  })

  it('unsubscribe stops further emissions', () => {
    const cb = vi.fn()
    const off = onZoneChanged(cb)
    off()
    ingestZoneEvent({ areaLevel: 68, areaCode: 'MapWorldsAtoll' })
    expect(cb).not.toHaveBeenCalled()
  })
})
