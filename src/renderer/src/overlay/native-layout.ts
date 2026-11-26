import type { OverlayData, PoeItem } from '@shared/types'
import { findRelated } from '../shared/related-items'

/** Whether the native/regular window must reserve a right-hand sister column.
 *
 *  The price-check sister only renders when a curated related-items entry
 *  exists; reserving the column without one leaves dead space on the right.
 *  Kept as a pure helper so the layout condition is unit-testable. */
export function shouldReserveNativeSister(args: {
  windowLocal: boolean
  isHidden: boolean
  view: string
  tierSisterOpen: boolean
  overlayData: OverlayData | null
  priceCheckData: { item: PoeItem } | null
  poeVersion: 1 | 2 | null
}): boolean {
  if (!args.windowLocal || args.isHidden) return false
  if (args.view === 'item') return args.tierSisterOpen && !!args.overlayData
  if (args.view === 'pricecheck') {
    return !!args.priceCheckData && !!findRelated(args.priceCheckData.item.name, args.poeVersion ?? 1)
  }
  return false
}
