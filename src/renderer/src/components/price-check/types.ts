import type { PoeItem, PriceInfo } from '../../../../shared/types'

export interface StatFilter {
  id: string
  text: string
  value: number | null
  min: number | null
  max: number | null
  enabled: boolean
  type: string
}

export interface Listing {
  id: string
  price: { amount: number; currency: string } | null
  account: string
  characterName?: string
  online: boolean
  instantBuyout: boolean
  icon?: string
  indexed?: string
  itemData?: {
    name?: string
    baseType?: string
    explicitMods?: string[]
    implicitMods?: string[]
    ilvl?: number
    sockets?: Array<{ group: number; sColour: string }>
    gemLevel?: number
    quality?: number
    corrupted?: boolean
    mirrored?: boolean
    identified?: boolean
    armour?: number
    evasion?: number
    energyShield?: number
    pdps?: number
    edps?: number
    dps?: number
  }
}

export interface BulkListing {
  id: string
  account: string
  characterName?: string
  online: boolean
  stock: number
  pay: { amount: number; currency: string }
  get: { amount: number; currency: string }
  ratio: number
  whisper?: string
}

export interface PriceCheckProps {
  item: PoeItem
  priceInfo?: PriceInfo
  statFilters: StatFilter[]
  league: string
  chaosPerDivine?: number
  unidCandidates?: Array<{ name: string; chaosValue: number }>
  onClose: () => void
}
