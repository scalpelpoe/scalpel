import { Skeleton } from '../../shared/Skeleton'

/** Listing-row placeholders shared between the full Price tab skeleton and the
 *  in-component "still searching" fallback inside PriceCheck. Row shape mirrors the
 *  real TradeListings / BulkListings row so the swap doesn't jump the layout. */
export function ListingRowsSkeleton({ count = 5 }: { count?: number }): JSX.Element {
  return (
    <div className="flex flex-col gap-[6px]">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-2 py-[6px] rounded"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          <Skeleton className="w-[28px] h-[28px] rounded" />
          <Skeleton className="h-[11px] flex-1 rounded" />
          <Skeleton className="h-[22px] w-[70px] rounded-full" />
        </div>
      ))}
    </div>
  )
}

/** Placeholder scaffold shown while the Price tab's initial IPC payload is in flight
 *  (view='pricecheck' but priceCheckData is still null) OR while the first trade search
 *  is resolving. Mirrors the real layout so nothing jumps when the real data lands. */
export function PriceCheckSkeleton(): JSX.Element {
  return (
    <div className="flex flex-col flex-1 min-h-0 bg-bg">
      {/* Header row -- matches ItemHeader's height + padding so the drop-in is seamless. */}
      <div className="bg-bg-card border-b border-border px-[14px] py-[10px] flex gap-[10px] items-center">
        <Skeleton className="w-[56px] h-[56px] rounded" />
        <div className="flex-1 min-w-0 flex flex-col gap-[6px]">
          <Skeleton className="h-[14px] w-[40%] rounded" />
          <Skeleton className="h-[11px] w-[28%] rounded" />
        </div>
        <div className="flex flex-col gap-[4px] items-end shrink-0">
          <Skeleton className="h-[22px] w-[90px] rounded-full" />
          <Skeleton className="h-[20px] w-[80px] rounded-full" />
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-[14px] py-[10px] flex flex-col gap-[10px]">
        {/* Stat-filter chip row scaffold */}
        <div className="flex gap-[6px] flex-wrap">
          <Skeleton className="h-[26px] w-[120px] rounded-full" />
          <Skeleton className="h-[26px] w-[160px] rounded-full" />
          <Skeleton className="h-[26px] w-[100px] rounded-full" />
          <Skeleton className="h-[26px] w-[140px] rounded-full" />
        </div>

        {/* Disabled "Search Trade" button in the same shape as the real one. */}
        <button
          disabled
          className="w-full py-[10px] text-[12px] font-semibold rounded border-none cursor-default"
          style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-dim)' }}
        >
          Searching...
        </button>

        <ListingRowsSkeleton />
      </div>
    </div>
  )
}
