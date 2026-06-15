import { RELIC_MODS } from '@shared/data/regex/relic-mods'
import type { RegexPresetTag } from '@shared/types'
import type { RelicMatchType } from './relic-engine'
import { TAB_COLORS } from './mapmods-helpers'

interface RelicTagState {
  want: Set<number>
  wantValues: Record<number, number>
  matchType: RelicMatchType
}

/** Short chip label for a relic mod: first text segment with range groups (e.g.
 *  "(#.#-#.#)") and placeholder/sign chars stripped, then the first few words.
 *  Word-based (not a hard char slice) so distinct mods like "...quantity of Keys"
 *  vs "...quantity of Relics" stay distinguishable. Relics don't warrant a
 *  hand-curated tag map. */
function relicModTag(text: string): string {
  return text
    .split('|')[0]
    .replace(/\([^)]*\)/g, '')
    .replace(/[#%+]/g, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join(' ')
}

/** Auto-tags for a relic preset: a `match:both` qualifier tag (only in both mode)
 *  plus one want-sourced tag per selected mod, with a `>=value` suffix when a
 *  magnitude is set. Tags carry a `source` so the container can tell them apart
 *  from user-added custom tags. */
export function generateRelicPresetTags(state: RelicTagState): RegexPresetTag[] {
  const tags: RegexPresetTag[] = []

  if (state.matchType === 'both') {
    tags.push({ text: 'match:both', color: TAB_COLORS.qualifiers, source: 'qualifier', sourceId: 'matchType' })
  }

  for (const id of state.want) {
    const mod = RELIC_MODS.find((m) => m.id === id)
    if (!mod) continue
    const v = state.wantValues[id]
    const base = relicModTag(mod.text)
    tags.push({ text: v ? `${base}>=${v}` : base, color: TAB_COLORS.want, source: 'want', sourceId: id })
  }

  return tags
}
