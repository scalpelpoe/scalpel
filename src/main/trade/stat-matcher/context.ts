import { SKILL_GEM_CLASSES } from '../../../shared/poe-item'
import type { AdvancedMod } from '../../../shared/types'
import { ARMOUR_CLASSES, WEAPON_CLASSES } from './item-classes'
import type { PseudoAccumulatorEntry } from './pseudo'

export interface ItemInfo {
  sockets: string
  linkedSockets: number
  quality: number
  itemLevel: number
  baseType: string
  rarity: string
  itemClass: string
  gemLevel: number
  corrupted: boolean
  mirrored: boolean
  identified?: boolean
  influence?: string[]
  mapQuantity?: number
  mapRarity?: number
  mapPackSize?: number
  mapMoreScarabs?: number
  mapMoreCurrency?: number
  mapMoreMaps?: number
  mapMoreDivCards?: number
  enchants?: string[]
  imbues?: string[]
  memoryStrands?: number
  physDamageMin?: number
  physDamageMax?: number
  eleDamageAvg?: number
  chaosDamageAvg?: number
  attacksPerSecond?: number
  critChance?: number
  heistJob?: { skill: string; level: number }
  monsterLevel?: number
  wingsRevealed?: number
  wingsTotal?: number
  mapReward?: string
  transfigured?: boolean
  synthesised?: boolean
  logbookFactions?: string[]
  logbookBosses?: string[]
  atzoatlRooms?: string[]
  atzoatlOpenCount?: number
  storedExperience?: number
  ultimatumChallenge?: string
  ultimatumRewardText?: string
  ultimatumRequired?: string
  isSynthetic?: boolean
}

export interface DefenseValues {
  armour: number
  evasion: number
  energyShield: number
  ward: number
  block: number
}

export interface MatchContext {
  // raw inputs
  implicits: string[]
  explicits: string[]
  itemInfo?: ItemInfo
  defenses?: DefenseValues
  advancedMods?: AdvancedMod[]
  // derived (computed once)
  pct: number
  isWeapon: boolean
  hasDefenses: boolean
  hasLocalMods: boolean
  isGemItem: boolean
  isTimelessJewel: boolean
  // mutable accumulator (implicits + explicits push, pseudo-emit reads)
  pseudoAccumulator: Record<string, PseudoAccumulatorEntry>
}

export function deriveContext(input: {
  implicits: string[]
  explicits: string[]
  itemInfo?: ItemInfo
  defenses?: DefenseValues
  advancedMods?: AdvancedMod[]
  defaultPercent: number
}): MatchContext {
  const { implicits, explicits, itemInfo, defenses, advancedMods, defaultPercent } = input
  const isWeapon = itemInfo ? WEAPON_CLASSES.has(itemInfo.itemClass) : false
  const hasLocalMods = !!itemInfo && (ARMOUR_CLASSES.has(itemInfo.itemClass) || WEAPON_CLASSES.has(itemInfo.itemClass))
  const isGemItem = !!itemInfo && SKILL_GEM_CLASSES.has(itemInfo.itemClass)
  const isTimelessJewel = itemInfo?.baseType === 'Timeless Jewel'
  const hasDefenses =
    !!defenses &&
    (defenses.armour > 0 ||
      defenses.evasion > 0 ||
      defenses.energyShield > 0 ||
      defenses.ward > 0 ||
      defenses.block > 0)
  return {
    implicits,
    explicits,
    itemInfo,
    defenses,
    advancedMods,
    pct: defaultPercent / 100,
    isWeapon,
    hasDefenses,
    hasLocalMods,
    isGemItem,
    isTimelessJewel,
    pseudoAccumulator: {},
  }
}
