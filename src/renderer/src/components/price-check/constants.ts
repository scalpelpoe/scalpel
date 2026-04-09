import { chaosIcon, divineIcon } from '../../shared/icons'
import { RARITY_COLORS, iconMap } from '../../shared/constants'
import { formatPrice, getItemIcon } from '../../shared/utils'
import itemIcons from '../../../../shared/data/items/item-icons.json'
import baseToUniques from '../../../../shared/data/items/unique-info.json'
import itemClassesData from '../../../../shared/data/items/item-classes.json'
import elderIcon from '../../assets/influences/Elder-item-symbol.png'
import shaperIcon from '../../assets/influences/Shaper-item-symbol.png'
import crusaderIcon from '../../assets/influences/Crusader-item-symbol.png'
import redeemerIcon from '../../assets/influences/Redeemer-item-symbol.png'
import hunterIcon from '../../assets/influences/Hunter-item-symbol.png'
import warlordIcon from '../../assets/influences/Warlord-item-symbol.png'
import searingExarchIcon from '../../assets/influences/SearingExarch-item-symbol.png'
import eaterOfWorldsIcon from '../../assets/influences/EaterOfWorlds-item-symbol.png'
import socketRed from '../../assets/sockets/socket-red.png'
import socketGreen from '../../assets/sockets/socket-green.png'
import socketBlue from '../../assets/sockets/socket-blue.png'
import socketWhite from '../../assets/sockets/socket-white.png'
import socketAbyss from '../../assets/sockets/socket-abyss.png'

export { chaosIcon, divineIcon }
export { RARITY_COLORS, iconMap }
export { formatPrice, getItemIcon }
export { socketWhite }
export { default as ninjaIcon } from '../../assets/other/poe-ninja.png'
export { default as socketLink } from '../../assets/sockets/socket-link.png'

export const INFLUENCE_ICONS: Record<string, string> = {
  'misc.influence_elder': elderIcon,
  'misc.influence_shaper': shaperIcon,
  'misc.influence_crusader': crusaderIcon,
  'misc.influence_redeemer': redeemerIcon,
  'misc.influence_hunter': hunterIcon,
  'misc.influence_warlord': warlordIcon,
  'misc.influence_searing_exarch': searingExarchIcon,
  'misc.influence_eater_of_worlds': eaterOfWorldsIcon,
}

const _baseToUniques = baseToUniques as Record<string, string[]>
export const uniqueToBase: Record<string, string> = {}
for (const [base, uniques] of Object.entries(_baseToUniques)) {
  for (const name of uniques) uniqueToBase[name] = base
}

// PoE inventory slot sizes [width, height] by item class
export const ITEM_SIZES: Record<string, [number, number]> = Object.fromEntries(
  Object.entries(itemClassesData as Record<string, { size: [number, number] }>).map(([k, v]) => [k, v.size]),
)

// Map trade API currency keys to item-icons.json names
const allIcons = itemIcons as Record<string, string>
export const CURRENCY_ICONS: Record<string, string> = {
  chaos: chaosIcon,
  divine: divineIcon,
  exa: allIcons['Exalted Orb'],
  exalted: allIcons['Exalted Orb'],
  alch: allIcons['Orb of Alchemy'],
  alt: allIcons['Orb of Alteration'],
  mirror: allIcons['Mirror of Kalandra'],
  chrom: allIcons['Chromatic Orb'],
  blessed: allIcons['Blessed Orb'],
  fusing: allIcons['Orb of Fusing'],
  jewellers: allIcons["Jeweller's Orb"],
  jew: allIcons["Jeweller's Orb"],
  regal: allIcons['Regal Orb'],
  annul: allIcons['Orb of Annulment'],
  vaal: allIcons['Vaal Orb'],
  chance: allIcons['Orb of Chance'],
  aug: allIcons['Orb of Augmentation'],
  regret: allIcons['Orb of Regret'],
  scour: allIcons['Orb of Scouring'],
  transmute: allIcons['Orb of Transmutation'],
  wisdom: allIcons['Scroll of Wisdom'],
  portal: allIcons['Portal Scroll'],
  scrap: allIcons["Armourer's Scrap"],
  whetstone: allIcons["Blacksmith's Whetstone"],
  gcp: allIcons["Gemcutter's Prism"],
  bauble: allIcons["Glassblower's Bauble"],
}

export const SOCKET_IMGS: Record<string, string> = {
  R: socketRed,
  G: socketGreen,
  B: socketBlue,
  W: socketWhite,
  A: socketAbyss,
  Ab: socketAbyss,
}

export function getItemSize(itemClass: string, name?: string): [number, number] {
  // For uniques, look up base type then get class size
  if (name) {
    const base = uniqueToBase[name]
    if (base) {
      // Find the item class for this base type
      for (const [_cls, data] of Object.entries(
        itemClassesData as Record<string, { bases: string[]; size: [number, number] }>,
      )) {
        if (data.bases.includes(base)) return data.size
      }
    }
  }
  return ITEM_SIZES[itemClass] ?? [2, 2]
}

export function formatTimeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}
