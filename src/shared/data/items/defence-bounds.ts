import raw from './defence-bounds-poe1.json'

/** Base defence roll bounds for a PoE1 armour base, from RePoE-fork
 *  (randomised base defences). Keys mirror the trade API armour_filters
 *  naming. A key is present only when that defence rolls (min < max). */
export interface DefenceBounds {
  ar?: [number, number]
  ev?: [number, number]
  es?: [number, number]
  ward?: [number, number]
}

// JSON imports widen tuple literals to number[]; pin the pair shape
// (same cast pattern as item-classes.ts).
const BOUNDS = raw as unknown as Record<string, DefenceBounds>

/** PoE1-only lookup by the clipboard base type name. Undefined for bases
 *  without rolling defences (jewellery, weapons, PoE2 bases, unknowns). */
export function getDefenceBounds(baseType: string): DefenceBounds | undefined {
  return BOUNDS[baseType]
}
