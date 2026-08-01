/** Auto-tags for the Beasts tab. These only drive the derived preset name in the
 *  save panel -- save-as-update dedup compares BeastState directly via
 *  beastStateEquals, so the "+N more" cap below cannot collapse two distinct
 *  presets into one. */

import type { BeastState } from '@shared/data/regex/beast-state'
import type { RegexPresetTag } from '@shared/types'
import { capNamesToTags, TAB_COLORS } from './mapmods-helpers'

export function generateBeastPresetTags(state: BeastState): RegexPresetTag[] {
  const tags: RegexPresetTag[] = []
  const qualifier = (text: string): RegexPresetTag => ({
    text,
    color: TAB_COLORS.qualifiers,
    source: 'qualifier',
  })

  if (state.menagerieLimit) tags.push(qualifier('menagerie'))
  if (state.redOnly) tags.push(qualifier('red only'))
  if (state.includeHarvest) tags.push(qualifier('harvest'))
  if (state.minChaos != null) tags.push(qualifier(`min ${state.minChaos}c`))
  if (state.maxChaos != null) tags.push(qualifier(`max ${state.maxChaos}c`))

  tags.push(...capNamesToTags([...state.pinned].sort(), { prefix: '+', color: TAB_COLORS.want, source: 'want' }))
  tags.push(...capNamesToTags([...state.muted].sort(), { prefix: '-', color: TAB_COLORS.avoid, source: 'avoid' }))

  // Default state still needs a name, since the tab always produces a regex.
  if (tags.length === 0) tags.push(qualifier('beasts by value'))
  return tags
}
