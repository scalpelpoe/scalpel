// src/main/learning/context-key.ts
import type { PoeItem } from '../../shared/types'
import { isClusterJewel } from '../../shared/poe-item'
import { ARMOUR_CLASSES, WEAPON_CLASSES } from '../trade/stat-matcher/item-classes'
import type { LearningContext } from './types'

export const GLOBAL_KEY = 'g'

const TWO_HAND_CLASSES = new Set(['Bows', 'Staves', 'Two Hand Axes', 'Two Hand Maces', 'Two Hand Swords', 'Warstaves'])
// Weapon classes used to cast spells rather than make attacks.
const CASTER_CLASSES = new Set(['Wands', 'Sceptres', 'Staves', 'Warstaves'])

function armourArchetype(item: PoeItem): string | null {
  const parts: string[] = []
  // Canonical order str/dex/int - do not reorder; persisted rung keys depend on it.
  if (item.armour > 0) parts.push('str')
  if (item.evasion > 0) parts.push('dex')
  if (item.energyShield > 0) parts.push('int')
  if (parts.length === 0) return null
  return parts.join('/')
}

function weaponFunction(item: PoeItem): string {
  const hand = TWO_HAND_CLASSES.has(item.itemClass) ? '2h' : '1h'
  const use = CASTER_CLASSES.has(item.itemClass) ? 'caster' : 'attack'
  return `${hand}:${use}`
}

function jewelSubtype(item: PoeItem): string {
  if (isClusterJewel(item)) return 'cluster'
  if (item.baseType === 'Timeless Jewel') return 'timeless' // Timeless Jewels are a PoE1 mechanic
  if (item.baseType.endsWith('Eye Jewel')) return 'abyss'
  return 'regular'
}

export function relevanceAxisFor(item: PoeItem): string | null {
  if (ARMOUR_CLASSES.has(item.itemClass)) return armourArchetype(item)
  if (WEAPON_CLASSES.has(item.itemClass)) return weaponFunction(item)
  if (item.itemClass === 'Jewels') return jewelSubtype(item)
  return null
}

export function deriveLearningContext(item: PoeItem): LearningContext {
  if (item.rarity === 'Unique') {
    return {
      rarity: item.rarity,
      itemClass: item.itemClass,
      relevanceAxis: null,
      influence: [],
      uniqueName: item.name,
      rungKeys: [GLOBAL_KEY, `u|${item.name}`],
    }
  }
  const axis = relevanceAxisFor(item)
  const influence = [...(item.influence ?? [])].sort()
  const rungClass = `${item.rarity}|${item.itemClass}`
  const rungAxis = `${rungClass}|${axis ?? '-'}`
  const rungInfluence = `${rungAxis}|${influence.length ? influence.join(',') : '-'}`
  return {
    rarity: item.rarity,
    itemClass: item.itemClass,
    relevanceAxis: axis,
    influence,
    rungKeys: [GLOBAL_KEY, rungClass, rungAxis, rungInfluence],
  }
}
