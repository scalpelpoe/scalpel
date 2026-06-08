export interface OverlayAnchor {
  fracX: number
  fracY: number
  fracW: number
  fracH: number
}

export interface CheatSheet {
  id: string
  label?: string
  ext: string
  areaCodes?: string[]
}

export interface CheatSheetCategory {
  id: string
  name: string
  hotkey: string
  sheets: CheatSheet[]
  prefabSlug?: string
}

export interface CheatSheetsSettings {
  globalHotkey: string
  categories: CheatSheetCategory[]
  windowAnchor?: OverlayAnchor
  pinned?: boolean
  pinnedAnchor?: OverlayAnchor
}
