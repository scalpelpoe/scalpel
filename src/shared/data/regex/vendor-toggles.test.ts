import { describe, it, expect } from 'vitest'
import {
  VENDOR_TABS,
  DEFAULT_VENDOR_SETTINGS,
  vendorSettingsToQualifiers,
  qualifiersToVendorSettings,
} from './vendor-toggles'

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
