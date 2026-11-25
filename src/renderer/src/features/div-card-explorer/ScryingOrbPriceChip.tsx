// The Div Card Explorer is PoE1-only (features.divCards), so the PoE1 icon
// sheet is read directly, as dust-explorer does for its Mirror icon.
import itemIcons from '@scalpel/item-data/poe1.json'
import { DivCardPriceChip } from './DivCardPriceChip'

const SCRYING_ORB_ICON = (itemIcons as Record<string, string>)['Scrying Orb']

interface ScryingOrbPriceChipProps {
  area: string
  /** poe.ninja chaos price for this area's Scrying Orb; absent when unpriced. */
  chaosValue: number | undefined
  divineRate: number
}

/** Right-hand column on each Div Card Explorer map row: what poe.ninja says a
 *  Scrying Orb for this area costs, so it reads against the map's card EV on
 *  the left. It is ninja's aggregate, not a live listing; the expanded panel's
 *  ScryingOrbButton still runs the live trade search. Keeps its width when the
 *  area is unpriced so the column stays aligned down the list. */
export function ScryingOrbPriceChip({ area, chaosValue, divineRate }: ScryingOrbPriceChipProps): JSX.Element {
  const priced = chaosValue != null && chaosValue > 0
  return (
    <span
      className="w-[64px] shrink-0 relative z-[1] inline-flex items-center justify-end gap-[4px] text-[11px] font-mono text-text-dim"
      title={priced ? `Scrying Orb (${area}) price on poe.ninja` : undefined}
    >
      {priced && (
        <>
          <img src={SCRYING_ORB_ICON} alt="Scrying Orb" className="w-4 h-4" />
          <DivCardPriceChip value={chaosValue} divineRate={divineRate} />
        </>
      )}
    </span>
  )
}
