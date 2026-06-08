import { RARITY_COLORS, iconMap, baseToClass, classSizes } from '../../shared/constants'
import { formatPrice, getItemIcon } from '../../shared/utils'
import { getCurrencyIconMap } from '../../shared/currency-icons'
import baseToUniques from '../../../../shared/data/items/unique-info.json'
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

export { RARITY_COLORS, iconMap }
export { formatPrice, getItemIcon }
export { socketWhite }
export { getCurrencyIconMap }
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

export const SOCKET_IMGS: Record<string, string> = {
  R: socketRed,
  G: socketGreen,
  B: socketBlue,
  W: socketWhite,
  A: socketAbyss,
  Ab: socketAbyss,
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

export const MOD_COLORS: Record<string, string> = {
  'temple-key': '#ffd700',
  temple: '#c4a35a',
  foulborn: '#EA44A8',
  heist: '#ffcc88',
  gem: '#a8e6cf',
  weapon: '#88ccff',
  defence: '#88ccff',
  pseudo: '#88ccff',
  implicit: '#af8aff',
  crafted: '#B8DAF1',
  fractured: 'var(--accent)',
  imbued: '#a8e6cf',
  enchant: '#a8e6cf',
  map: '#80cbc4',
  explicit: '#8787FE',
  tierPrefix: '#ec7676',
  tierSuffix: '#7aaff1',
}

export const MOD_BOLD_TYPES = new Set(['pseudo', 'defence', 'temple-key'])

export const CHIP_COLORS: Record<string, string> = {
  'pseudo.pseudo_number_of_empty_prefix_mods': '#4caf50',
  'pseudo.pseudo_number_of_empty_suffix_mods': '#4caf50',
  'misc.corrupted': '#ef5350',
  'misc.mirrored': '#8787FE',
  'misc.identified': '#ffb74d',
}

export const TERNARY_CHIP_IDS = new Set(['misc.corrupted', 'misc.mirrored', 'misc.fractured'])
export const MINMAX_CHIP_IDS = new Set(['misc.ilvl'])

export function getChipColor(id: string): string {
  if (CHIP_COLORS[id]) return CHIP_COLORS[id]
  if (id.startsWith('misc.influence_')) return '#c8a2c8'
  return 'var(--accent)'
}

export function getModColor(type: string, foulborn?: boolean): string {
  if (foulborn) return MOD_COLORS.foulborn
  return MOD_COLORS[type] ?? 'var(--text)'
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
