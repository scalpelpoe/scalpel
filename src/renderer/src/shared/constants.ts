import divCardsData from '../../../shared/data/economy/div-cards.json'
import itemIcons from '../../../shared/data/items/item-icons.json'

export const RARITY_COLORS: Record<string, string> = {
  Normal: '#c8c8c8',
  Magic: '#8888ff',
  Rare: '#ffff77',
  Unique: '#af6025',
}

export const IP = {
  theme: 'two-tone' as const,
  fill: ['currentColor', 'rgba(255,255,255,0.2)'] as [string, string],
  style: { display: 'flex' },
}

export const iconMap = itemIcons as Record<string, string>

export const divCardArtMap = new Map((divCardsData as Array<{ name: string; art: string }>).map((c) => [c.name, c.art]))
