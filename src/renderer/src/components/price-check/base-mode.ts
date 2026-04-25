import type { StatFilter } from './types'

/** Item classes that default to "Base" search mode on price check open.
 *  These items don't have useful mod filters for pricing (blueprints priced by rooms, etc). */
export const BASE_DEFAULT_ITEM_CLASSES = new Set(['Blueprints', 'Contracts'])

/** Returns true if implicit/enchant filters should stay enabled in Base mode.
 *  For uniques, implicits are only meaningful when the item is corrupted (variable roll). */
export function shouldIncludeImplicitsInBase(rarity: string, corrupted: boolean): boolean {
  return rarity !== 'Unique' || corrupted
}

/**
 * Transforms a filter list to the "Base" search state:
 *   - basetype + ilvl enabled
 *   - implicits/enchants enabled only if useful (non-unique or corrupted unique)
 *   - foulborn mods enabled on uniques
 *   - socket/misc/timeless/fractured/currency/heist left unchanged
 *   - everything else disabled (explicit, pseudo, defence, weapon, etc)
 */
export function applyBaseModeToFilters(filters: StatFilter[], rarity: string, corrupted: boolean): StatFilter[] {
  const includeImplicits = shouldIncludeImplicitsInBase(rarity, corrupted)
  return filters.map((f) => {
    if (f.id === 'misc.basetype' || f.id === 'misc.ilvl') return { ...f, enabled: true }
    if (f.type === 'implicit' || f.type === 'enchant') return { ...f, enabled: includeImplicits }
    if (rarity === 'Unique' && f.foulborn) return { ...f, enabled: true }
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
