import cardsData from '@shared/data/economy/div-cards.json'
import mapsData from '@shared/data/economy/div-maps.json'
import globalsData from '@shared/data/economy/div-globals.json'
import mapDropsData from '@shared/data/economy/div-map-drops.json'
import type { DivCard, MapData, MapDrops } from './types'

export const maps = mapsData as MapData[]
export const DROPPOOL_WEIGHT = (globalsData as { droppool_weight: number }).droppool_weight
export const DROPS_PER_MAP = 1000

const mapDrops = (mapDropsData as MapDrops).maps

/** Maps of Exile lags atlas rotations, so the atlas and each atlas map's card
 *  pool come from the poedb overlay (scripts/sync-div-map-drops.js) instead of
 *  MoE's `atlas` flag and per-card areas. Non-map areas (acts, bosses, league
 *  content) still come from MoE. */
export function applyMapDrops(rawCards: DivCard[], rawMaps: MapData[], drops: MapDrops['maps']): DivCard[] {
  // Every area id the overlay is authoritative for: all regular maps, current
  // or rotated out, plus whatever the overlay lists (Vaal Temple, Primordial bosses).
  const owned = new Set<string>(Object.keys(drops))
  for (const m of rawMaps) if (m.type === 'map') for (const id of m.ids) owned.add(id)

  const areasByCard = new Map<string, string[]>()
  for (const [id, entry] of Object.entries(drops)) {
    for (const c of entry.cards) {
      const list = areasByCard.get(c.name) ?? []
      list.push(id)
      areasByCard.set(c.name, list)
    }
  }

  return rawCards.map((card) => {
    const kept = card.drop.areas.filter((a) => !owned.has(a))
    const added = areasByCard.get(card.name) ?? []
    return { ...card, drop: { ...card.drop, areas: [...kept, ...added] } }
  })
}

export const cards = applyMapDrops(cardsData as DivCard[], maps, mapDrops)

export const regularMaps = maps.filter((m) => m.type === 'map' && m.ids.some((id) => id in mapDrops))
