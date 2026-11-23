import { useState } from 'react'
import type { UniqueTrackerDetails } from '@shared/contracts/unique-tracker'
import { CurrencyIcon } from '../../shared/CurrencyIcon'
import { ExternalLinkButton } from '../../shared/ExternalLinkButton'
import { RateChart } from '../../shared/RateChart'
import { formatRate } from '../../shared/utils'
import { PairSwitch } from './PairSwitch'

interface Props {
  details: UniqueTrackerDetails
  onOpenNinja?: () => void
}

const LISTINGS_LABEL = { prefix: '', suffix: ' listed' }

/** League price history for a unique worth a divine or more, from its UNLINKED
 *  poe.ninja line (5L/6L copies are priced separately and would inflate it).
 *  Same card as the Exchange panel minus the vendor portrait, with the price
 *  chip riding on the title row so the header stays one line tall. */
export function PriceTrackerPanel({ details, onOpenNinja }: Props): JSX.Element {
  const [pairIdx, setPairIdx] = useState(0)
  // The fetcher always emits both pairs; a stale index only survives a details
  // swap, which remounts via the key in PriceCheck.
  const pair = details.pairs[pairIdx] ?? details.pairs[0]

  return (
    // shrink-0 for the same reason as ExchangePanel (#568): it shares a flex
    // column with flex-1 listings that would otherwise squeeze the chart off.
    <div className="relative flex flex-col my-2 rounded-lg bg-bg-card overflow-hidden shrink-0">
      {/* flex-wrap: on a narrow overlay the controls drop to their own line
       *  (ml-auto keeps them right-aligned) instead of sliding under the chip. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-black/20 px-3 py-2">
        <div className="grow min-w-0 flex items-center gap-2">
          <div className="shrink-0 text-[16px] font-semibold text-[#ffc83c] leading-tight">Price Tracker</div>
          <div className="shrink-0 inline-flex items-center gap-[5px] bg-black/30 rounded-full px-[9px] py-[2px]">
            <span data-testid="tracker-hero-rate" className="text-[15px] font-bold leading-none">
              {formatRate(pair.rate)}
            </span>
            <CurrencyIcon name={pair.currency} className="w-[14px] h-[14px]" />
          </div>
          {details.variant && (
            <span
              data-testid="tracker-variant"
              className="min-w-0 truncate text-[10px] text-text-dim"
              title={`Tracking the ${details.variant} variant`}
            >
              {details.variant}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <PairSwitch currencies={details.pairs.map((p) => p.currency)} active={pairIdx} onChange={setPairIdx} />
          {onOpenNinja && (
            <ExternalLinkButton
              label="Ninja"
              title="Open the poe.ninja page for this item in your browser"
              onClick={onOpenNinja}
            />
          )}
        </div>
      </div>

      {pair.history.length === 0 ? (
        <div className="h-[110px] flex items-center justify-center text-[11px] text-text-dim">No price history yet</div>
      ) : (
        <RateChart points={pair.history} currency={pair.currency} height={110} volumeLabel={LISTINGS_LABEL} />
      )}
    </div>
  )
}
