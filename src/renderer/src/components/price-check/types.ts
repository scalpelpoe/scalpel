import type { PoeItem, PriceInfo } from '../../../../shared/types'

export interface StatFilter {
  id: string
  text: string
  value: number | null
  min: number | null
  max: number | null
  enabled: boolean
  type: string
  /** Trade-API option value. For option-based stats (e.g. ultimatum chips),
   *  this is the id sent to trade - it may differ from what the user sees. */
  option?: number | string
  /** Human-readable text shown in the row's value box for option-based chips
   *  (e.g. "Defeat waves of enemies"), separate from the API id in `option`
   *  ("Exterminate"). Optional - falls back to `option` when not set. */
  displayValue?: string
  foulborn?: boolean
  modTier?: number
  modRange?: { min: number; max: number }
  /** Ternary chip state: 'yes' | 'no' | undefined (= any). Also used by
   *  minmax chips: 'min' | 'max' | undefined (= off). */
  chipState?: 'yes' | 'no' | 'min' | 'max'
  /** Set true when the adaptive-defaults engine overrode this chip's enabled state. */
  learned?: boolean
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
    enchantMods?: string[]
    fracturedMods?: string[]
    foulbornMods?: string[]
    craftedMods?: string[]
    ilvl?: number
    sockets?: Array<{ group: number; sColour: string }>
    gemLevel?: number
    quality?: number
    areaLevel?: number
    heistJob?: { skill: string; level: number }
    corrupted?: boolean
    mirrored?: boolean
    identified?: boolean
    templeOpenRooms?: string[]
    templeObstructedRooms?: string[]
    storedExperience?: number
    modTiers?: Record<string, { tier: string; name: string; ranges: string }>
    rarity?: string
    armour?: number
    evasion?: number
    energyShield?: number
    pdps?: number
    edps?: number
    dps?: number
    mapProperties?: Array<{ name: string; value: string }>
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
  poeVersion: 1 | 2
  chaosPerDivine?: number
  unidCandidates?: Array<{ name: string; chaosValue: number }>
  sessionId: number
  learnedDecisions: Record<string, boolean>
  onClose: () => void
  onOpenWiki?: () => void
  onOpenPoeDb?: () => void
  onOpenNinja?: () => void
}
