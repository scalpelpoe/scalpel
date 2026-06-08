export interface PresetColor {
  name: string
  value: string
}

/** Fixed swatch set for the save-panel color dropdown. Tuned to read well on
 *  the dark overlay background. The picker also offers a neutral (undefined). */
export const PRESET_COLORS: PresetColor[] = [
  { name: 'Red', value: '#ef5350' },
  { name: 'Orange', value: '#ffa726' },
  { name: 'Yellow', value: '#ffee58' },
  { name: 'Green', value: '#66bb6a' },
  { name: 'Teal', value: '#26c6da' },
  { name: 'Blue', value: '#42a5f5' },
  { name: 'Purple', value: '#ab47bc' },
  { name: 'Pink', value: '#ec407a' },
]

/** Pick a readable text color (near-black or white) for a swatch background,
 *  based on perceived luminance, so a fully color-tinted box stays legible. */
export function textColorForBg(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#171821' : '#ffffff'
}
