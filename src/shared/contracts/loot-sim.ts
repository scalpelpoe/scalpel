import type { Visibility } from './core'
import type { FilterAction } from './items'

export interface LootSimDropStyle {
  visibility: Visibility
  actions: FilterAction[]
  continue: boolean
}

export interface LootSimAlert {
  kind: 'builtin' | 'custom' | 'none'
  value?: string
  volume?: string
}

export interface LootSimDrop {
  id: string
  name: string
  baseType: string
  itemClass: string
  hidden: boolean
  blocks: LootSimDropStyle[] | null
  alert: LootSimAlert
  x: number
  y: number
}

export interface LootSimPoolItem {
  name: string
  baseType: string
  itemClass: string
  rarity?: 'Normal' | 'Magic' | 'Rare' | 'Unique' | 'Gem' | 'Currency'
}

export interface LootSimRequest {
  pool: LootSimPoolItem[]
  count: number
  seed?: number
  areaLevel?: number
}

export interface LootSimResult {
  drops: LootSimDrop[]
  shown: number
  hidden: number
}
