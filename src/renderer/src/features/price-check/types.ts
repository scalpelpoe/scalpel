import type { PoeItem, PriceInfo } from '../../../../shared/types'
import type { ModTier } from '../../../../shared/data/tiers/types'

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
  /** True when a unique mod rolled at or above its best possible value (perfect, or
   *  over-rolled by Vaal/corruption above the listed max / single value). Drives the
   *  price-check default-enable for uniques (issue #378). */
  perfectRoll?: boolean
  /** True when this mod is a curated premium mod for the item's unique (premium-mods
   *  manifest); preserved through Base mode like foulborn/perfectRoll. */
  premium?: boolean
  modTier?: number
  modRange?: { min: number; max: number }
  /** Resolved tier ladder for scrubbable affixes (single-stat or trade-averaged,
   *  non-Unique). Attached by the main-process matcher; absent when not scrubbable. */
  tierLadder?: ModTier[]
  /** Quality magnitude multiplier (e.g. 1.2) for a quality-increased mod; the tierLadder
   *  ranges are unmodified, so the renderer multiplies by this for the modified search-value space. */
  tierQualityMult?: number
  /** True when `value` was synthesized by averaging/summing/computing multiple
   *  numbers (e.g. "Adds # to #" averages, weapon DPS) rather than read as a
   *  single literal number. Such values have no meaningful decimal precision,
   *  so the price-check slider scrubs them as integers. */
  aggregated?: boolean
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
