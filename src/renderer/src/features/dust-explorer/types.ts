export interface DustEntry {
  name: string
  baseType: string
  dustIlvl84: number
  slots: number
  chaosValue: number | null
  dustPerChaos: number | null
  dustPerChaosPerSlot: number | null
  iconUrl: string | null
}

export type SortKey = 'name' | 'chaosValue' | 'dustIlvl84' | 'dustPerChaos' | 'dustPerChaosPerSlot'
export type SortDir = 'asc' | 'desc'

export type FilterType = 'name' | 'chaosValue' | 'dustIlvl84' | 'dustPerChaos' | 'dustPerChaosPerSlot'

export interface ActiveFilter {
  type: FilterType
  // For name: search string. For range: [min, max] as slider positions (0-1000)
  value: string
  min: number
  max: number
}
