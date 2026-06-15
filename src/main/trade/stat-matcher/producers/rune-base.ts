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

  return [
    {
      id: 'misc.rune_base',
      text: tier,
      value: null,
      min: null,
      max: null,
      enabled: false,
      type: 'misc',
    },
  ]
}
