import { VENDOR_POE1_TABS, type VendorPoe1Settings } from '@shared/data/regex/vendor-poe1-toggles'
import { regexGems } from '@shared/data/regex/vendor/gems/Generated.Gems.English'
import type { RegexPresetTag } from '@shared/types'
import { TAB_COLORS } from './mapmods-helpers'

const GEM_NAME_BY_ID = new Map(regexGems.tokens.map((t) => [t.id, t.rawText.replaceAll('|', ' ')]))

/** Auto-tags for a PoE1 vendor selection: one per active toggle (catalog label
 *  verbatim) plus gem names capped at three with a "+N gems" overflow tag. Drives
 *  preset name-derivation and the match-by-tag-set dedup in
 *  VendorPoe1Generator.matchesPreset (mirrors the PoE2 vendor tab). */
export function generateVendorPoe1PresetTags(s: VendorPoe1Settings): RegexPresetTag[] {
  const tags: RegexPresetTag[] = []
  for (const tab of VENDOR_POE1_TABS) {
    for (const section of tab.sections) {
      for (const t of section.toggles) {
        if ((s[t.group] as Record<string, boolean>)[t.field]) {
          tags.push({ text: t.label, color: TAB_COLORS.qualifiers, source: 'qualifier' })
        }
      }
    }
  }
  const names = s.gems.map((id) => GEM_NAME_BY_ID.get(id)).filter((n): n is string => n !== undefined)
  for (const name of names.slice(0, 3)) {
    tags.push({ text: name, color: TAB_COLORS.qualifiers, source: 'qualifier' })
  }
  if (names.length > 3) {
    tags.push({ text: `+${names.length - 3} gems`, color: TAB_COLORS.qualifiers, source: 'qualifier' })
  }
  return tags
}
