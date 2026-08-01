import { SKILL_GEM_CLASSES, splitRuneTier } from '@shared/poe-item'
import type { StatFilter } from '../../trade'

type RuneBaseItemInfo = {
  baseType: string
  rarity: string
  itemClass: string
  quality: number
}

// Rune-base chip (misc.rune_base). Returns empty array when no chip should emit.
// Emits for runeforged/runemastered equipment only -- gems, maps, and stackable
// currency do not receive rune tiers.
export function buildRuneBaseFilter(itemInfo: RuneBaseItemInfo | undefined): StatFilter[] {
  if (!itemInfo) return []

  const { tier } = splitRuneTier(itemInfo.baseType)
  if (!tier) return []

  const isGemItem = SKILL_GEM_CLASSES.has(itemInfo.itemClass)
  if (isGemItem) return []
  if (itemInfo.itemClass === 'Maps') return []
  if (itemInfo.itemClass === 'Stackable Currency') return []

  // A runeforged/runemastered unique trades as a distinct base (e.g. Runeseeker's
  // Call on "Runemastered Runic Fork", a different market segment from the bare
  // "Runic Fork" copy). Default the chip on so the search targets that variant via
  // the discriminator form (issue #458). Rares keep it off: there the chip only
  // composes onto the basetype chip, which itself defaults off (category search),
  // so an on-by-default rune chip would be inert anyway.
  const enabled = itemInfo.rarity === 'Unique'

  return [
    {
      id: 'misc.rune_base',
      text: tier,
      value: null,
      min: null,
      max: null,
      enabled,
      type: 'misc',
    },
  ]
}
