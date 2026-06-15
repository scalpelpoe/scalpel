import { RARITY_COLORS } from '@renderer/shared/constants'
import { getItemIcon } from '@renderer/shared/utils'

export { RARITY_COLORS }
export { getItemIcon as getItemIconUrl }

export const visColors: Record<string, string> = {
  Show: 'var(--show-color)',
  Hide: 'var(--hide-color)',
}
