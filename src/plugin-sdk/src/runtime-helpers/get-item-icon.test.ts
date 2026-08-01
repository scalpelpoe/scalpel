import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PoeItem } from '../../../shared/types'
import { getItemIcon } from './get-item-icon'
import type { ScalpelGlobal } from './scalpel-global'

const originalScalpel = (globalThis as unknown as { __scalpel?: ScalpelGlobal }).__scalpel

function buildItem(overrides: Partial<PoeItem> = {}): PoeItem {
  return {
    itemClass: '',
    rarity: 'Normal',
    name: '',
    baseType: '',
    ...overrides,
  } as PoeItem
}

beforeEach(() => {
  ;(globalThis as unknown as { __scalpel?: ScalpelGlobal }).__scalpel = {
    iconMap: {
      'Hypnotic Eye Jewel': 'https://cdn/hypnotic-eye-jewel.png',
      "Kaom's Heart": 'https://cdn/kaoms-heart.png',
      'Glorious Plate': 'https://cdn/glorious-plate.png',
      Ring: 'https://cdn/ring.png',
      'Leather Belt': 'https://cdn/leather-belt.png',
    },
    divCardArtMap: new Map(),
  }
})

afterEach(() => {
  ;(globalThis as unknown as { __scalpel?: ScalpelGlobal }).__scalpel = originalScalpel
})

describe('getItemIcon (#501 generated-name collision)', () => {
  it('returns the base-type icon for a Rare item whose title collides with an unrelated named entry', () => {
    // Rare Hypnotic Eye Jewel randomly titled "Ancient Orb" -- the name hop
    // must not fire, base type must win.
    const item = buildItem({
      name: 'Ancient Orb',
      baseType: 'Hypnotic Eye Jewel',
      rarity: 'Rare',
      itemClass: 'Abyss Jewels',
    })
    expect(getItemIcon(item)).toBe('https://cdn/hypnotic-eye-jewel.png')
  })

  it('returns null for a Rare item whose title collides but whose base has no icon', () => {
    const item = buildItem({
      name: 'Ring',
      baseType: 'Unmapped Base',
      rarity: 'Rare',
      itemClass: 'Rings',
    })
    // "Ring" is in the icon map by coincidence, but the base has no entry --
    // the substring loop must not run for Rare, so this stays null.
    expect(getItemIcon(item)).toBeNull()
  })

  it('still resolves a Magic item through the substring loop when the base type itself has no icon', () => {
    // The exact baseType ("Studded Belt") deliberately has no icon-map entry
    // so the direct base-type hop misses and the substring fallback has to
    // find "Leather Belt" embedded in the affixed name.
    const item = buildItem({
      name: 'Rusted Leather Belt of the Fox',
      baseType: 'Studded Belt',
      rarity: 'Magic',
      itemClass: 'Belts',
    })
    expect(getItemIcon(item)).toBe('https://cdn/leather-belt.png')
  })

  it('still resolves a Unique via the exact-name hop', () => {
    const item = buildItem({
      name: "Kaom's Heart",
      baseType: 'Glorious Plate',
      rarity: 'Unique',
      itemClass: 'Body Armours',
    })
    expect(getItemIcon(item)).toBe('https://cdn/kaoms-heart.png')
  })

  it('still resolves a Normal item via the exact-name hop', () => {
    const item = buildItem({
      name: 'Ring',
      baseType: 'Ring',
      rarity: 'Normal',
      itemClass: 'Rings',
    })
    expect(getItemIcon(item)).toBe('https://cdn/ring.png')
  })
})
