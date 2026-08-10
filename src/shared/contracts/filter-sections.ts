import type { Visibility } from './core'
import type { FilterAction } from './items'

/** One NeverSink-tagged tier row inside a section (e.g. currency / s). */
export interface FilterSectionTier {
  tier: string
  label: string
  blockIndex: number
  visibility: Visibility
  previewLabel: string
  /** Actions used by LootLabel (colors / font size). */
  previewActions: FilterAction[]
  style: { text: string; bg: string; border: string }
  baseTypes: string[]
  itemCount: number
}

/** A FilterBlade-style section grouped by `$type->…` path. */
export interface FilterSection {
  typePath: string
  title: string
  tiers: FilterSectionTier[]
  shownCount: number
  totalCount: number
}
