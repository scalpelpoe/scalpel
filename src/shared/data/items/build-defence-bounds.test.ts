import { describe, expect, it, vi } from 'vitest'
// CJS module; import its pure export (pattern: build-tier-data.test.ts).
import { buildBounds } from '../../../../scripts/build-defence-bounds.js'

const baseItems = {
  'Metadata/Items/Armours/BodyArmours/BodyStr15': {
    name: 'Astral Plate',
    item_class: 'Body Armour',
    release_state: 'released',
    properties: { armour: { min: 711, max: 782 }, movement_speed: -5 },
  },
  'Metadata/Items/Armours/Shields/ShieldDexInt10': {
    name: 'Alder Spiked Shield',
    item_class: 'Shield',
    release_state: 'released',
    properties: {
      evasion: { min: 209, max: 240 },
      energy_shield: { min: 43, max: 49 },
      movement_speed: -3,
      block: 24,
    },
  },
  'Metadata/Items/Armours/Helmets/HelmetWard1': {
    name: 'Runic Crown',
    item_class: 'Helmet',
    release_state: 'released',
    properties: { ward: { min: 41, max: 47 } },
  },
  // Fixed-value defence (min === max) must be dropped; base with nothing left is omitted.
  'Metadata/Items/Armours/Helmets/HelmetFixed': {
    name: 'Fixed Helm',
    item_class: 'Helmet',
    release_state: 'released',
    properties: { armour: { min: 100, max: 100 } },
  },
  // Unreleased bases must be skipped.
  'Metadata/Items/Armours/BodyArmours/BodyStrUnreleased': {
    name: 'Prototype Plate',
    item_class: 'Body Armour',
    release_state: 'unreleased',
    properties: { armour: { min: 1, max: 999 } },
  },
  // Non-armour entries (no defence properties) must be skipped.
  'Metadata/Items/Currency/CurrencyWeaponQuality': {
    name: "Blacksmith's Whetstone",
    item_class: 'StackableCurrency',
    release_state: 'released',
    properties: { description: 'Improves the quality of a weapon' },
  },
}

// Real-world case: "Two-Toned Boots" has three released variants (Armour/Evasion,
// Armour/Energy Shield, Evasion/Energy Shield) sharing one display name with
// DIFFERENT defence pairs - the clipboard base name can't disambiguate which
// variant an item is, so a conflicting duplicate must drop the name entirely.
const conflictingDuplicates = {
  'Metadata/Items/Armours/Boots/BootsStrDex': {
    name: 'Two-Toned Boots',
    item_class: 'Boots',
    release_state: 'released',
    properties: { armour: { min: 88, max: 106 }, evasion: { min: 88, max: 106 } },
  },
  'Metadata/Items/Armours/Boots/BootsStrInt': {
    name: 'Two-Toned Boots',
    item_class: 'Boots',
    release_state: 'released',
    properties: { armour: { min: 88, max: 106 }, energy_shield: { min: 18, max: 22 } },
  },
  'Metadata/Items/Armours/Boots/BootsDexInt': {
    name: 'Two-Toned Boots',
    item_class: 'Boots',
    release_state: 'released',
    properties: { evasion: { min: 88, max: 106 }, energy_shield: { min: 18, max: 22 } },
  },
}

// Two metadata paths that happen to describe the exact same bounds under the
// same display name (harmless duplicate, e.g. a base re-listed under a second
// Atlas-only metadata path with identical properties).
const identicalDuplicates = {
  'Metadata/Items/Armours/BodyArmours/BodyStr15': {
    name: 'Astral Plate',
    item_class: 'Body Armour',
    release_state: 'released',
    properties: { armour: { min: 711, max: 782 } },
  },
  'Metadata/Items/Armours/BodyArmours/BodyStr15Atlas': {
    name: 'Astral Plate',
    item_class: 'Body Armour',
    release_state: 'released',
    properties: { armour: { min: 711, max: 782 }, movement_speed: -5 },
  },
}

describe('buildBounds', () => {
  it('maps defence properties to compact tuple keys', () => {
    const out = buildBounds(baseItems)
    expect(out['Astral Plate']).toEqual({ ar: [711, 782] })
    expect(out['Alder Spiked Shield']).toEqual({ ev: [209, 240], es: [43, 49] })
    expect(out['Runic Crown']).toEqual({ ward: [41, 47] })
  })

  it('drops fixed ranges, unreleased bases, and non-defence items', () => {
    const out = buildBounds(baseItems)
    expect(out['Fixed Helm']).toBeUndefined()
    expect(out['Prototype Plate']).toBeUndefined()
    expect(out["Blacksmith's Whetstone"]).toBeUndefined()
  })

  it('drops a duplicate name whose bounds conflict, warning once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = buildBounds(conflictingDuplicates)
    expect(out['Two-Toned Boots']).toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('conflicting bounds for duplicate base name "Two-Toned Boots", dropping')
    warn.mockRestore()
  })

  it('keeps a duplicate name silently when its bounds are identical', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = buildBounds(identicalDuplicates)
    expect(out['Astral Plate']).toEqual({ ar: [711, 782] })
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
