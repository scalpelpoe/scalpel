import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VENDOR_POE1_GROUPS_STATE,
  DEFAULT_VENDOR_POE1_SETTINGS,
  VENDOR_POE1_TABS,
  isVendorPoe1GroupsEmpty,
  qualifiersToVendorPoe1Groups,
  qualifiersToVendorPoe1Settings,
  sanitizeVendorPoe1Groups,
  vendorPoe1GroupConditionCount,
  vendorPoe1GroupsToQualifiers,
  vendorPoe1SettingsToQualifiers,
  type VendorPoe1Settings,
} from './vendor-poe1-toggles'

function sampleSettings(): VendorPoe1Settings {
  const s = structuredClone(DEFAULT_VENDOR_POE1_SETTINGS)
  s.links.any4 = true
  s.colors3.rrb = true
  s.colors2.gr = true
  s.movement.ten = true
  s.plusGems.fire = true
  s.damage.chaosmult = true
  s.weapon.axe = true
  s.gems = [-2137186526, 1044839641]
  return s
}

describe('catalog consistency', () => {
  it('every toggle references an existing boolean field in the defaults', () => {
    for (const tab of VENDOR_POE1_TABS) {
      for (const section of tab.sections) {
        for (const t of section.toggles) {
          const group = DEFAULT_VENDOR_POE1_SETTINGS[t.group] as Record<string, boolean>
          expect(group, `${t.group}.${t.field}`).toHaveProperty(t.field)
          expect(typeof group[t.field]).toBe('boolean')
        }
      }
    }
  })

  it('covers every boolean field exactly once', () => {
    const seen = new Set<string>()
    for (const tab of VENDOR_POE1_TABS)
      for (const section of tab.sections)
        for (const t of section.toggles) {
          const key = `${t.group}.${t.field}`
          expect(seen.has(key), `duplicate ${key}`).toBe(false)
          seen.add(key)
        }
    const expected = new Set<string>()
    for (const group of ['links', 'colors3', 'colors2', 'movement', 'plusGems', 'damage', 'weapon'] as const)
      for (const field of Object.keys(DEFAULT_VENDOR_POE1_SETTINGS[group])) expected.add(`${group}.${field}`)
    expect(seen).toEqual(expected)
  })
})

describe('qualifiers round-trip', () => {
  it('settings survive a round-trip, including gem order', () => {
    const s = sampleSettings()
    expect(qualifiersToVendorPoe1Settings(vendorPoe1SettingsToQualifiers(s))).toEqual(s)
  })

  it('grouped state survives a round-trip', () => {
    const g0 = sampleSettings()
    const g1 = structuredClone(DEFAULT_VENDOR_POE1_SETTINGS)
    g1.weapon.bow = true
    g1.gems = [123]
    const state = { groups: [g0, g1], selectedGroupId: 1 }
    const back = qualifiersToVendorPoe1Groups(vendorPoe1GroupsToQualifiers(state))
    expect(back.groups).toEqual([g0, g1])
    expect(back.selectedGroupId).toBe(0) // selectedGroupId is ephemeral, always 0 on load
  })

  it('empty qualifiers map yields the default single-group state', () => {
    expect(qualifiersToVendorPoe1Groups({})).toEqual(DEFAULT_VENDOR_POE1_GROUPS_STATE)
  })
})

describe('condition count and emptiness', () => {
  it('counts toggles plus selected gems', () => {
    const s = sampleSettings()
    expect(vendorPoe1GroupConditionCount(s)).toBe(9) // 7 toggles + 2 gems
  })

  it('default state is empty; any selection is not', () => {
    expect(isVendorPoe1GroupsEmpty(DEFAULT_VENDOR_POE1_GROUPS_STATE)).toBe(true)
    expect(isVendorPoe1GroupsEmpty({ groups: [sampleSettings()], selectedGroupId: 0 })).toBe(false)
    expect(
      isVendorPoe1GroupsEmpty({
        groups: [structuredClone(DEFAULT_VENDOR_POE1_SETTINGS), structuredClone(DEFAULT_VENDOR_POE1_SETTINGS)],
        selectedGroupId: 0,
      }),
    ).toBe(false) // two groups means the user is grouping, even if both are empty
  })
})

describe('sanitizeVendorPoe1Groups', () => {
  it('heals PoE2-shaped groups (the poisoned-key crash) to defaults without throwing', () => {
    const poe2Shaped = {
      groups: [
        {
          itemProperty: { quality: true, sockets: false },
          itemType: { rare: true, magic: false, normal: false },
          itemMods: { physical: true },
          itemLevel: { min: 10, max: 0 },
        },
      ],
      selectedGroupId: 0,
    }
    expect(sanitizeVendorPoe1Groups(poe2Shaped)).toEqual(DEFAULT_VENDOR_POE1_GROUPS_STATE)
  })

  it('passes valid state through unchanged and clamps selectedGroupId', () => {
    const g0 = sampleSettings()
    const state = { groups: [g0], selectedGroupId: 5 }
    expect(sanitizeVendorPoe1Groups(state)).toEqual({ groups: [g0], selectedGroupId: 0 })
  })

  it('merges partial groups over defaults and filters non-numeric gems', () => {
    const partial = { groups: [{ links: { any3: true }, gems: [1, 'x', 2, Number.NaN] }], selectedGroupId: 0 }
    const healed = sanitizeVendorPoe1Groups(partial)
    expect(healed.groups[0].links.any3).toBe(true)
    expect(healed.groups[0].links.socket6).toBe(false)
    expect(healed.groups[0].gems).toEqual([1, 2])
  })

  it('returns the default state for junk values', () => {
    for (const junk of [null, 42, 'x', {}, { groups: [] }, { groups: 'nope' }]) {
      expect(sanitizeVendorPoe1Groups(junk)).toEqual(DEFAULT_VENDOR_POE1_GROUPS_STATE)
    }
  })
})
