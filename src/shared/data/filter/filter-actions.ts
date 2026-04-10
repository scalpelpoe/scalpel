/** This is mostly just lists of values needed to populate
    filter actions on the filter tab                        */

// Probably need to finish naming these
export const ALERT_SOUNDS: { id: string; name: string }[] = [
  { id: '1', name: '1 - Currency Stack Plonk' },
  { id: '2', name: '2 - General Currency Plonk' },
  { id: '3', name: '3 - Important Rare Plonk' },
  { id: '4', name: 'Sound 4' },
  { id: '5', name: '5 - The Map Sound' },
  { id: '6', name: '6 - Schwing/Tink' },
  { id: '7', name: 'Sound 7' },
  { id: '8', name: 'Sound 8' },
  { id: '9', name: 'Sound 9' },
  { id: '10', name: 'Sound 10' },
  { id: '11', name: 'Sound 11' },
  { id: '12', name: 'Sound 12' },
  { id: '13', name: 'Sound 13' },
  { id: '14', name: 'Sound 14' },
  { id: '15', name: 'Sound 15' },
  { id: '16', name: 'Sound 16' },
]

export const BEAM_COLORS = ['Red', 'Green', 'Blue', 'Brown', 'White', 'Yellow', 'Cyan'] as const

export const MINIMAP_SIZES: { id: string; name: string }[] = [
  { id: '0', name: 'Large' },
  { id: '1', name: 'Medium' },
  { id: '2', name: 'Small' },
]

export const MINIMAP_COLORS = [
  'Red',
  'Green',
  'Blue',
  'Brown',
  'White',
  'Yellow',
  'Cyan',
  'Grey',
  'Orange',
  'Pink',
  'Purple',
] as const

export const MINIMAP_SHAPES: { id: string; name: string }[] = [
  { id: 'Circle', name: 'Circle' },
  { id: 'Diamond', name: 'Diamond' },
  { id: 'Hexagon', name: 'Hexagon' },
  { id: 'Square', name: 'Square' },
  { id: 'Star', name: 'Star' },
  { id: 'Triangle', name: 'Triangle' },
  { id: 'Cross', name: 'Cross' },
  { id: 'Moon', name: 'Moon' },
  { id: 'Raindrop', name: 'Raindrop' },
  { id: 'Kite', name: 'Kite' },
  { id: 'Pentagon', name: 'Pentagon' },
  { id: 'UpsideDownHouse', name: 'House' },
]

// CSS-friendly hex colors for the filter color names
export const POE_COLOR_HEX: Record<string, string> = {
  Red: '#e53935',
  Green: '#43a047',
  Blue: '#1e88e5',
  Brown: '#8d6e63',
  White: '#eeeeee',
  Yellow: '#fdd835',
  Cyan: '#00bcd4',
  Grey: '#9e9e9e',
  Orange: '#fb8c00',
  Pink: '#ec407a',
  Purple: '#ab47bc',
}

// Import all minimap icon PNGs
const shapeIconModules = import.meta.glob('../assets/minimap-icons/[A-Z][a-z]*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>
const colorIconModules = import.meta.glob('../assets/minimap-icons/*_*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

/** Get the white shape icon asset for the picker grid */
export function getShapeIconUrl(shape: string): string | undefined {
  const key = Object.keys(shapeIconModules).find((k) => k.endsWith(`/${shape}.png`))
  return key ? shapeIconModules[key] : undefined
}

/** Get the colored icon asset for preview */
export function getMinimapIconUrl(color: string, shape: string): string | undefined {
  const key = Object.keys(colorIconModules).find((k) => k.endsWith(`/${color}_${shape}.png`))
  return key ? colorIconModules[key] : undefined
}
