import { Down, Up } from '@icon-park/react'
import type { Listing } from './types'
import { ExpandedListing } from './ExpandedListing'
import { CURRENCY_ICONS, SOCKET_IMGS, formatTimeAgo, socketLink, socketWhite } from './constants'
import type { ResultsView } from './search-settings'

export function TradeListings({
  listings,
  total,
  itemClass,
  itemName,
  itemRarity,
  expandedListing,
  setExpandedListing,
  priceChipMinWidth,
  loggedIn,
  actionStatus,
  setActionStatus,
  queryId,
  league,
  onLoadMore,
  loadingMore,
  resultsView = 'default',
}: {
  listings: Listing[]
  total: number | null
  itemClass: string
  itemName: string
  itemRarity: string
  expandedListing: string | null
  setExpandedListing: (id: string | null) => void
  priceChipMinWidth: number
  loggedIn: boolean
  actionStatus: Record<string, 'pending' | 'success' | 'failed'>
  setActionStatus: React.Dispatch<React.SetStateAction<Record<string, 'pending' | 'success' | 'failed'>>>
  queryId: string | null
  league: string
  onLoadMore?: () => void
  loadingMore?: boolean
  resultsView?: ResultsView
}): JSX.Element {
  const openAll = resultsView === 'open-all'
  const compact = resultsView === 'shrinkydink'
  return (
    <div className="bg-black/20 overflow-hidden flex-1 min-h-0 overflow-y-auto rounded-none mx-[-14px] mt-0 -mb-[10px]">
      {listings.map((l, i) => {
        const isExpanded = openAll || expandedListing === l.id
        return (
          <div key={l.id}>
            <div
              onClick={() => {
                if (openAll) return
                setExpandedListing(isExpanded ? null : l.id)
              }}
              className="flex items-center gap-2 px-[10px] py-[6px] text-xs relative transition-[background] duration-100"
              style={{
                background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                borderLeft: isExpanded ? '3px solid var(--accent)' : '3px solid transparent',
                cursor: openAll ? 'default' : 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                const chev = e.currentTarget.querySelector('.row-chevron') as HTMLElement
                if (chev) chev.style.opacity = '0.5'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'
                const chev = e.currentTarget.querySelector('.row-chevron') as HTMLElement
                if (chev) chev.style.opacity = isExpanded ? '0.5' : '0'
              }}
            >
              {/* Item icon with sockets overlay (hidden in Shrinkydink mode) */}
              {!compact && l.icon && (
                <div className="relative w-[42px] h-[44px] shrink-0">
                  <img
                    src={l.icon}
                    alt=""
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain pointer-events-none"
                    style={{
                      width: 72,
                      height: 72,
                      filter: 'blur(10px) saturate(2)',
                      opacity: 0.3,
                    }}
                  />
                  <img src={l.icon} alt="" className="relative w-[42px] h-[44px] object-contain" />
                  {/* Sockets overlay */}
                  {l.itemData?.sockets && l.itemData.sockets.length > 0 && (
                    <div
                      className="absolute left-0 right-0 bottom-0 flex flex-col items-center justify-center pointer-events-none"
                      style={{
                        top: l.itemData?.sockets && l.itemData.sockets.length >= 5 ? -5 : 0,
                      }}
                    >
                      {(() => {
                        const sockets = l.itemData!.sockets!
                        const n = sockets.length
                        const is1Wide =
                          n <= 3 && !['Helmets', 'Body Armours', 'Gloves', 'Boots', 'Shields'].includes(itemClass)
                        const sz = 12,
                          gap = 3

                        if (is1Wide || n <= 1) {
                          return sockets.map((s, si) => {
                            const linked = si > 0 && sockets[si - 1].group === s.group
                            return (
                              <div key={si} className="flex flex-col items-center">
                                {linked && (
                                  <img
                                    src={socketLink}
                                    alt=""
                                    style={{
                                      width: 4,
                                      height: gap,
                                      objectFit: 'fill',
                                      transform: 'rotate(90deg)',
                                      filter: 'brightness(2)',
                                    }}
                                  />
                                )}
                                {!linked && si > 0 && <div style={{ height: gap }} />}
                                <img
                                  src={SOCKET_IMGS[s.sColour] ?? socketWhite}
                                  alt=""
                                  style={{ width: sz, height: sz }}
                                />
                              </div>
                            )
                          })
                        }

                        // Zigzag positions
                        const positions: Array<[number, number]> = []
                        for (let row = 0; row < Math.ceil(n / 2); row++) {
                          if (row % 2 === 0) {
                            positions.push([0, row])
                            if (positions.length < n) positions.push([1, row])
                          } else {
                            positions.push([1, row])
                            if (positions.length < n) positions.push([0, row])
                          }
                        }

                        const cellW = sz + gap * 2
                        const cellH = sz + gap * 2
                        const totalW = cellW * 2
                        const totalH = cellH * Math.ceil(n / 2)

                        return (
                          <div className="relative overflow-visible" style={{ width: totalW, height: totalH }}>
                            {sockets.map((s, si) => {
                              const [col, row] = positions[si]
                              const x = col * cellW + gap
                              const y = row * cellH + gap

                              let linkEl = null
                              if (si > 0 && sockets[si - 1].group === s.group) {
                                const [pc, pr] = positions[si - 1]
                                if (pr === row) {
                                  linkEl = (
                                    <img
                                      key={`l${si}`}
                                      src={socketLink}
                                      alt=""
                                      style={{
                                        position: 'absolute',
                                        left: Math.min(col, pc) * cellW + gap + sz,
                                        top: y + (sz - 4) / 2,
                                        width: gap * 2,
                                        height: 4,
                                        objectFit: 'fill',
                                        filter: 'brightness(2)',
                                      }}
                                    />
                                  )
                                } else {
                                  linkEl = (
                                    <img
                                      key={`l${si}`}
                                      src={socketLink}
                                      alt=""
                                      style={{
                                        position: 'absolute',
                                        left: col * cellW + gap + (sz - gap * 2) / 2,
                                        top: Math.min(row, pr) * cellH + gap + sz + (gap * 2 - 4) / 2,
                                        width: gap * 2,
                                        height: 4,
                                        objectFit: 'fill',
                                        transform: 'rotate(90deg)',
                                        filter: 'brightness(2)',
                                      }}
                                    />
                                  )
                                }
                              }

                              return [
                                linkEl,
                                <img
                                  key={si}
                                  src={SOCKET_IMGS[s.sColour] ?? socketWhite}
                                  alt=""
                                  style={{
                                    position: 'absolute',
                                    left: x,
                                    top: y,
                                    width: sz,
                                    height: sz,
                                  }}
                                />,
                              ]
                            })}
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* Price */}
              {l.price ? (
                <span
                  className="flex items-center justify-center gap-1 font-bold text-sm font-[inherit] shrink-0 bg-black/30 rounded-full px-[10px] py-[3px]"
                  style={{ minWidth: priceChipMinWidth }}
                >
                  {l.price.amount}
                  {CURRENCY_ICONS[l.price.currency] ? (
                    <img src={CURRENCY_ICONS[l.price.currency]} alt={l.price.currency} className="w-[18px] h-[18px]" />
                  ) : (
                    <span className="text-[10px] text-text-dim">{l.price.currency}</span>
                  )}
                </span>
              ) : (
                <span
                  className="flex items-center justify-center shrink-0 text-text-dim text-[11px] bg-black/30 rounded-full px-[10px] py-[3px]"
                  style={{ minWidth: priceChipMinWidth }}
                >
                  No price
                </span>
              )}

              {/* Seller + time: stacked by default, inline in Shrinkydink to save vertical space */}
              <div className={`flex-1 min-w-0 flex ${compact ? 'items-center gap-2' : 'flex-col'}`}>
                <span
                  className="text-[10px] truncate"
                  style={{ color: l.online ? 'var(--accent)' : 'var(--text-dim)' }}
                >
                  {l.account}
                </span>
                {l.indexed && (
                  <span className="text-[9px] text-text-dim whitespace-nowrap">{formatTimeAgo(l.indexed)}</span>
                )}
              </div>

              {/* Trade actions - only show when logged in */}
              {loggedIn &&
                (() => {
                  const status = actionStatus[l.id]
                  const isActing = status === 'pending'
                  const isDone = status === 'success' || status === 'failed'
                  const label = l.instantBuyout
                    ? isActing
                      ? 'Traveling...'
                      : isDone
                        ? status === 'success'
                          ? 'Success'
                          : 'Failed'
                        : 'Travel to Hideout'
                    : isActing
                      ? 'Whispering...'
                      : isDone
                        ? status === 'success'
                          ? 'Whisper Sent'
                          : 'Failed'
                        : 'Whisper'
                  return (
                    <button
                      onClick={async (e) => {
                        e.stopPropagation()
                        if (isActing || !queryId) return
                        setActionStatus((prev) => ({ ...prev, [l.id]: 'pending' }))
                        try {
                          if (l.instantBuyout) {
                            await window.api.visitHideout(queryId, l.id, league)
                          } else {
                            await window.api.whisperSeller(queryId, l.id, league)
                          }
                          setActionStatus((prev) => ({ ...prev, [l.id]: 'success' }))
                        } catch {
                          setActionStatus((prev) => ({ ...prev, [l.id]: 'failed' }))
                        }
                      }}
                      disabled={isActing}
                      title={l.instantBuyout ? 'Visit hideout via trade site' : 'Send whisper via trade site'}
                      className="px-2 py-[3px] text-[9px] font-semibold border-none rounded-[3px] shrink-0 whitespace-nowrap"
                      style={{
                        background:
                          status === 'success'
                            ? 'rgba(40,80,40,0.4)'
                            : status === 'failed'
                              ? 'rgba(100,35,35,0.4)'
                              : 'rgba(255,255,255,0.06)',
                        color: status === 'success' ? '#fff' : status === 'failed' ? '#fff' : 'var(--text-dim)',
                        cursor: isActing ? 'default' : 'pointer',
                        opacity: isActing ? 0.6 : 1,
                      }}
                      onMouseEnter={(e) => {
                        if (!isActing && !isDone) {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
                          e.currentTarget.style.color = 'var(--text)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActing && !isDone) {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                          e.currentTarget.style.color = 'var(--text-dim)'
                        }
                      }}
                    >
                      {label}
                    </button>
                  )
                })()}

              {/* Expand/collapse chevron (hidden when Open All forces everything expanded) */}
              <span
                className="absolute bottom-0 left-1/2 -translate-x-1/2 text-text-dim pointer-events-none flex transition-opacity duration-150 row-chevron"
                style={{
                  opacity: openAll ? 0 : isExpanded ? 0.5 : 0,
                }}
              >
                {isExpanded ? (
                  <Up size={12} theme="two-tone" fill={['currentColor', 'rgba(255,255,255,0.2)']} />
                ) : (
                  <Down size={12} theme="two-tone" fill={['currentColor', 'rgba(255,255,255,0.2)']} />
                )}
              </span>
            </div>

            {/* Expanded item details (also shown for every row in Open All mode) */}
            {isExpanded && l.itemData && (
              <ExpandedListing listing={l} itemClass={itemClass} itemName={itemName} itemRarity={itemRarity} />
            )}
          </div>
        )
      })}
      {total != null && total > listings.length && (
        <div className="px-[10px] py-1 text-[9px] text-text-dim text-center">
          Showing {listings.length} of {total} results
          {onLoadMore && (
            <button
              style={{ marginLeft: 6 }}
              onClick={onLoadMore}
              disabled={loadingMore}
              className="text-[9px] px-[6px] py-[1px] border-none cursor-pointer font-semibold bg-white/[0.06] text-text-dim rounded-[2px] disabled:opacity-40"
              onMouseEnter={(e) => {
                if (!loadingMore) e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
              }}
            >
              {loadingMore ? 'Loading...' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
