import { beforeEach, describe, expect, it, vi } from 'vitest'

// electron's `app.getPath('userData')` drives the on-disk path; mock it to a
// throwaway location and skip fs writes entirely (debounce timer never fires
// in these synchronous tests).
vi.mock('electron', () => ({ app: { getPath: () => '/tmp/test-scalpel' } }))

// Both bundled JSONs are imported at module load; stub them with a few known
// entries so we can verify bundled-wins-over-cache behaviour.
vi.mock('../../shared/data/items/item-icons-poe1.json', () => ({
  default: { 'Chaos Orb': 'https://poe1-bundle/chaos.png', 'Exquisite Blade': 'https://poe1-bundle/blade.png' },
}))
vi.mock('../../shared/data/items/item-icons-poe2.json', () => ({
  default: { 'Exalted Orb': 'https://poe2-bundle/exalted.png' },
}))

import { harvestIcons, loadIconCache } from './icon-cache'

describe('harvestIcons', () => {
  beforeEach(() => {
    // Reset the loaded-cache map between tests so each run starts clean.
    for (const v of [1, 2] as const) {
      const c = loadIconCache(v)
      for (const k of Object.keys(c)) delete c[k]
    }
  })

  it('stores a unique under its NAME, never the base type', () => {
    harvestIcons(1, [
      { name: "Kaom's Heart", baseType: 'Glorious Plate', rarity: 'Unique', icon: 'https://x/kaom.png' },
    ])
    const cache = loadIconCache(1)
    expect(cache["Kaom's Heart"]).toBe('https://x/kaom.png')
    // Critically: the base type must NOT get the unique's artwork.
    expect(cache['Glorious Plate']).toBeUndefined()
  })

  it('stores a non-unique result under its BASE TYPE', () => {
    harvestIcons(1, [{ name: '', baseType: 'Tough Jacket', rarity: 'Rare', icon: 'https://x/tough.png' }])
    expect(loadIconCache(1)['Tough Jacket']).toBe('https://x/tough.png')
  })

  it('skips items already in the bundled map (bundled wins)', () => {
    harvestIcons(1, [{ name: 'Chaos Orb', baseType: 'Chaos Orb', rarity: 'Normal', icon: 'https://x/fake.png' }])
    expect(loadIconCache(1)['Chaos Orb']).toBeUndefined()
  })

  it('ignores results with no icon or no key', () => {
    harvestIcons(1, [
      { name: 'X', baseType: 'Y', rarity: 'Rare' }, // no icon
      { icon: 'https://x/y.png', rarity: 'Rare' }, // no baseType
      { name: '', baseType: '', rarity: 'Unique', icon: 'https://x/z.png' }, // empty key
    ])
    expect(Object.keys(loadIconCache(1)).length).toBe(0)
  })

  it('keeps per-version caches isolated', () => {
    harvestIcons(1, [{ name: '', baseType: 'Rusted Cuirass', rarity: 'Rare', icon: 'https://p1/rusty.png' }])
    harvestIcons(2, [{ name: '', baseType: "Falconer's Jacket", rarity: 'Rare', icon: 'https://p2/falcon.png' }])
    expect(loadIconCache(1)['Rusted Cuirass']).toBe('https://p1/rusty.png')
    expect(loadIconCache(1)["Falconer's Jacket"]).toBeUndefined()
    expect(loadIconCache(2)["Falconer's Jacket"]).toBe('https://p2/falcon.png')
    expect(loadIconCache(2)['Rusted Cuirass']).toBeUndefined()
  })
})
