import { baseToClass, classSizes } from './constants'
import baseToUniques from '@shared/data/items/unique-info.json'
import elderIcon from '../assets/influences/Elder-item-symbol.png'
import shaperIcon from '../assets/influences/Shaper-item-symbol.png'
import crusaderIcon from '../assets/influences/Crusader-item-symbol.png'
import redeemerIcon from '../assets/influences/Redeemer-item-symbol.png'
import hunterIcon from '../assets/influences/Hunter-item-symbol.png'
import warlordIcon from '../assets/influences/Warlord-item-symbol.png'
import searingExarchIcon from '../assets/influences/SearingExarch-item-symbol.png'
import eaterOfWorldsIcon from '../assets/influences/EaterOfWorlds-item-symbol.png'

export const INFLUENCE_ICONS_BY_NAME: Record<string, string> = {
  Elder: elderIcon,
  Shaper: shaperIcon,
  Crusader: crusaderIcon,
  Redeemer: redeemerIcon,
  Hunter: hunterIcon,
  Warlord: warlordIcon,
  'Searing Exarch': searingExarchIcon,
  'Eater of Worlds': eaterOfWorldsIcon,
}

const _baseToUniques = baseToUniques as Record<string, string[]>
export const uniqueToBase: Record<string, string> = {}
for (const [base, uniques] of Object.entries(_baseToUniques)) {
  for (const name of uniques) uniqueToBase[name] = base
}

export function getItemSize(itemClass: string, name?: string): [number, number] {
  if (name) {
    const base = uniqueToBase[name]
    if (base) {
      const cls = baseToClass[base]
      if (cls && classSizes[cls]) return classSizes[cls]
    }
  }
  return classSizes[itemClass] ?? [2, 2]
}
