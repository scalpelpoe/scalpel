import type { PoeItem } from '../../../shared/types'
import { iconMap, divCardArtMap } from './constants'

export function formatPrice(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  if (value >= 10) return String(Math.round(value))
  if (value >= 1) return value.toFixed(1)
  return value.toFixed(2)
}

export function formatDust(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`
  return String(value)
}

export function getItemIcon(item: PoeItem): string | null {
  // Divination cards: use CDN card art
  if (item.itemClass === 'Divination Cards') {
    const art = divCardArtMap.get(item.baseType) ?? divCardArtMap.get(item.name)
    if (art) return `https://web.poecdn.com/image/divination-card/${art}.png`
  }
  // Try exact name first (unique maps, special items)
  if (iconMap[item.name]) return iconMap[item.name]
  // Strip Foulborn/Imbued prefix for unique variant lookups
  const strippedName = item.name.replace(/^(Foulborn|Imbued) /, '')
  if (strippedName !== item.name && iconMap[strippedName]) return iconMap[strippedName]
  // Map variants: blighted/zana have distinct icons keyed by prefix
  if (item.itemClass === 'Maps' && item.baseType.startsWith('Map (Tier')) {
    if (item.zanaMemory) {
      const zanaKey = `Zana ${item.baseType}`
      if (iconMap[zanaKey]) return iconMap[zanaKey]
    }
    if (item.blighted) {
      const blightKey = `Blighted ${item.baseType}`
      if (iconMap[blightKey]) return iconMap[blightKey]
    }
  }
  if (iconMap[item.baseType]) return iconMap[item.baseType]
  // Magic items: name includes affixes, try substrings against icon map
  const words = item.name.split(' ')
  for (let len = words.length; len > 0; len--) {
    for (let start = 0; start + len <= words.length; start++) {
      const candidate = words.slice(start, start + len).join(' ')
      if (iconMap[candidate]) return iconMap[candidate]
    }
  }
  return null
}
