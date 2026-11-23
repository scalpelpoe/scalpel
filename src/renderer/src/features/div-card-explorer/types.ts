export interface DivCard {
  art: string
  name: string
  price: number
  /** Absent for cards upstream could not resolve a drop weight for. */
  weight?: number
  /** Which dataset `weight` came from once wraeclast weights are applied.
   *  Absent on the raw Maps of Exile records; set by resolveWeights. */
  weightSource?: 'wraeclast' | 'mapsofexile' | 'override'
  stack: number
  reward: string
  drop: { areas: string[]; min_level: number; monsters: string[]; text: string; all_areas?: boolean }
}

export interface MapData {
  name: string
  ids: string[]
  type: string
  atlas: boolean
  levels: number[]
  rating?: { boss?: number; density?: number; layout?: number }
  icon?: string
}

/** poedb overlay written by scripts/sync-div-map-drops.js, keyed by world area id. */
export interface MapDrops {
  source: string
  generated_at: string
  maps: Record<string, { name: string; cards: { name: string; min_tier?: number }[] }>
}

export interface MapCardEntry {
  card: DivCard
  dropRate: number // weight / pool
  cardEv: number // price * dropRate -- EV contribution per map
}

export interface MapEntry {
  map: MapData
  cards: MapCardEntry[]
  totalEv: number
}

export interface TierStyle {
  border: string
  bg: string
  text: string
}

export interface Props {
  onSelectItem?: () => void
}
