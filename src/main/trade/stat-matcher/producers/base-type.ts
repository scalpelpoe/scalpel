import { isClusterJewel, SKILL_GEM_CLASSES, splitRuneTier } from '../../../../shared/poe-item'
import type { StatFilter } from '../../trade'

type BaseTypeItemInfo = {
  baseType: string
  rarity: string
  itemClass: string
  quality: number
}

// baseType chip (misc.basetype). Returns empty array when no chip should emit.
export function buildBaseTypeFilter(itemInfo: BaseTypeItemInfo | undefined): StatFilter[] {
  if (!itemInfo) return []

  const isGemItem = SKILL_GEM_CLASSES.has(itemInfo.itemClass)
  if (!itemInfo.baseType || itemInfo.rarity === 'Unique' || isGemItem) return []

  // baseType is already cleaned by the clipboard parser (Superior stripped, magic affixes removed if base was recognized)
  // Special map types that have their own trade API type (not generic "Map")
  const specialMapTypes = new Set(['Nightmare Map', 'Valdo Map', 'Shaper Guardian Map', 'Vaal Temple Map'])
  const baseTypeCleaned = itemInfo.baseType
    .replace(/^Superior\s+/i, '')
    .replace(/\s*\(Tier \d+\)/, '')
    .trim()
  const isSpecialMap = itemInfo.itemClass === 'Maps' && specialMapTypes.has(baseTypeCleaned)
  // Cluster jewels: Small/Medium/Large are price-disjoint, so an 8-passive
  // Large search shouldn't surface Mediums (or vice versa). Pin to the exact
  // base type via the misc.basetype chip the same way special maps do.
  const isCluster = isClusterJewel({ itemClass: itemInfo.itemClass, baseType: baseTypeCleaned })
  const isBaseItem = itemInfo.rarity === 'Normal' || itemInfo.rarity === 'Magic'
  const isOverqualitied = itemInfo.quality > 20
  // The basetype chip always shows the BARE base ("Faithful Leggings"); the
  // separate misc.rune_base chip composes the "Runeforged"/"Runemastered" prefix
  // back on at query time. Rune bases default off like any other rare (category
  // search) -- the user pins the base + rune chips explicitly when narrowing.
  const baseTypeText = splitRuneTier(baseTypeCleaned).bare
  const baseTypeEnabled = isSpecialMap || isCluster || (isBaseItem && isOverqualitied)

  return [
    {
      id: 'misc.basetype',
      text: baseTypeText,
      value: null,
      min: null,
      max: null,
      enabled: baseTypeEnabled,
      type: 'misc',
    },
  ]
}
