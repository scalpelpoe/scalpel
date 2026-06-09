import { RARITY_COLORS, iconMap } from '../../shared/constants'
import { formatPrice, getItemIcon } from '../../shared/utils'
import { getCurrencyIconMap } from '../../shared/currency-icons'
import { INFLUENCE_ICONS_BY_NAME, uniqueToBase, getItemSize } from '../../shared/item-display'
import socketWhite from '../../assets/sockets/socket-white.png'
import { MOD_COLORS } from '../../shared/trade-results/constants'

export { RARITY_COLORS, iconMap }
export { formatPrice, getItemIcon }
export { socketWhite }
export { getCurrencyIconMap }
export { INFLUENCE_ICONS_BY_NAME, uniqueToBase, getItemSize }
export { default as ninjaIcon } from '../../assets/other/poe-ninja.png'
export { default as socketLink } from '../../assets/sockets/socket-link.png'

export const INFLUENCE_ICONS: Record<string, string> = {
  'misc.influence_elder': Object.values(INFLUENCE_ICONS_BY_NAME)[0],
  'misc.influence_shaper': Object.values(INFLUENCE_ICONS_BY_NAME)[1],
  'misc.influence_crusader': Object.values(INFLUENCE_ICONS_BY_NAME)[2],
  'misc.influence_redeemer': Object.values(INFLUENCE_ICONS_BY_NAME)[3],
  'misc.influence_hunter': Object.values(INFLUENCE_ICONS_BY_NAME)[4],
  'misc.influence_warlord': Object.values(INFLUENCE_ICONS_BY_NAME)[5],
  'misc.influence_searing_exarch': Object.values(INFLUENCE_ICONS_BY_NAME)[6],
  'misc.influence_eater_of_worlds': Object.values(INFLUENCE_ICONS_BY_NAME)[7],
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
