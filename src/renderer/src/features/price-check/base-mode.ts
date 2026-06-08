import type { StatFilter } from './types'

/** Item classes that default to "Base" search mode on price check open.
 *  These items don't have useful mod filters for pricing (blueprints priced by rooms, etc). */
export const BASE_DEFAULT_ITEM_CLASSES = new Set(['Blueprints', 'Contracts'])

/** PoE2 equipment-category classes whose explicit "affixes" are not player-craftable gear
 *  prefixes/suffixes -- waystone/tablet map mods, sanctum relic mods, flask mods. Crafting
 *  Ready must skip these: force-enabling those explicits over-constrains the search to an
 *  unmatchable degree. Jewels are intentionally NOT excluded -- they craft like gear (open
 *  prefix/suffix on a magic base). */
export const CRAFTING_READY_EXCLUDED_CLASSES = new Set(['Waystones', 'Tablet', 'Relics', 'Flasks'])

const OPEN_PREFIX_ID = 'pseudo.pseudo_number_of_empty_prefix_mods'
const OPEN_SUFFIX_ID = 'pseudo.pseudo_number_of_empty_suffix_mods'

/** The open-affix chip (Open Prefix / Open Suffix) for the strictly-emptier side -- the slot a
 *  crafter will fill. Returns null on a tie (no clearly-open side) or when neither chip exists.
 *  The producer's counts are against the rare 3/3 max, so a one-mod magic item has a clear
 *  emptier side while a fully-rolled (prefix+suffix) magic item ties and gets nothing. */
function higherOpenAffixId(filters: StatFilter[]): string | null {
  const prefix = filters.find((f) => f.id === OPEN_PREFIX_ID)?.value ?? null
  const suffix = filters.find((f) => f.id === OPEN_SUFFIX_ID)?.value ?? null
  if (prefix !== null && (suffix === null || prefix > suffix)) return OPEN_PREFIX_ID
  if (suffix !== null && (prefix === null || suffix > prefix)) return OPEN_SUFFIX_ID
  return null
}

/** Returns true if implicit/enchant filters should stay enabled in Base mode.
 *  For uniques, implicits are only meaningful when the item is corrupted (variable roll). */
export function shouldIncludeImplicitsInBase(rarity: string, corrupted: boolean): boolean {
  return rarity !== 'Unique' || corrupted
}

/** A unique explicit rolled at or above its best possible value -- perfect, or over-rolled
 *  (Vaal/corruption) above the listed max or single value. The producer flags these via
 *  `perfectRoll` (it owns the authoritative roll range). Base mode auto-enables them so the
 *  default search prices the best-roll copy (issue #378). Like foulborn, they count as part
 *  of the base signature, so the Base-state detector excludes them. */
export function isPerfectUniqueRoll(f: StatFilter, rarity: string): boolean {
  return rarity === 'Unique' && !!f.perfectRoll
}

/**
 * Transforms a filter list to the "Base" search state:
 *   - basetype enabled
 *   - ilvl enabled for non-uniques (rare crafting bases key on ilvl); for
 *     uniques the roll pool is fixed per item regardless of drop level, so
 *     ilvl just over-constrains the search and filters out valid listings
 *   - implicits/enchants enabled only if useful (non-unique or corrupted unique)
 *   - foulborn mods enabled on uniques
 *   - perfect-or-over-rolled unique explicits enabled, pinned to their exact roll (issue #378)
 *   - socket/misc/timeless/fractured/currency/heist left unchanged
 *   - learned chips (set by the adaptive-defaults engine) preserved as-is
 *   - everything else disabled (explicit, pseudo, defence, weapon, etc)
 */
export function applyBaseModeToFilters(
  filters: StatFilter[],
  rarity: string,
  corrupted: boolean,
  opts: { keepExplicits?: boolean } = {},
): StatFilter[] {
  const includeImplicits = shouldIncludeImplicitsInBase(rarity, corrupted)
  const isUnique = rarity === 'Unique'
  return filters.map((f) => {
    // Chips the adaptive-defaults engine deliberately set (learned) win over base mode;
    // otherwise base mode would clobber the user's learned default (e.g. dex on a unique).
    if (f.learned) return f
    if (f.id === 'misc.basetype') return { ...f, enabled: true }
    if (f.id === 'misc.ilvl') return { ...f, enabled: !isUnique, chipState: isUnique ? undefined : ('min' as const) }
    // Memory strands are an intrinsic property of the item base (like ilvl), so
    // preserve them in Base mode -- otherwise a base-search on a 40-strand chest
    // returns every Astral Plate regardless of strand count.
    if (f.id === 'misc.memory_level') return { ...f, enabled: true }
    if (f.type === 'implicit' || f.type === 'enchant') return { ...f, enabled: includeImplicits }
    // Crafting Ready: keep the item's real explicit affixes ticked. Their value/min/max
    // (incl. beneficial-negative max) are already set by the producer, so only flip enabled.
    if (opts.keepExplicits && f.type === 'explicit') return { ...f, enabled: true }
    if (isUnique && f.foulborn) return { ...f, enabled: true }
    // Uniques: a mod at or above its best possible roll (perfect, or over-rolled by
    // Vaal/corruption) is what makes this copy worth more, so enable it by default pinned
    // to that exact roll -- the search then finds equally-good-or-better copies. A learned
    // chip already returned above, so this defers to the user's own decision (issue #378).
    if (isPerfectUniqueRoll(f, rarity)) return { ...f, enabled: true, min: f.value, max: null }
    // Premium mods (curated per-unique chase mods) are part of the base signature -- keep
    // them ticked through Base mode, otherwise the override computed in main is clobbered.
    if (f.premium) return { ...f, enabled: true }
    if (
      f.type === 'socket' ||
      f.type === 'misc' ||
      f.type === 'timeless' ||
      f.type === 'fractured' ||
      f.type === 'currency' ||
      f.type === 'heist' ||
      // Gem chips (level/quality/transfigured/vaal) identify *which* gem the user owns --
      // disabling Transfigured on a transfigured gem turns the base search into a
      // non-transfigured search and returns nothing.
      f.type === 'gem'
    )
      return f
    return { ...f, enabled: false }
  })
}

/** Crafting Ready = Base mode plus the item's real explicit affixes left enabled, the rarity
 *  chip constrained to the item's own rarity, and the open-affix chip for the emptier side
 *  (the slot a crafter will fill -- see higherOpenAffixId). For PoE2 white/magic crafting
 *  bases, the existing prefix/suffix are what a buyer shops for, and they want a base of the
 *  same rarity with room to craft -- not a finished rare/unique. Implicits are turned off
 *  (they are inherent to the base type, so redundant for a crafting-base search; enchants
 *  stay on -- they are not base-derived). Pseudo aggregates stay off (type 'pseudo'). */
export function applyCraftingReadyToFilters(filters: StatFilter[], rarity: string, corrupted: boolean): StatFilter[] {
  const openAffixId = higherOpenAffixId(filters)
  return applyBaseModeToFilters(filters, rarity, corrupted, { keepExplicits: true }).map((f) => {
    if (f.learned) return f
    if (f.type === 'implicit') return { ...f, enabled: false }
    if (f.id === 'misc.rarity' || f.id === openAffixId) return { ...f, enabled: true }
    return f
  })
}

/** True when the filter set matches the Crafting Ready preset: basetype + ilvl + rarity on,
 *  every explicit affix on, implicits handled per `includeImplicits`, and no other
 *  mod-style filter (pseudo, weapon, defence...) enabled. Drives the chip highlight.
 *  Learned chips are carved out of every structural check because the preset preserves
 *  the adaptive engine's decisions (it defers to `learned`), so they must not flip the match. */
export function isCraftingReadyState(filters: StatFilter[], includeImplicits: boolean): boolean {
  const rarityChip = filters.find((f) => f.id === 'misc.rarity')
  const basetypeOn = filters.some((f) => f.id === 'misc.basetype' && f.enabled)
  const ilvlOn = filters.some((f) => f.id === 'misc.ilvl' && f.enabled)
  const rarityOk = !rarityChip || rarityChip.enabled || !!rarityChip.learned
  const explicitsAllOn = filters.filter((f) => f.type === 'explicit' && !f.learned).every((f) => f.enabled)
  const implicitsOk =
    includeImplicits || !filters.some((f) => !f.learned && (f.type === 'implicit' || f.type === 'enchant') && f.enabled)
  const noOtherModsOn =
    filters.filter(
      (f) =>
        !f.learned &&
        f.type !== 'socket' &&
        f.type !== 'misc' &&
        f.type !== 'timeless' &&
        f.type !== 'fractured' &&
        f.type !== 'currency' &&
        f.type !== 'heist' &&
        f.type !== 'implicit' &&
        f.type !== 'enchant' &&
        f.type !== 'explicit' &&
        f.type !== 'gem' &&
        !f.foulborn &&
        f.enabled,
    ).length === 0
  return basetypeOn && ilvlOn && rarityOk && explicitsAllOn && implicitsOk && noOtherModsOn
}
