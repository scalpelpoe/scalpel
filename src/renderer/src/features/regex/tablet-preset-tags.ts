import { TAB_COLORS } from './mapmods-helpers'
import type { TabletMod } from '../../../../shared/data/regex/tablet-mods'
import type { RegexPresetTag } from '../../../../shared/types'

export interface TabletTagState {
  want: Set<number>
  rarity: { normal: boolean; magic: boolean }
  type: {
    breach: boolean
    delirium: boolean
    irradiated: boolean
    expedition: boolean
    ritual: boolean
    overseer: boolean
  }
  uses: { enabled: boolean; value: number }
}

export const TYPE_LABELS: Array<[keyof TabletTagState['type'], string]> = [
  ['breach', 'Breach'],
  ['delirium', 'Delirium'],
  ['irradiated', 'Irradiated'],
  ['expedition', 'Expedition'],
  ['ritual', 'Ritual'],
  ['overseer', 'Overseer'],
]

/** Auto-tags for a tablet selection: one per selected affix (display text) plus
 *  rarity / type / uses qualifiers. Drives preset name-derivation and the
 *  match-by-tag-set dedup in TabletGenerator.matchesPreset (mirrors waystones). */
export function generateTabletPresetTags(state: TabletTagState, mods: TabletMod[]): RegexPresetTag[] {
  const tag = (text: string): RegexPresetTag => ({ text, source: 'qualifier', color: TAB_COLORS.qualifiers })
  const tags: RegexPresetTag[] = []
  if (state.rarity.normal) tags.push(tag('Normal'))
  if (state.rarity.magic) tags.push(tag('Magic'))
  for (const [key, label] of TYPE_LABELS) if (state.type[key]) tags.push(tag(label))
  if (state.uses.enabled) tags.push(tag(`${state.uses.value}+ uses`))
  // Selected affixes are "want" tags (like waystones), so their chips render the
  // want icon/color rather than the qualifier icon.
  for (const m of mods)
    if (state.want.has(m.id)) tags.push({ text: m.text, source: 'want', color: TAB_COLORS.want, sourceId: m.id })
  return tags
}
