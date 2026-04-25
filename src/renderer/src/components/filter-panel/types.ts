import type { OverlayData } from '../../../../shared/types'

export interface FilterPanelProps {
  data: OverlayData
  selectedBpIndex: number | null
  onSelectBp: (index: number | null) => void
  selectedQualityBpIndex: number | null
  onSelectQualityBp: (index: number | null) => void
  selectedStrandBpIndex: number | null
  onSelectStrandBp: (index: number | null) => void
  onClose: () => void
  onOpenAudit?: () => void
  onOpenTools?: () => void
  onOpenDustExplore?: () => void
  onOpenDivExplore?: () => void
  /** True when the filter-page sister overlay (tier base-types list) is visible. */
  tierSisterOpen?: boolean
  /** Flip tierSisterOpen -- button handler. */
  onToggleTierSister?: () => void
  /** Which side of the main panel the sister overlay mounts on. Used so toggle icons
   *  can point toward wherever the sister slides out from. */
  tierSisterSide?: 'left' | 'right'
}

export type PendingThreshold = {
  type: 'stack' | 'quality' | 'strand'
  oldValue: number
  newValue: number
}
