import type { AdvancedMod } from '../../../shared/types'
import type { StatFilter } from '../trade'
import type { DefenseValues, ItemInfo } from './context'
import { deriveContext } from './context'
import { ITEM_CLASS_TO_CATEGORY } from './item-classes'
import { buildAtzoatlFilters } from './producers/atzoatl'
import { buildBaseTypeFilter } from './producers/base-type'
import { buildDefenseFilters } from './producers/defenses'
import { buildEnchantFilters } from './producers/enchants'
import { processExplicits } from './producers/explicits'
import { buildGemFilters } from './producers/gems'
import { buildHeistFilters } from './producers/heist'
import { buildImbueFilters } from './producers/imbues'
import { processImplicits } from './producers/implicits'
import { postProcessInscribedUltimatum } from './producers/inscribed-ultimatum'
import { buildLogbookFilters } from './producers/logbook'
import { buildMapFilters } from './producers/maps'
import { buildMiscFilters } from './producers/misc'
import { emitPseudoFilters } from './producers/pseudo-emit'
import { buildSocketFilters } from './producers/sockets'
import { buildStoredExperienceFilters } from './producers/stored-experience'
import { buildTimelessFilters } from './producers/timeless'
import { buildUltimatumFilters } from './producers/ultimatum'
import { buildWeaponDpsFilters } from './producers/weapon-dps'
import { _resetPseudoMap, ensurePseudoMapBuilt } from './pseudo'
import type { StatEntry } from './stats-cache'
import { _setStatEntries } from './stats-cache'

export { matchModToStat } from './mod-matcher'
export { ensureStatsLoaded } from './stats-cache'
export { ITEM_CLASS_TO_CATEGORY }

// ─── Stat Matcher ─────────────────────────────────────────────────────────────

/** Test hook: seed the in-memory stat list without making network calls.
 *  No-op in production -- callers must use ensureStatsLoaded(). Also clears
 *  the lazily-built pseudo map so it rebuilds from the new entries. */
export function _setStatEntriesForTests(entries: StatEntry[]): void {
  _setStatEntries(entries)
  _resetPseudoMap()
}

export function matchItemMods(
  explicits: string[],
  implicits: string[],
  defenses?: DefenseValues,
  itemInfo?: ItemInfo,
  advancedMods?: AdvancedMod[],
  defaultPercent = 90,
): StatFilter[] {
  ensurePseudoMapBuilt()
  const ctx = deriveContext({ implicits, explicits, itemInfo, defenses, advancedMods, defaultPercent })

  const implicitsFilters = processImplicits(ctx)
  const explicitsFilters = processExplicits(ctx)
  const pseudoFilters = emitPseudoFilters(ctx.pseudoAccumulator, ctx.pct)

  // Quality normalization: scale stats to 20% quality if item is below 20%
  // Quality affects base phys damage on weapons and base armour/evasion/ES on armour
  const quality = itemInfo?.quality ?? 0
  const qualityNorm = quality < 20 ? 1.2 / (1 + quality / 100) : 1

  // Add defense filters as special "defence" type
  const defenseFilters = buildDefenseFilters(defenses, qualityNorm, ctx.pct)

  // Add weapon DPS filters
  const weaponFilters = buildWeaponDpsFilters(itemInfo, qualityNorm, ctx.pct)

  // Process imbue lines (gem imbued supports)
  const imbueFilters = buildImbueFilters(itemInfo)

  // Process enchant lines (cluster jewel enchantments)
  const enchantFilters = buildEnchantFilters(itemInfo)

  // Socket chips (rune, white, abyssal, links)
  const socketFilters = buildSocketFilters(itemInfo, advancedMods)

  // Base type chip
  const baseTypeFilters = buildBaseTypeFilter(itemInfo)

  // Gem level, transfigured, and gem-quality chips
  const gemFilters = buildGemFilters(itemInfo)

  // Heist job, area level, and wings revealed filters
  const heistFilters = buildHeistFilters(itemInfo)

  // Facetor's Lens stored experience
  const storedExperienceFilters = buildStoredExperienceFilters(itemInfo?.storedExperience)

  // Inscribed Ultimatum chips
  const ultimatumFilters = buildUltimatumFilters(itemInfo)

  // Logbook faction and boss chips
  const logbookFilters = buildLogbookFilters(itemInfo)

  // Chronicle of Atzoatl room chips
  const atzoatlFilters = buildAtzoatlFilters(itemInfo)

  // Map property chips (Item Quantity, Rarity, Pack Size, More X, 8-mod corrupted)
  const mapFilters = buildMapFilters(itemInfo, advancedMods)

  // Timeless jewel handling: two toggleable chips - "Any Leader" and specific leader
  const timelessFilters = buildTimelessFilters(itemInfo, advancedMods, explicits)

  // Non-gem quality, ilvl, open prefix/suffix, memory strands, corrupted, rarity,
  // mirrored, unidentified, fractured, and influence chips.
  // Must come AFTER the explicit loop populates explicitsFilters (fractured-chip dependency).
  const miscFilters = buildMiscFilters(itemInfo, advancedMods, explicitsFilters)

  const combined: StatFilter[] = [
    ...weaponFilters,
    ...defenseFilters,
    ...pseudoFilters,
    ...timelessFilters,
    ...imbueFilters,
    ...enchantFilters,
    ...mapFilters,
    ...socketFilters,
    ...baseTypeFilters,
    ...gemFilters,
    ...heistFilters,
    ...storedExperienceFilters,
    ...ultimatumFilters,
    ...logbookFilters,
    ...atzoatlFilters,
    ...miscFilters,
    ...implicitsFilters,
    ...explicitsFilters,
  ]

  return postProcessInscribedUltimatum(combined, itemInfo)
}
