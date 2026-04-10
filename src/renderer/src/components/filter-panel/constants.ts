import { RARITY_COLORS } from '../../shared/constants'
import { getItemIcon } from '../../shared/utils'

export { RARITY_COLORS }
export { getItemIcon as getItemIconUrl }

export const visColors: Record<string, string> = {
  Show: 'var(--show-color)',
  Hide: 'var(--hide-color)',
}
