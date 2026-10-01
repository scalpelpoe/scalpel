import type { PriceCheck, SnapshotItem } from '@scalpel/stream-contract'
import { useLayoutEffect, useRef, useState } from 'react'
import { ItemTooltip } from './ItemTooltip'
import { PriceCheckPanel } from './PriceCheckPanel'

export type CheckableItem = SnapshotItem & { priceCheck: PriceCheck }

export const hasPriceCheck = (item: SnapshotItem): item is CheckableItem => item.priceCheck !== undefined

/** The item card, or the price checker once `checking` is that item. `canCheck` gates the
 *  card's Price check button (pinned / expanded items only, never a bare hover). */
export function CardOrPriceCheck({
  item,
  checking,
  canCheck,
  onCheck,
}: {
  item: SnapshotItem
  checking: CheckableItem | null
  canCheck: boolean
  /** Open (item) or close (null) the price checker. */
  onCheck: (item: CheckableItem | null) => void
}): JSX.Element {
  // The checker takes the width of the card it replaces: the card is sized to its content, so
  // remember it while the card is on screen and hand it to the panel.
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardWidth, setCardWidth] = useState<number>()
  const showingCard = !(checking && checking === item)
  useLayoutEffect(() => {
    const el = showingCard ? cardRef.current : null
    if (!el) return
    const measure = (): void => {
      if (el.offsetWidth) setCardWidth(el.offsetWidth)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [showingCard, item])
  if (!showingCard) return <PriceCheckPanel item={checking} width={cardWidth} onBack={() => onCheck(null)} />
  return (
    <ItemTooltip
      item={item}
      rootRef={cardRef}
      onPriceCheck={canCheck && hasPriceCheck(item) ? () => onCheck(item) : undefined}
    />
  )
}
