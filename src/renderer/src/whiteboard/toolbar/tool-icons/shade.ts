import { parseHex, toHex } from '@shared/color'

/** Shift a `#rrggbb` hex color toward white (positive amt) or black
 *  (negative amt). Used to derive 3D-marker shading from a single base
 *  color picked in the toolbar. */
export function shade(hex: string, amt: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex
  const [r, g, b] = parseHex(hex)
  const adj = (c: number): number => Math.max(0, Math.min(255, Math.round(c + 255 * amt)))
  return '#' + [adj(r), adj(g), adj(b)].map((x) => toHex(x)).join('')
}
