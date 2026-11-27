import { describe, it, expect } from 'vitest'
import { MAP_MODS } from './map-mods'
import rewards from './map-rewards.json'

describe('MAP_MODS', () => {
  it('loads map mods from the generated data', () => {
    expect(MAP_MODS.length).toBeGreaterThan(50)
  })
  it('every mod has a unique id', () => {
    const ids = new Set(MAP_MODS.map((m) => m.id))
    expect(ids.size).toBe(MAP_MODS.length)
  })
  it('ships a base-reward entry for every current token', () => {
    expect(new Set(Object.keys(rewards.rewards).map(Number))).toEqual(new Set(MAP_MODS.map((m) => m.id)))
    for (const m of MAP_MODS) expect(m.rewards?.rarity, m.text).toBeGreaterThan(0)
  })
  it('distinguishes ordinary pack bonuses from special drop bonuses', () => {
    const byId = (id: number) => MAP_MODS.find((m) => m.id === id)?.rewards
    expect(byId(-2050206104)).toEqual({ rarity: 9, quantity: 16, packsize: 6 }) // less recovery
    expect(byId(-1940135977)).toEqual({ morecurrency: 47, rarity: 8, quantity: 13, packsize: 5 }) // block
    expect(byId(1464066514)?.morescarabs).toBe(35) // less defences, More Threads
    expect(byId(-1621497665)?.moremaps).toBe(35) // maximum frenzy charges
  })
  it('strips GGG tag markup from every mod text', () => {
    for (const m of MAP_MODS) {
      expect(m.text, `mod ${m.id}`).not.toMatch(/[[\]]/)
    }
  })
  it('keeps the display half of a [Internal|Display] tag (3.29 Thorns mods)', () => {
    const physical = MAP_MODS.find((m) => m.id === -235013251)
    expect(physical?.text).toBe('Rare Monsters have Physical Thorns reflecting # Physical Damage')
    const elemental = MAP_MODS.find((m) => m.id === 1078205993)
    expect(elemental?.text).toBe('Rare Monsters have Elemental Thorns reflecting # Elemental Damage')
  })
  it('leaves the multi-mod | separator intact after tag stripping', () => {
    const nightmare = MAP_MODS.find((m) => m.id === -1430865583)
    expect(nightmare?.text).toBe(
      'Rare Monsters have Physical Thorns reflecting # Physical Damage|Rare Monsters have Elemental Thorns reflecting # Elemental Damage',
    )
  })
  it('does not file reflect damage under beneficial', () => {
    for (const id of [-235013251, 1078205993]) {
      expect(MAP_MODS.find((m) => m.id === id)?.danger, `mod ${id}`).toBe('harmless')
    }
  })
})
