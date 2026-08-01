import { isEndgameFilterIndexed } from '../../endgame-filter-support'
import type { AdvancedMod } from '@shared/types'
import type { StatFilter } from '../../trade'

/** "Fuzz floor" applied to a map/waystone/chart property when searching: accept
 *  listings down to 90% of the item's value so near-identical rolls match.
 *  Exported for the chart producer, which applies the same floor to map_iiq. */
export const MAP_MIN = (v: number): number => Math.floor(v * 0.9)

type MapItemInfo = {
  itemClass?: string
  rarity?: string
  mapTier?: number
  mapQuantity?: number
  mapRarity?: number
  mapPackSize?: number
  mapMoreScarabs?: number
  mapMoreCurrency?: number
  mapMoreMaps?: number
  mapMoreDivCards?: number
  mapReward?: string
  mapRevives?: number
  mapDropChance?: number
  mapGold?: number
  mapMagicMonsters?: number
  mapRareMonsters?: number
}

/** The PoE2 trade2 "Endgame Filters" group, in display order. Whether GGG actually
 *  indexes each key for search is NOT encoded here -- it changes league to league and
 *  is sourced from the remote-overridable allowlist (isEndgameFilterIndexed), so a
 *  chip can be re-enabled without an app release. As of 2026-06 (live-probed on Runes
 *  of Aldur) map_tier, map_packsize, map_iir, map_revives, map_bonus, map_magic_monsters
 *  and map_rare_monsters return results; map_iiq and map_gold still come back empty.
 *  `map_experience` has no clipboard field yet, so it is omitted rather than listed
 *  with a dangling `field`. */
interface WaystoneEndgameFilter {
  field: keyof MapItemInfo
  id: string
  label: string
  enabledByDefault?: boolean
  exact?: boolean
}

const WAYSTONE_ENDGAME_FILTERS: readonly WaystoneEndgameFilter[] = [
  { field: 'mapTier', id: 'map.map_tier', label: 'Tier', enabledByDefault: true, exact: true },
  { field: 'mapPackSize', id: 'map.map_packsize', label: 'Pack Size', enabledByDefault: true },
  { field: 'mapQuantity', id: 'map.map_iiq', label: 'Quantity' },
  { field: 'mapRarity', id: 'map.map_iir', label: 'Rarity', enabledByDefault: true },
  { field: 'mapRevives', id: 'map.map_revives', label: 'Revives' },
  { field: 'mapDropChance', id: 'map.map_bonus', label: 'Drop Chance' },
  { field: 'mapGold', id: 'map.map_gold', label: 'Gold' },
  { field: 'mapMagicMonsters', id: 'map.map_magic_monsters', label: 'Monster Effectiveness', enabledByDefault: true },
  { field: 'mapRareMonsters', id: 'map.map_rare_monsters', label: 'Monster Rarity', enabledByDefault: true },
]

// Map property chips (Item Quantity, Rarity, Pack Size, More X) and modifier-count scrubber
export function buildMapFilters(itemInfo: MapItemInfo | undefined, advancedMods?: AdvancedMod[]): StatFilter[] {
  const out: StatFilter[] = []

  if (itemInfo && itemInfo.itemClass === 'Maps' && itemInfo.rarity === 'Rare') {
    if (itemInfo.mapQuantity)
      out.push({
        id: 'map.map_iiq',
        text: `Quantity: +${itemInfo.mapQuantity}%`,
        value: itemInfo.mapQuantity,
        min: MAP_MIN(itemInfo.mapQuantity),
        max: null,
        enabled: true,
        type: 'map',
      })
    if (itemInfo.mapRarity)
      out.push({
        id: 'map.map_iir',
        text: `Rarity: +${itemInfo.mapRarity}%`,
        value: itemInfo.mapRarity,
        min: MAP_MIN(itemInfo.mapRarity),
        max: null,
        enabled: false,
        type: 'map',
      })
    if (itemInfo.mapPackSize)
      out.push({
        id: 'map.map_packsize',
        text: `Pack Size: +${itemInfo.mapPackSize}%`,
        value: itemInfo.mapPackSize,
        min: MAP_MIN(itemInfo.mapPackSize),
        max: null,
        enabled: true,
        type: 'map',
      })
    // More Scarabs/Currency/Maps/Div Cards are pseudo stats
    if (itemInfo.mapMoreScarabs)
      out.push({
        id: 'pseudo.pseudo_map_more_scarab_drops',
        text: `More Scarabs: +${itemInfo.mapMoreScarabs}%`,
        value: itemInfo.mapMoreScarabs,
        min: MAP_MIN(itemInfo.mapMoreScarabs),
        max: null,
        enabled: true,
        type: 'map',
      })
    if (itemInfo.mapMoreCurrency)
      out.push({
        id: 'pseudo.pseudo_map_more_currency_drops',
        text: `More Currency: +${itemInfo.mapMoreCurrency}%`,
        value: itemInfo.mapMoreCurrency,
        min: MAP_MIN(itemInfo.mapMoreCurrency),
        max: null,
        enabled: true,
        type: 'map',
      })
    if (itemInfo.mapMoreMaps)
      out.push({
        id: 'pseudo.pseudo_map_more_map_drops',
        text: `More Maps: +${itemInfo.mapMoreMaps}%`,
        value: itemInfo.mapMoreMaps,
        min: MAP_MIN(itemInfo.mapMoreMaps),
        max: null,
        enabled: true,
        type: 'map',
      })
    if (itemInfo.mapMoreDivCards)
      out.push({
        id: 'pseudo.pseudo_map_more_card_drops',
        text: `More Div Cards: +${itemInfo.mapMoreDivCards}%`,
        value: itemInfo.mapMoreDivCards,
        min: MAP_MIN(itemInfo.mapMoreDivCards),
        max: null,
        enabled: true,
        type: 'map',
      })
    if (itemInfo.mapReward)
      out.push({
        id: 'map.map_completion_reward',
        text: `Reward: ${itemInfo.mapReward}`,
        value: null,
        min: null,
        max: null,
        enabled: true,
        type: 'map',
        option: itemInfo.mapReward,
      })
  }

  // PoE2 waystones: surface the property block as map_filter chips, one per entry
  // in WAYSTONE_ENDGAME_FILTERS. We only emit a chip whose trade2 key GGG actually
  // indexes -- isEndgameFilterIndexed consults the remote-overridable allowlist, so
  // an unindexed key is suppressed (a search using it comes back empty) until a push
  // to main re-enables it (re-probe first; see scripts/local/cloak/probe-waystone-
  // filters.mjs). The per-waystone monster affixes still flow through the normal
  // explicit matcher. No rarity gate: tier is a base property present on white/magic
  // waystones too, and the per-property value guard skips affix-only chips on lower
  // rarities.
  if (itemInfo && itemInfo.itemClass === 'Waystones') {
    for (const f of WAYSTONE_ENDGAME_FILTERS) {
      if (!isEndgameFilterIndexed(f.id)) continue // unindexed on trade2 -- hidden until GGG supports it
      const value = itemInfo[f.field]
      if (typeof value !== 'number' || value === 0) continue
      out.push({
        id: f.id,
        text: `${f.label}: ${value}`,
        value,
        min: f.exact ? value : MAP_MIN(value),
        max: f.exact ? value : null,
        enabled: f.enabledByDefault ?? false,
        type: 'map',
      })
    }
  }

  // Modifier-count scrubber chip for PoE1 rare Maps and PoE2 rare Waystones.
  // More affixes = more valuable: a Rare map/waystone with all 8 affixes (4 prefix + 4 suffix)
  // commands a significant premium. The chip is prefilled to the item's actual affix count via
  // `min`, so the user can scrub the minimum down to broaden the search. Default-on only at 8
  // (full rolls); lower counts are present but disabled so the user can opt in.
  // Implicits are excluded from the count - they are not affixes.
  // Requires an advanced-mode clipboard copy (Ctrl+Alt+C) so that advancedMods carries
  // type 'prefix' | 'suffix' labels; a basic copy leaves advancedMods empty and emits no chip.
  // Covers both PoE1 Maps and PoE2 Waystones - trade2 indexing of this pseudo stat for
  // waystones was probe-confirmed (no remote-allowlist gating needed).
  if (
    itemInfo &&
    (itemInfo.itemClass === 'Maps' || itemInfo.itemClass === 'Waystones') &&
    itemInfo.rarity === 'Rare' &&
    advancedMods &&
    advancedMods.length > 0
  ) {
    const modCount =
      advancedMods.filter((m) => m.type === 'prefix').length + advancedMods.filter((m) => m.type === 'suffix').length
    if (modCount >= 1) {
      out.push({
        id: 'pseudo.pseudo_number_of_affix_mods',
        text: `Modifiers: ${modCount}`,
        value: modCount,
        min: modCount,
        max: null,
        enabled: modCount >= 8,
        // type 'map' (not 'misc') so the price-check panel renders this as a
        // scrubbable StatFilterRow rather than a toggle-only FilterChip. The
        // trade query still includes it via miscPseudoIds (keyed on the id), so
        // the type only drives UI placement here.
        type: 'map',
      })
    }
  }

  return out
}
