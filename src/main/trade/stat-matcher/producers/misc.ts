import { getPoeVersion } from '@main/game-state'
import { SKILL_GEM_CLASSES } from '@shared/poe-item'
import type { AdvancedMod } from '@shared/types'
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
  unidentifiedTier?: number
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
  } else if (itemInfo.isSynthetic && itemInfo.rarity !== 'Currency') {
    // Synthetic items have a placeholder ilvl that's meaningless. Render as an
    // editable row pre-set to 83 (typical T16 map level) so users price-checking
    // for dust can lift the ilvl floor without first having to enable a chip.
    // Currency-rarity synthetics (sister-overlay currency/fragments/etc.) are
    // skipped: an ilvl filter matches no currency listing, so it broke their
    // trade search outright (#418).
    // Type 'gem' (instead of 'misc') routes the filter through StatFilterRow
    // rendering -- 'misc' goes through FilterChip. trade.ts dispatches by id to
    // the right API group per game: misc_filters on PoE1, type_filters on PoE2
    // (PoE2 indexes ilvl under type_filters; see the #436 routing in trade.ts).
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

  // PoE2 unidentified-item tier. type 'gem' routes through StatFilterRow for an
  // editable min/max pair (same trick as the synthetic ilvl row) while still
  // landing in the misc_filters group server-side (trade.ts dispatches by id).
  // Only PoE2 unid drops carry a tier, so presence of the field is the gate.
  if (itemInfo.unidentifiedTier != null) {
    out.push({
      id: 'misc.unidentified_tier',
      text: 'Unid Tier',
      value: itemInfo.unidentifiedTier,
      min: itemInfo.unidentifiedTier,
      max: itemInfo.unidentifiedTier,
      enabled: true,
      type: 'gem',
    })
  }

  // Open prefix/suffix chips (from advanced mod data, non-uniques only).
  // PoE1: crafted affixes count as "empty" since a bench craft is scour-able -- a
  // crafted suffix plus a literally-empty suffix is counted as 2 open suffixes.
  // PoE2: crafted affixes aren't trivially replaced, so they occupy their slot like
  // any other affix and are not counted as open.
  // Normal (white) items are skipped: every affix is open by definition, so the
  // chips just restate what the rarity already implies.
  if (advancedMods && advancedMods.length > 0 && itemInfo.rarity !== 'Unique' && itemInfo.rarity !== 'Normal') {
    const craftedOccupies = getPoeVersion() === 2
    const occupies = (m: AdvancedMod): boolean => craftedOccupies || !m.crafted
    const prefixCount = advancedMods.filter((m) => m.type === 'prefix' && occupies(m)).length
    const suffixCount = advancedMods.filter((m) => m.type === 'suffix' && occupies(m)).length
    // Max affixes per slot: Magic items cap at 1 prefix + 1 suffix regardless of
    // base; rare gear is 3, rare jewels 2.
    const isJewel = itemInfo.itemClass === 'Jewels' || itemInfo.itemClass === 'Abyss Jewels'
    const maxAffix = itemInfo.rarity === 'Magic' ? 1 : isJewel ? 2 : 3
    let maxPrefixes = maxAffix
    let maxSuffixes = maxAffix
    // PoE2 items can carry implicits that grant or remove allowed affix slots,
    // e.g. "-1 Prefix Modifier allowed" / "+1 Suffix Modifier allowed".
    for (const m of advancedMods) {
      for (const line of m.lines) {
        const allow = line.match(/([+-]\d+)\s+(Prefix|Suffix)\s+Modifiers?\s+allowed/i)
        if (!allow) continue
        const delta = parseInt(allow[1], 10)
        if (allow[2].toLowerCase() === 'prefix') maxPrefixes += delta
        else maxSuffixes += delta
      }
    }
    const openPrefixes = maxPrefixes - prefixCount
    const openSuffixes = maxSuffixes - suffixCount
    if (openPrefixes > 0) {
      out.push({
        id: 'pseudo.pseudo_number_of_empty_prefix_mods',
        text: `Open Prefix (${openPrefixes})`,
        value: openPrefixes,
        min: openPrefixes,
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
        min: openSuffixes,
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
