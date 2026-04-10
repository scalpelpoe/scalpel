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
}

export type PendingThreshold = {
  type: 'stack' | 'quality' | 'strand'
  oldValue: number
  newValue: number
}
