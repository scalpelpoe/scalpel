import type { PriceEntry } from '@scalpelpoe/plugin-sdk'
import { defaultPoeItem, getItemIcon } from '@scalpelpoe/plugin-sdk'

/** Resolve a PoE CDN icon for a poe.ninja economy row. Prefer the icon attached
 *  to the price snapshot (from ninja image URLs or Scalpel's bundled sheet);
 *  fall back to the live iconMap via getItemIcon for older hosts. */
export function iconForEntry(entry: PriceEntry | string): string | null {
  if (typeof entry !== 'string' && entry.icon) return entry.icon
  const name = typeof entry === 'string' ? entry : entry.name
  return getItemIcon(defaultPoeItem({ name, baseType: name }, 2))
}
