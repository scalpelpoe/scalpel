import { describe, expect, it } from 'vitest'
import { SCRYING_ORB_AREAS, SCRYING_ORB_DISCRIMINATOR } from './scrying-orbs'

describe('SCRYING_ORB_AREAS', () => {
  it('covers all 131 map areas the trade API indexes (3.30 atlas)', () => {
    expect(Object.keys(SCRYING_ORB_AREAS)).toHaveLength(131)
  })

  it('maps an area to its opaque trade option id', () => {
    expect(SCRYING_ORB_AREAS.Dunes).toBe('53116')
    expect(SCRYING_ORB_AREAS.Strand).toBe('10021')
    expect(SCRYING_ORB_AREAS['Sunken City']).toBe('11215')
  })

  it('keys multi-word areas exactly as the clipboard prints them', () => {
    expect(SCRYING_ORB_AREAS['Primordial Blocks']).toBe('15595')
    expect(SCRYING_ORB_AREAS['Haunted Mansion']).toBe('1215')
    expect(SCRYING_ORB_AREAS['Vaal Pyramid']).toBe('28018')
  })

  it('includes areas added by the 3.30 atlas rotation (#652)', () => {
    expect(SCRYING_ORB_AREAS['Castle Ruins']).toBe('36357')
    expect(SCRYING_ORB_AREAS.Barrows).toBe('49687')
    expect(SCRYING_ORB_AREAS['Defiled Cathedral']).toBe('47897')
  })

  it('gives every area a distinct id', () => {
    const ids = Object.values(SCRYING_ORB_AREAS)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('uses numeric-string ids -- the API rejects the display text as a type', () => {
    for (const [area, id] of Object.entries(SCRYING_ORB_AREAS)) {
      expect(id, area).toMatch(/^\d+$/)
    }
  })

  it('pins the single discriminator every area shares', () => {
    expect(SCRYING_ORB_DISCRIMINATOR).toBe('scrying_orb')
  })
})
