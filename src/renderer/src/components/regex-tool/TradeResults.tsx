import { TradeListings } from '../price-check/TradeListings'
import { RateLimitBar } from '../price-check/RateLimitBar'
import type { Listing } from '../price-check/types'

/** Above this result count, the in-Scalpel Travel-to-Hideout action gets unreliable:
 *  the page's live results churn between our API fetch and the click, so the data-id
 *  we cached no longer resolves on the poe.com/trade DOM. We flag the results bar as a
 *  warning past this threshold. */
const RESULTS_WARNING_THRESHOLD = 1000

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
  loggedIn: boolean
  actionStatus: Record<string, 'pending' | 'success' | 'failed'>
  setActionStatus: React.Dispatch<React.SetStateAction<Record<string, 'pending' | 'success' | 'failed'>>>
  rateLimitTiers: Array<{ used: number; max: number; window: number; penalty: number; lastUpdate?: number }>
}

/** Full trade-results panel for the map regex flow: the header bar (with the high-
 *  volume warning), error/empty states, `<TradeListings />`, and the rate-limit strip
 *  at the bottom. Visible only when `showTradeResults` is true in the parent. */
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
  loggedIn,
  actionStatus,
  setActionStatus,
  rateLimitTiers,
}: TradeResultsProps): JSX.Element {
  const warnHighVolume = (tradeTotal ?? 0) > RESULTS_WARNING_THRESHOLD

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-bg">
      <div
        className="flex items-center gap-2 px-[14px] py-[6px]"
        style={warnHighVolume ? { background: 'var(--warn)' } : undefined}
      >
        <span
          className="text-[11px] flex-1"
          style={{
            color: warnHighVolume ? 'var(--bg-solid)' : 'var(--text-dim)',
            fontWeight: warnHighVolume ? 600 : undefined,
          }}
        >
          {warnHighVolume
            ? `${tradeTotal} results: Travel to hideout may be unreliable when there are a lot of results`
            : tradeTotal != null
              ? `${tradeTotal} result${tradeTotal !== 1 ? 's' : ''}`
              : ''}
        </span>
        {tradeQueryId && (
          <button
            onClick={() =>
              window.api.openExternal(
                `https://www.pathofexile.com/trade/search/${encodeURIComponent(tradeLeague)}/${tradeQueryId}`,
              )
            }
            className={
              warnHighVolume
                ? 'text-[10px] px-[10px] py-[5px] border-none cursor-pointer font-semibold bg-bg-card text-accent rounded-[3px]'
                : 'text-[10px] px-2 py-[3px] border-none cursor-pointer font-semibold bg-white/[0.08] text-text-dim rounded-[3px]'
            }
            onMouseEnter={(e) => {
              e.currentTarget.style.background = warnHighVolume ? 'var(--bg-hover)' : 'rgba(255,255,255,0.15)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = warnHighVolume ? 'var(--bg-card)' : 'rgba(255,255,255,0.08)'
            }}
          >
            Open in Trade
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
            itemClass="Maps"
            itemName=""
            itemRarity="Normal"
            expandedListing={expandedListing}
            setExpandedListing={setExpandedListing}
            priceChipMinWidth={priceChipMinWidth}
            loggedIn={loggedIn}
            actionStatus={actionStatus}
            setActionStatus={setActionStatus}
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
