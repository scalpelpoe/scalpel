import type { MatchResult, PoeItem } from '../../../../../shared/types'

export type ColorEntry = { r: number; g: number; b: number; a: number; count: number; category: string }
export type ColorFreqMap = Record<string, ColorEntry[]>

export type SaveState = { isDirty: boolean; saving: boolean; saved: boolean; error: string | null; save: () => void }

export interface FilterBlockEditorProps {
  match: MatchResult
  /** Full Continue chain for this item in filter order, ending with `match`.
   *  When absent, the editor treats the chain as just `[match]` (pre-Continue
   *  behavior). Supplying the chain lets the preview render Continue decorators
   *  and routes color edits to whichever block in the chain currently owns
   *  each action. */
  chain?: MatchResult[]
  itemClass: string
  item?: PoeItem
  onClose: () => void
  onSaveStateChange?: (state: SaveState) => void
  tierGroup?: import('../../../../../shared/types').TierGroup
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
