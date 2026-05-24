import { SKILL_GEM_CLASSES } from '../../../../shared/poe-item'
import type { AdvancedMod } from '../../../../shared/types'
import type { StatFilter } from '../../trade'
import { ITEM_CLASS_TO_CATEGORY } from '../item-classes'

type MiscItemInfo = {
  itemClass: string
  rarity: string
  quality: number
  itemLevel: number
  corrupted: boolean
  mirrored: boolean
  identified?: boolean
  influence?: string[]
  memoryStrands?: number
  isSynthetic?: boolean
}

// Non-gem quality, item level, open prefix/suffix, memory strands, corrupted,
// rarity, mirrored, unidentified, fractured, and influence chips.
// `filters` is passed explicitly because the fractured chip reads it to determine
// whether a fractured mod is already enabled (sequencing dependency).
export function buildMiscFilters(
  itemInfo: MiscItemInfo | undefined,
  advancedMods: AdvancedMod[] | undefined,
  filters: StatFilter[],
): StatFilter[] {
  if (!itemInfo) return []

  const out: StatFilter[] = []
  const isGem = SKILL_GEM_CLASSES.has(itemInfo.itemClass)
  const isEquipment = !!ITEM_CLASS_TO_CATEGORY[itemInfo.itemClass]
  const isMap = itemInfo.itemClass === 'Maps'
  const isBaseItem = itemInfo.rarity === 'Normal' || itemInfo.rarity === 'Magic'
  const isOverqualitied = itemInfo.quality > 20

  // Non-gem quality chip (gem quality is handled by buildGemFilters)
  if (itemInfo.quality > 0 && !isGem) {
    const qualityEnabled = isBaseItem && isOverqualitied
    out.push({
      id: 'misc.quality',
      text: `Quality: ${itemInfo.quality}%`,
      value: itemInfo.quality,
      min: itemInfo.quality,
      max: null,
      enabled: qualityEnabled,
      type: 'misc',
    })
  }

  // Item level chip
  if (itemInfo.itemLevel > 0 && !itemInfo.isSynthetic) {
    const isForbiddenTome = itemInfo.itemClass === 'Sanctum Research'
    out.push({
      id: 'misc.ilvl',
      text: `ilvl: ${itemInfo.itemLevel}`,
      value: itemInfo.itemLevel,
      min: isForbiddenTome ? null : itemInfo.itemLevel,
      max: isForbiddenTome ? itemInfo.itemLevel : null,
      enabled: isForbiddenTome,
      type: 'misc',
      ...(isForbiddenTome ? { chipState: 'max' as const } : {}),
    })
  } else if (itemInfo.isSynthetic) {
    // Synthetic items have a placeholder ilvl that's meaningless. Render as an
    // editable row pre-set to 83 (typical T16 map level) so users price-checking
    // for dust can lift the ilvl floor without first having to enable a chip.
    // Type 'gem' (instead of 'misc') routes the filter through StatFilterRow
    // rendering -- 'misc' goes through FilterChip -- while still landing in the
    // misc-filter group on the API side (trade.ts dispatches by id).
    out.push({
      id: 'misc.ilvl',
      text: 'Item Level',
      value: 83,
      min: 83,
      max: null,
      enabled: true,
      type: 'gem',
    })
  }

  // Open prefix/suffix chips (from advanced mod data, non-uniques only).
  // Crafted affixes count as "empty" since they're replaceable -- a crafted suffix
  // plus a literally-empty suffix is counted as 2 open suffixes for pricing purposes.
  if (advancedMods && advancedMods.length > 0 && itemInfo.rarity !== 'Unique') {
    const prefixCount = advancedMods.filter((m) => m.type === 'prefix' && !m.crafted).length
    const suffixCount = advancedMods.filter((m) => m.type === 'suffix' && !m.crafted).length
    // Max affixes depends on item: normal equipment has 3/3, jewels have 2/2
    const isJewel = itemInfo.itemClass === 'Jewels' || itemInfo.itemClass === 'Abyss Jewels'
    const maxPrefixes = isJewel ? 2 : 3
    const maxSuffixes = isJewel ? 2 : 3
    const openPrefixes = maxPrefixes - prefixCount
    const openSuffixes = maxSuffixes - suffixCount
    if (openPrefixes > 0) {
      out.push({
        id: 'pseudo.pseudo_number_of_empty_prefix_mods',
        text: `Open Prefix (${openPrefixes})`,
        value: openPrefixes,
        min: 1,
        max: null,
        enabled: false,
        type: 'misc',
      })
    }
    if (openSuffixes > 0) {
      out.push({
        id: 'pseudo.pseudo_number_of_empty_suffix_mods',
        text: `Open Suffix (${openSuffixes})`,
        value: openSuffixes,
        min: 1,
        max: null,
        enabled: false,
        type: 'misc',
      })
    }
  }

  // Memory Strands
  if (itemInfo.memoryStrands != null) {
    out.push({
      id: 'misc.memory_level',
      text: `Memory Strands: ${itemInfo.memoryStrands}`,
      value: itemInfo.memoryStrands,
      min: itemInfo.memoryStrands,
      max: null,
      enabled: true,
      type: 'pseudo',
    })
  }

  // Corrupted chip
  if (isGem || isEquipment || isMap) {
    out.push({
      id: 'misc.corrupted',
      text: 'Corrupted',
      value: null,
      min: null,
      max: null,
      enabled: false,
      chipState: itemInfo.corrupted ? 'yes' : 'no',
      type: 'misc',
    })
  } else if (itemInfo.corrupted && itemInfo.itemClass !== 'Divination Cards') {
    out.push({
      id: 'misc.corrupted',
      text: 'Corrupted',
      value: null,
      min: null,
      max: null,
      enabled: false,
      chipState: 'yes',
      type: 'misc',
    })
  }

  // Rarity filter for equipment (off by default - search includes all non-unique by default)
  if (isEquipment && itemInfo.rarity !== 'Unique') {
    out.push({
      id: 'misc.rarity',
      text: itemInfo.rarity,
      value: null,
      min: null,
      max: null,
      enabled: false,
      type: 'misc',
    })
  }

  if (itemInfo.mirrored || (isEquipment && itemInfo.rarity !== 'Unique')) {
    out.push({
      id: 'misc.mirrored',
      text: 'Mirrored',
      value: null,
      min: null,
      max: null,
      enabled: false,
      chipState: itemInfo.mirrored ? 'yes' : 'no',
      type: 'misc',
    })
  }

  // Show the chip on uniques regardless of identified state so users can flip
  // between identified and unid searches; default `enabled` matches the item.
  if (itemInfo.identified === false || itemInfo.rarity === 'Unique') {
    out.push({
      id: 'misc.identified',
      text: 'Unidentified',
      value: null,
      min: null,
      max: null,
      enabled: itemInfo.identified === false,
      type: 'misc',
    })
  }

  // Fractured chip -- depends on the explicit loop having already populated `filters`
  // with fractured-typed chips. The `filters` arg carries that sequencing dependency.
  if (isEquipment && itemInfo.rarity !== 'Unique') {
    const hasFracturedMod = filters.some((f) => f.type === 'fractured' && f.enabled)
    out.push({
      id: 'misc.fractured',
      text: 'Fractured',
      value: null,
      min: null,
      max: null,
      enabled: false,
      chipState: hasFracturedMod ? 'yes' : undefined,
      type: 'misc',
    })
  }

  // Influence chips (skip for maps -- map influences use implicit stats, not misc_filters)
  if (itemInfo.influence && itemInfo.influence.length > 0 && itemInfo.itemClass !== 'Maps') {
    const defaultOn = new Set(['Elder', 'Shaper', 'Crusader', 'Redeemer', 'Hunter', 'Warlord'])
    for (const inf of itemInfo.influence) {
      out.push({
        id: `misc.influence_${inf.toLowerCase().replace(/\s+/g, '_')}`,
        text: inf,
        value: null,
        min: null,
        max: null,
        enabled: defaultOn.has(inf),
        type: 'misc',
      })
    }
  }

  return out
}
