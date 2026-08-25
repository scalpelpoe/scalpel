import itemIcons from '@shared/data/items/item-icons-poe1.json'

/** CDN art for each Timeless Jewel unique (used on the placed tree socket). */
export const TIMELESS_JEWEL_ICONS: Record<string, string> = {
  'Glorious Vanity': itemIcons['Glorious Vanity'],
  'Lethal Pride': itemIcons['Lethal Pride'],
  'Brutal Restraint': itemIcons['Brutal Restraint'],
  'Militant Faith': itemIcons['Militant Faith'],
  'Elegant Hubris': itemIcons['Elegant Hubris'],
  'Heroic Tragedy': itemIcons['Heroic Tragedy'],
  'Timeless Jewel': itemIcons['Timeless Jewel'],
}

/** jewelType from Vilsol data (1–6) → unique name */
const JEWEL_TYPE_NAMES: Record<number, string> = {
  1: 'Glorious Vanity',
  2: 'Lethal Pride',
  3: 'Brutal Restraint',
  4: 'Militant Faith',
  5: 'Elegant Hubris',
  6: 'Heroic Tragedy',
}

export function jewelIconUrl(jewelName: string | undefined | null, jewelType?: number | null): string | undefined {
  if (jewelName && TIMELESS_JEWEL_ICONS[jewelName]) {
    return TIMELESS_JEWEL_ICONS[jewelName]
  }
  if (jewelType != null && JEWEL_TYPE_NAMES[jewelType]) {
    return TIMELESS_JEWEL_ICONS[JEWEL_TYPE_NAMES[jewelType]]
  }
  return itemIcons['Timeless Jewel']
}
