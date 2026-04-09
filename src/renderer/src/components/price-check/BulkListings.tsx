import type { BulkListing } from './types'
import { CURRENCY_ICONS } from './constants'

export function BulkListings({
  bulkListings,
  total,
}: {
  bulkListings: BulkListing[]
  total: number | null
}): JSX.Element {
  return (
    <div
      className="bg-black/20 overflow-hidden flex-1 min-h-0 overflow-y-auto rounded-none"
      style={{ margin: '0 -14px -10px -14px' }}
    >
      {bulkListings.map((l, i) => (
        <div
          key={l.id}
          className="flex items-center gap-2 px-3 py-2 text-xs"
          style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}
        >
          {/* Ratio */}
          <span className="flex items-center justify-center gap-1 font-bold text-sm shrink-0 bg-black/30 rounded-full px-[10px] py-[3px]">
            {l.ratio < 1 ? l.ratio.toFixed(3) : l.ratio.toFixed(1)}
            {CURRENCY_ICONS[l.pay.currency] ? (
              <img src={CURRENCY_ICONS[l.pay.currency]} alt={l.pay.currency} className="w-[18px] h-[18px]" />
            ) : (
              <span className="text-[10px] text-text-dim">{l.pay.currency}</span>
            )}
          </span>

          {/* Stock */}
          <span className="text-[10px] text-text-dim shrink-0">{l.stock} in stock</span>

          {/* Seller */}
          <div className="flex-1 overflow-hidden">
            <div className="text-[11px] text-text truncate">{l.account}</div>
          </div>

          {/* Whisper button */}
          {l.whisper && (
            <button
              onClick={async (e) => {
                e.stopPropagation()
                try {
                  await navigator.clipboard.writeText(l.whisper!)
                  const btn = e.currentTarget
                  btn.textContent = 'Copied!'
                  setTimeout(() => {
                    btn.textContent = 'Whisper'
                  }, 1500)
                } catch {}
              }}
              className="px-2 py-[3px] text-[10px] font-semibold bg-white/[0.06] text-text-dim border-none rounded-[3px] cursor-pointer shrink-0 whitespace-nowrap"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
                e.currentTarget.style.color = 'var(--text)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                e.currentTarget.style.color = 'var(--text-dim)'
              }}
            >
              Whisper
            </button>
          )}
        </div>
      ))}
      {total != null && total > bulkListings.length && (
        <div className="px-[10px] py-1 text-[9px] text-text-dim text-center">
          Showing {bulkListings.length} of {total} sellers
        </div>
      )}
    </div>
  )
}
