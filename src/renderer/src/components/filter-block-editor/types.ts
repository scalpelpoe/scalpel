import type { MatchResult, PoeItem } from '../../../../shared/types'

export type ColorEntry = { r: number; g: number; b: number; a: number; count: number; category: string }
export type ColorFreqMap = Record<string, ColorEntry[]>

export type SaveState = { isDirty: boolean; saving: boolean; saved: boolean; error: string | null; save: () => void }

export interface FilterBlockEditorProps {
  match: MatchResult
  itemClass: string
  item?: PoeItem
  onClose: () => void
  onSaveStateChange?: (state: SaveState) => void
  tierGroup?: import('../../../../shared/types').TierGroup
  league?: string
  onOpenAudit?: () => void
  /** Whether the filter-page "Items in this Tier" sister overlay is visible. */
  tierSisterOpen?: boolean
  /** Toggle callback for the sister overlay; the button in the "Items in this Tier"
   *  panel flips this state. */
  onToggleTierSister?: () => void
  /** Which side of the main panel the sister mounts on. The expand/collapse icon
   *  flips horizontally when the sister is on the left so its arrow points toward it. */
  tierSisterSide?: 'left' | 'right'
}
