/** poe.ninja PoE2 economy URL segments for Runes of Aldur. */
export interface EconomyCategory {
  slug: string
  label: string
}

export const RUNES_OF_ALDUR_ECONOMY: EconomyCategory[] = [
  { slug: 'currency', label: 'Currency' },
  { slug: 'fragments', label: 'Fragments' },
  { slug: 'abyssal-bones', label: 'Abyssal Bones' },
  { slug: 'lineage-support-gems', label: 'Lineage Support Gems' },
  { slug: 'essences', label: 'Essences' },
  { slug: 'soul-cores', label: 'Soul Cores' },
  { slug: 'idols', label: 'Idols' },
  { slug: 'runes', label: 'Runes' },
  { slug: 'omens', label: 'Omens' },
  { slug: 'expedition', label: 'Expedition' },
  { slug: 'liquid-emotions', label: 'Liquid Emotions' },
  { slug: 'breach-catalyst', label: 'Breach Catalyst' },
  { slug: 'verisium', label: 'Verisium' },
  { slug: 'unique-weapons', label: 'Unique Weapons' },
  { slug: 'unique-armours', label: 'Unique Armours' },
  { slug: 'unique-accessories', label: 'Unique Accessories' },
  { slug: 'unique-flasks', label: 'Unique Flasks' },
  { slug: 'unique-charms', label: 'Unique Charms' },
  { slug: 'unique-jewels', label: 'Unique Jewels' },
  { slug: 'unique-relics', label: 'Unique Relics' },
  { slug: 'unique-tablets', label: 'Unique Tablets' },
  { slug: 'precursor-tablets', label: 'Precursor Tablets' },
  { slug: 'uncut-gems', label: 'Uncut Gems' },
  { slug: 'unique-maps', label: 'Unique Maps' },
]

export const ECONOMY_SLUGS = new Set(RUNES_OF_ALDUR_ECONOMY.map((c) => c.slug))

export function categoryLabel(slug: string): string {
  return RUNES_OF_ALDUR_ECONOMY.find((c) => c.slug === slug)?.label ?? slug
}
