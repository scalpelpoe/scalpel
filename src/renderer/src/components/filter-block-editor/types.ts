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
}
