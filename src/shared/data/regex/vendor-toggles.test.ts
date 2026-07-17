// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  VENDOR_TABS,
  DEFAULT_VENDOR_SETTINGS,
  DEFAULT_VENDOR_GROUPS_STATE,
  vendorSettingsToQualifiers,
  qualifiersToVendorSettings,
  vendorGroupsToQualifiers,
  qualifiersToVendorGroups,
  vendorGroupConditionCount,
  isVendorGroupsEmpty,
  ensureVendorGroupsMigrated,
  sanitizeVendorGroups,
  type VendorSettings,
  type VendorGroupsState,
} from './vendor-toggles'

function withFields(...fields: Array<[keyof VendorSettings, string]>): VendorSettings {
  const g = structuredClone(DEFAULT_VENDOR_SETTINGS)
  for (const [grp, f] of fields) (g[grp] as Record<string, boolean>)[f] = true
  return g
}

describe('vendor catalog', () => {
  it('every toggle points at a real boolean field in DEFAULT_VENDOR_SETTINGS', () => {
    for (const tab of VENDOR_TABS) {
      for (const section of tab.sections) {
        for (const t of section.toggles) {
          const group = DEFAULT_VENDOR_SETTINGS[t.group] as Record<string, boolean>
          expect(group, `${t.group}`).toBeDefined()
          expect(typeof group[t.field], `${t.group}.${t.field}`).toBe('boolean')
        }
      }
    }
  })

  it('round-trips settings through qualifiers', () => {
    const s = structuredClone(DEFAULT_VENDOR_SETTINGS)
    s.itemProperty.quality = true
    s.itemMods.elemental = true
    s.itemClass.bows = true
    s.itemLevel = { min: 65, max: 84 }
    s.characterLevel = { min: 1, max: 12 }
    const q = vendorSettingsToQualifiers(s)
    expect(qualifiersToVendorSettings(q)).toEqual(s)
  })

  it('produces an all-false / zero default that yields no qualifiers set', () => {
    const q = vendorSettingsToQualifiers(DEFAULT_VENDOR_SETTINGS)
    expect(Object.values(q).every((v) => v === 0)).toBe(true)
  })
})

describe('vendorGroupConditionCount', () => {
  it('counts zero for the default empty group', () => {
    expect(vendorGroupConditionCount(DEFAULT_VENDOR_SETTINGS)).toBe(0)
  })
  it('counts toggles and each non-zero level range', () => {
    const g = withFields(['itemMods', 'maxLife'], ['itemClass', 'bows'])
    g.itemLevel = { min: 10, max: 0 }
    expect(vendorGroupConditionCount(g)).toBe(3)
  })
})

describe('isVendorGroupsEmpty', () => {
  it('true only for a single empty group', () => {
    expect(isVendorGroupsEmpty({ groups: [structuredClone(DEFAULT_VENDOR_SETTINGS)], selectedGroupId: 0 })).toBe(true)
  })
  it('false when the single group has a selection', () => {
    expect(isVendorGroupsEmpty({ groups: [withFields(['itemMods', 'maxLife'])], selectedGroupId: 0 })).toBe(false)
  })
  it('false when there is more than one group', () => {
    const two = [structuredClone(DEFAULT_VENDOR_SETTINGS), structuredClone(DEFAULT_VENDOR_SETTINGS)]
    expect(isVendorGroupsEmpty({ groups: two, selectedGroupId: 0 })).toBe(false)
  })
})

describe('vendor groups qualifiers round-trip', () => {
  it('round-trips a multi-group state (selectedGroupId resets to 0)', () => {
    const state: VendorGroupsState = {
      groups: [
        withFields(['itemMods', 'maxLife']),
        withFields(['itemClass', 'bows']),
        withFields(['resistances', 'fire']),
      ],
      selectedGroupId: 2,
    }
    const back = qualifiersToVendorGroups(vendorGroupsToQualifiers(state))
    expect(back.groups).toEqual(state.groups)
    expect(back.selectedGroupId).toBe(0)
  })

  it('reads a legacy single-group preset (no groupCount) as one group', () => {
    const legacy = vendorSettingsToQualifiers(withFields(['itemMods', 'maxLife']))
    const back = qualifiersToVendorGroups(legacy)
    expect(back.groups).toEqual([withFields(['itemMods', 'maxLife'])])
    expect(back.selectedGroupId).toBe(0)
  })
})

describe('ensureVendorGroupsMigrated', () => {
  beforeEach(() => localStorage.clear())

  it('wraps legacy single settings into a one-group state', () => {
    const legacy = withFields(['itemMods', 'maxLife'])
    localStorage.setItem('k:vendor-settings', JSON.stringify(legacy))
    ensureVendorGroupsMigrated('k:vendor-settings', 'k:vendor-groups')
    const stored = JSON.parse(localStorage.getItem('k:vendor-groups') as string)
    expect(stored).toEqual({ groups: [legacy], selectedGroupId: 0 })
  })

  it('does not clobber an existing groups state', () => {
    const existing = { groups: [withFields(['itemClass', 'bows'])], selectedGroupId: 0 }
    localStorage.setItem('k:vendor-groups', JSON.stringify(existing))
    localStorage.setItem('k:vendor-settings', JSON.stringify(withFields(['itemMods', 'maxLife'])))
    ensureVendorGroupsMigrated('k:vendor-settings', 'k:vendor-groups')
    expect(JSON.parse(localStorage.getItem('k:vendor-groups') as string)).toEqual(existing)
  })

  it('is a no-op when there is no legacy data', () => {
    ensureVendorGroupsMigrated('k:vendor-settings', 'k:vendor-groups')
    expect(localStorage.getItem('k:vendor-groups')).toBeNull()
  })
})

describe('sanitizeVendorGroups', () => {
  it('heals PoE1-shaped groups (reverse poisoned key) to defaults without throwing', () => {
    const poe1Shaped = {
      groups: [{ links: { any3: true }, colors3: { rrr: true }, gems: [123] }],
      selectedGroupId: 0,
    }
    expect(sanitizeVendorGroups(poe1Shaped)).toEqual(DEFAULT_VENDOR_GROUPS_STATE)
  })

  it('passes valid state through and clamps level ranges + selectedGroupId', () => {
    const g = structuredClone(DEFAULT_VENDOR_SETTINGS)
    g.itemProperty.quality = true
    g.itemLevel = { min: 10, max: 60 }
    expect(sanitizeVendorGroups({ groups: [g], selectedGroupId: 9 })).toEqual({ groups: [g], selectedGroupId: 0 })
    const dirty = structuredClone(DEFAULT_VENDOR_SETTINGS) as unknown as Record<string, unknown>
    dirty.itemLevel = { min: -5, max: 400 }
    const healed = sanitizeVendorGroups({ groups: [dirty], selectedGroupId: 0 })
    expect(healed.groups[0].itemLevel).toEqual({ min: 0, max: 100 })
  })

  it('returns the default state for junk values', () => {
    for (const junk of [null, 42, 'x', {}, { groups: [] }]) {
      expect(sanitizeVendorGroups(junk)).toEqual(DEFAULT_VENDOR_GROUPS_STATE)
    }
  })
})
