import { chaosIcon, divineIcon } from '../../shared/icons'
import { MapCardEntry, MapEntry } from './types'
import { cards, regularMaps, DROPPOOL_WEIGHT } from './constants'

export function buildMapEntries(_divineRate: number): MapEntry[] {
  return regularMaps
    .map((m) => {
      const mapCards: MapCardEntry[] = []
      for (const card of cards) {
        if (card.weight <= 0 || card.price <= 0) continue
        const dropsHere = card.drop.all_areas || card.drop.areas.some((a) => m.ids.includes(a))
        if (!dropsHere) continue
        const dropRate = card.weight / DROPPOOL_WEIGHT
        const cardEv = card.price * dropRate
        mapCards.push({ card, dropRate, cardEv })
      }
      mapCards.sort((a, b) => b.cardEv - a.cardEv)
      const totalEv = mapCards.reduce((sum, c) => sum + c.cardEv, 0)
      return { map: m, cards: mapCards, totalEv }
    })
    .sort((a, b) => b.totalEv - a.totalEv)
}

export function formatPrice(v: number, divineRate: number): { text: string; icon: string } {
  if (divineRate > 0 && v >= divineRate) {
    const d = v / divineRate
    return { text: d >= 100 ? Math.round(d).toString() : parseFloat(d.toFixed(1)).toString(), icon: divineIcon }
  }
  if (v < 0.01) return { text: '0', icon: chaosIcon }
  return { text: v >= 100 ? Math.round(v).toString() : parseFloat(v.toFixed(1)).toString(), icon: chaosIcon }
}

export function formatEv(v: number): string {
  if (v < 0.1) return '0'
  return v >= 100 ? Math.round(v).toString() : parseFloat(v.toFixed(1)).toString()
}

export function computeEvBarColor(evRatio: number): string {
  let r: number, g: number
  if (evRatio < 0.15) {
    r = 200
    g = 40
  } else if (evRatio < 0.35) {
    const t = (evRatio - 0.15) / 0.2
    r = 200
    g = Math.round(40 + t * 100)
  } else if (evRatio < 0.65) {
    const t = (evRatio - 0.35) / 0.3
    r = Math.round(200 - t * 20)
    g = Math.round(140 + t * 40)
  } else {
    const t = (evRatio - 0.65) / 0.35
    r = Math.round(180 - t * 140)
    g = Math.round(180)
  }
  return `rgb(${r},${g},40)`
}

export function computeEvBarRGB(evRatio: number): { r: number; g: number } {
  if (evRatio < 0.15) {
    return { r: 200, g: 40 }
  } else if (evRatio < 0.35) {
    const t = (evRatio - 0.15) / 0.2
    return { r: 200, g: Math.round(40 + t * 100) }
  } else if (evRatio < 0.65) {
    const t = (evRatio - 0.35) / 0.3
    return { r: Math.round(200 - t * 20), g: Math.round(140 + t * 40) }
  } else {
    const t = (evRatio - 0.65) / 0.35
    return { r: Math.round(180 - t * 140), g: Math.round(180) }
  }
}
