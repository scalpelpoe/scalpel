import { describe, expect, it } from 'vitest'
import manifest from '../../manifest.json'

describe('manifest poe2NinjaCategories unique coverage', () => {
  it('maps all 8 EE2 unique overview types to poe.ninja PoE2 category slugs', () => {
    const c = manifest.poe2NinjaCategories as Record<string, string>
    expect(c.UniqueWeapons).toBe('unique-weapons')
    expect(c.UniqueArmours).toBe('unique-armours')
    expect(c.UniqueAccessories).toBe('unique-accessories')
    expect(c.UniqueFlasks).toBe('unique-flasks')
    expect(c.UniqueCharms).toBe('unique-charms')
    expect(c.UniqueJewels).toBe('unique-jewels')
    expect(c.UniqueMaps).toBe('unique-maps')
    expect(c.UniqueSanctumRelics).toBe('unique-relics')
  })
})
