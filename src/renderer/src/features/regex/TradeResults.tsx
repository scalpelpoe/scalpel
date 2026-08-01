import { useEffect, useState } from 'react'
import { TradeListings } from '../../shared/trade-results/TradeListings'
import { RateLimitBar } from '../../components/primitives/RateLimitBar'
import type { Listing } from '../../shared/trade-types'
import { getTradeUrls } from '@shared/endpoints'

interface TradeResultsProps {
  tradeTotal: number | null
  tradeQueryId: string | null
  tradeLeague: string
  tradeError: string | null
  tradeListings: Listing[]
  tradeRemainingIds: string[]
  tradeLoadMore: () => void
  loadingMore: boolean
  expandedListing: string | null
  setExpandedListing: (id: string | null) => void
  priceChipMinWidth: number
  rateLimitTiers: Array<{ used: number; max: number; window: number; penalty: number; lastUpdate?: number }>
  /** Item class forwarded to TradeListings (drives its display logic). Defaults to the
   *  maps flow; the waystone/tablet generators pass their own class. */
  itemClass?: string
}

/** Full trade-results panel for the map regex flow: the header bar, error/empty
 *  states, `<TradeListings />`, and the rate-limit strip at the bottom. Visible only
 *  when `showTradeResults` is true in the parent. */
export function TradeResults({
  tradeTotal,
  tradeQueryId,
  tradeLeague,
  tradeError,
  tradeListings,
  tradeRemainingIds,
  tradeLoadMore,
  loadingMore,
  expandedListing,
  setExpandedListing,
  priceChipMinWidth,
  rateLimitTiers,
  itemClass = 'Maps',
}: TradeResultsProps): JSX.Element {
  // Read poeVersion once for the "Open in Trade" URL. Version is stable per process
  // (we relaunch on game switch), so this one-shot lookup beats prop-drilling through
  // RegexTool -> RegexGenerator -> MapsGenerator -> body -> here.
  const [poeVersion, setPoeVersion] = useState<1 | 2>(1)
  useEffect(() => {
    window.api.getSettings().then((s) => setPoeVersion(s.poeVersion ?? 1))
  }, [])
  const tradeUrls = getTradeUrls(poeVersion)

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-bg">
      <div className="flex items-center gap-2 px-[14px] py-[6px]">
        <span className="text-[11px] flex-1" style={{ color: 'var(--text-dim)' }}>
          {tradeTotal != null ? `${tradeTotal} result${tradeTotal !== 1 ? 's' : ''}` : ''}
        </span>
        {/* Primary action for this panel: with the in-Scalpel Travel/Whisper buttons
            gone, the trade site is the only way to act on a listing, so this reads as
            a real button rather than the dim secondary chip it used to be. */}
        {tradeQueryId && (
          <button
            onClick={() => window.api.openExternal(tradeUrls.webSearch(tradeLeague, tradeQueryId))}
            className="text-[12px] px-[12px] py-[6px] border-none cursor-pointer font-semibold bg-white/[0.10] text-accent rounded-[4px] shrink-0 whitespace-nowrap"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.18)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.10)'
            }}
          >
            Open in Trade to buy these
          </button>
        )}
      </div>
      {tradeError && <div className="text-[10px] text-[#ef5350] px-3 py-2">{tradeError}</div>}
      {!tradeError && tradeListings.length === 0 && (
        <div className="text-[11px] text-text-dim text-center p-4">No listings found</div>
      )}
      {tradeListings.length > 0 && (
        <div className="flex-1 min-h-0 px-[14px] pb-[10px] flex flex-col">
          <TradeListings
            listings={tradeListings}
            total={tradeTotal}
            itemClass={itemClass}
            itemName=""
            itemRarity="Normal"
            expandedListing={expandedListing}
            setExpandedListing={setExpandedListing}
            priceChipMinWidth={priceChipMinWidth}
            queryId={tradeQueryId}
            league={tradeLeague}
            onLoadMore={tradeRemainingIds.length > 0 ? tradeLoadMore : undefined}
            loadingMore={loadingMore}
          />
        </div>
      )}
      <RateLimitBar rateLimitTiers={rateLimitTiers} />
    </div>
  )
}
