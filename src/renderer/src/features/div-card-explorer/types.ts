export interface DivCard {
  art: string
  name: string
  price: number
  weight: number
  stack: number
  reward: string
  drop: { areas: string[]; min_level: number; monsters: string[]; text: string; all_areas?: boolean }
  weightEstimated?: boolean
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
