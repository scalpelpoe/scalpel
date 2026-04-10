import type { FilterBlock } from '../../../../shared/types'
import { IP, iconMap } from '../../shared/constants'

export { IP, iconMap }

export function visibilityColor(v: FilterBlock['visibility']): string {
  switch (v) {
    case 'Show':
      return 'var(--show-color)'
    case 'Hide':
      return 'var(--hide-color)'
    case 'Minimal':
      return 'var(--minimal-color)'
  }
}
