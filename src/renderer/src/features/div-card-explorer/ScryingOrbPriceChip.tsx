// The Div Card Explorer is PoE1-only (features.divCards), so the PoE1 icon
// sheet is read directly, as dust-explorer does for its Mirror icon.
import itemIcons from '@scalpel/item-data/poe1.json'
import { CurrencyIcon } from '../../shared/CurrencyIcon'
import { HoverTooltip } from '../../shared/HoverTooltip'
import { formatDivCardPrice } from './utils'

const SCRYING_ORB_ICON = (itemIcons as Record<string, string>)['Scrying Orb']

interface ScryingOrbPriceChipProps {
  area: string
  /** poe.ninja chaos price for this area's Scrying Orb; absent when unpriced. */
  chaosValue: number | undefined
  divineRate: number
}

/** Right-hand bookend of a Div Card Explorer map row, mirroring MapInfoBlock on
 *  the left: the orb where the map icon sits, and ninja's price for that area's
 *  Scrying Orb in the same pill and type as the map's EV, so cost and EV read
 *  against each other. It is ninja's aggregate, not a live listing; the
 *  expanded panel's ScryingOrbButton still runs the live trade search. An
 *  unpriced area keeps the column's width so the bookends stay aligned. */
export function ScryingOrbPriceChip({ area, chaosValue, divineRate }: ScryingOrbPriceChipProps): JSX.Element {
  if (chaosValue == null || chaosValue <= 0) return <div className="w-16 shrink-0" aria-hidden />
  const { text, currencyKey } = formatDivCardPrice(chaosValue, divineRate)
  return (
    // min-w, not w: a four-character price ("15.8") at a raised font scale
    // outgrows 64px, and the pill should widen rather than spill.
    <HoverTooltip text={`Scrying Orb (${area}) on poe.ninja`} className="min-w-[64px] shrink-0 justify-center z-[1]">
      <div className="flex flex-col items-center gap-[2px]">
        <img src={SCRYING_ORB_ICON} alt="Scrying Orb" className="w-8 h-8 object-contain" />
        <span className="text-xs font-bold font-mono text-text inline-flex items-center gap-[3px] bg-black/30 rounded-full py-[3px] px-2">
          {text}
          <CurrencyIcon name={currencyKey} className="w-3 h-3" />
        </span>
      </div>
    </HoverTooltip>
  )
}
