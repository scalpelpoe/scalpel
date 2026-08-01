import { rareModKeyDesc, type ItemsState } from '@shared/data/regex/items-state'
import type { RegexPresetTag } from '@shared/types'
import { capNamesToTags, TAB_COLORS } from './mapmods-helpers'

/** Auto-tags for an Items selection: base (item name in Magic, class in Rare),
 *  rarity, then the selected mod descs / affix names for the active class capped
 *  at three with a "+N more" overflow. Drives preset name-derivation and the
 *  matchesPreset tag-set dedup (vendor precedent). */
export function generateItemsPresetTags(state: ItemsState): RegexPresetTag[] {
  const tags: RegexPresetTag[] = []
  if (!state.itembase) return tags
  const tag = (text: string): void => {
    tags.push({ text, color: TAB_COLORS.qualifiers, source: 'qualifier' })
  }
  const baseLabel = state.rarity === 'Magic' && state.itembase.item ? state.itembase.item : state.itembase.baseType
  tag(baseLabel)
  tag(state.rarity)

  const names =
    state.rarity === 'Rare'
      ? Object.keys(state.selectedRareMods)
          .filter((k) => k.startsWith(state.itembase?.baseType ?? ''))
          .map((k) => rareModKeyDesc(k, state.itembase?.baseType ?? ''))
      : state.selectedMagicMods.filter((m) => m.basetype === state.itembase?.baseType).map((m) => m.affixName)

  tags.push(...capNamesToTags(names, { color: TAB_COLORS.qualifiers, source: 'qualifier' }))
  return tags
}
