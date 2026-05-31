import { VENDOR_TABS } from '../../../../shared/data/regex/vendor-toggles'
import type { VendorSettings } from './vendor-engine'
import type { RegexPresetTag } from '../../../../shared/types'
import { TAB_COLORS } from './mapmods-helpers'

/** Auto-tags for a vendor selection: one per active toggle (catalog label) plus a
 *  tag per non-empty level range. Drives preset name-derivation and the
 *  match-by-tag-set dedup in VendorGenerator.matchesPreset (mirrors waystones). */
export function generateVendorPresetTags(s: VendorSettings): RegexPresetTag[] {
  const tags: RegexPresetTag[] = []
  for (const tab of VENDOR_TABS) {
    for (const section of tab.sections) {
      for (const t of section.toggles) {
        if ((s[t.group] as Record<string, boolean>)[t.field]) {
          tags.push({ text: t.label, color: TAB_COLORS.qualifiers, source: 'qualifier' })
        }
      }
    }
  }
  if (s.itemLevel.min !== 0 || s.itemLevel.max !== 0) {
    tags.push({
      text: `iLvl ${s.itemLevel.min}-${s.itemLevel.max || 99}`,
      color: TAB_COLORS.qualifiers,
      source: 'qualifier',
    })
  }
  if (s.characterLevel.min !== 0 || s.characterLevel.max !== 0) {
    tags.push({
      text: `cLvl ${s.characterLevel.min}-${s.characterLevel.max || 99}`,
      color: TAB_COLORS.qualifiers,
      source: 'qualifier',
    })
  }
  return tags
}
