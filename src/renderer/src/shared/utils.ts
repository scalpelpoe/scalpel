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
  if (item.itemClass === 'Divination Cards') {
    const art = divCardArtMap.get(item.baseType) ?? divCardArtMap.get(item.name)
    if (art) return `https://web.poecdn.com/image/divination-card/${art}.png`
  }
  return iconMap[item.name] ?? iconMap[item.baseType] ?? null
}
