import { Down, Up } from '@icon-park/react'
import type { Listing } from './types'
import {
  CURRENCY_ICONS,
  SOCKET_IMGS,
  RARITY_COLORS,
  getItemSize,
  formatTimeAgo,
  socketLink,
  socketWhite,
} from './constants'

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
}): JSX.Element {
  return (
    <div className="bg-black/20 overflow-hidden flex-1 min-h-0 overflow-y-auto rounded-none mx-[-14px] mt-0 -mb-[10px]">
      {listings.map((l, i) => {
        const isExpanded = expandedListing === l.id
        return (
          <div key={l.id}>
            <div
              onClick={() => setExpandedListing(isExpanded ? null : l.id)}
              className="flex items-center gap-2 px-[10px] py-[6px] text-xs cursor-pointer relative transition-[background] duration-100"
              style={{
                background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                borderLeft: isExpanded ? '3px solid var(--accent)' : '3px solid transparent',
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
              {/* Item icon with sockets overlay */}
              {l.icon && (
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

              {/* Seller + time */}
              <div className="flex-1 flex flex-col min-w-0">
                <span
                  className="text-[10px] truncate"
                  style={{
                    color: l.online ? 'var(--accent)' : 'var(--text-dim)',
                  }}
                >
                  {l.account}
                </span>
                {l.indexed && <span className="text-[9px] text-text-dim">{formatTimeAgo(l.indexed)}</span>}
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

              {/* Expand/collapse chevron */}
              <span
                className="absolute bottom-0 left-1/2 -translate-x-1/2 text-text-dim pointer-events-none flex transition-opacity duration-150 row-chevron"
                style={{
                  opacity: isExpanded ? 0.5 : 0,
                }}
              >
                {isExpanded ? (
                  <Up size={12} theme="two-tone" fill={['currentColor', 'rgba(255,255,255,0.2)']} />
                ) : (
                  <Down size={12} theme="two-tone" fill={['currentColor', 'rgba(255,255,255,0.2)']} />
                )}
              </span>
            </div>

            {/* Expanded item details */}
            {expandedListing === l.id &&
              l.itemData &&
              (() => {
                const [slotW, slotH] = getItemSize(itemClass, l.itemData.name || itemName)
                const artW = slotW * 50
                const artH = slotH * 40
                const minH = artH + 24
                return (
                  <div
                    className="px-4 py-3 bg-black/25 flex items-center gap-[14px] relative overflow-hidden border-l-[3px] border-l-[rgba(200,169,110,0.7)]"
                    style={{
                      minHeight: minH,
                    }}
                  >
                    {/* Background blur of item art */}
                    {l.icon && (
                      <img
                        src={l.icon}
                        alt=""
                        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain pointer-events-none"
                        style={{
                          width: '120%',
                          height: '120%',
                          filter: 'blur(40px) saturate(2)',
                          opacity: 0.15,
                        }}
                      />
                    )}

                    {/* Left: Item art + sockets (absolute so it doesn't offset centered text) */}
                    {l.icon && (
                      <div className="absolute left-4 top-0 bottom-0 flex items-center z-[1]">
                        <div className="relative" style={{ width: artW, height: artH }}>
                          <img
                            src={l.icon}
                            alt=""
                            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain pointer-events-none"
                            style={{
                              width: artW * 1.8,
                              height: artH * 1.5,
                              filter: 'blur(14px) saturate(2)',
                              opacity: 0.35,
                            }}
                          />
                          <img
                            src={l.icon}
                            alt=""
                            className="relative object-contain"
                            style={{ width: artW, height: artH }}
                          />
                          {/* Sockets overlay */}
                          {l.itemData.sockets && l.itemData.sockets.length > 0 && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                              {(() => {
                                const sockets = l.itemData!.sockets!
                                const n = sockets.length
                                const is1Wide =
                                  n <= 3 &&
                                  !['Helmets', 'Body Armours', 'Gloves', 'Boots', 'Shields'].includes(itemClass)
                                const sz = 20,
                                  gap = 5

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
                                              width: 5,
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
                                const cellW = sz + gap * 2,
                                  cellH = sz + gap * 2
                                const totalW = cellW * 2,
                                  totalH = cellH * Math.ceil(n / 2)

                                return (
                                  <div className="relative overflow-visible" style={{ width: totalW, height: totalH }}>
                                    {sockets.map((s, si) => {
                                      const [col, row] = positions[si]
                                      const x = col * cellW + gap,
                                        y = row * cellH + gap
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
                                                top: y + (sz - 5) / 2,
                                                width: gap * 2,
                                                height: 5,
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
                                                top: Math.min(row, pr) * cellH + gap + sz + (gap * 2 - 5) / 2,
                                                width: gap * 2,
                                                height: 5,
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
                                          style={{ position: 'absolute', left: x, top: y, width: sz, height: sz }}
                                        />,
                                      ]
                                    })}
                                  </div>
                                )
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Right: Item info + mods */}
                    <div className="flex-1 flex flex-col gap-[2px] text-center items-center z-[1] relative">
                      {/* Copy to clipboard */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          const lines: string[] = []
                          lines.push(`Rarity: ${itemRarity}`)
                          if (l.itemData!.name && l.itemData!.name !== l.itemData!.baseType)
                            lines.push(l.itemData!.name)
                          if (l.itemData!.baseType) lines.push(l.itemData!.baseType)
                          lines.push('--------')
                          if (l.itemData!.ilvl) lines.push(`Item Level: ${l.itemData!.ilvl}`)
                          if (l.itemData!.implicitMods?.length) {
                            lines.push('--------')
                            l.itemData!.implicitMods.forEach((m) => lines.push(`${m} (implicit)`))
                          }
                          if (l.itemData!.explicitMods?.length) {
                            lines.push('--------')
                            l.itemData!.explicitMods.forEach((m) => lines.push(m))
                          }
                          navigator.clipboard.writeText(lines.join('\n'))
                          const btn = e.currentTarget
                          btn.textContent = 'Copied!'
                          setTimeout(() => {
                            btn.textContent = 'Copy to Clipboard'
                          }, 1500)
                        }}
                        className="absolute top-0 right-0 px-2 py-[2px] text-[9px] font-semibold bg-white/[0.06] text-text-dim border-none rounded-[3px] cursor-pointer"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
                          e.currentTarget.style.color = 'var(--text)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                          e.currentTarget.style.color = 'var(--text-dim)'
                        }}
                      >
                        Copy to Clipboard
                      </button>
                      {l.itemData.name && l.itemData.name !== l.itemData.baseType && (
                        <div
                          className="text-xs font-semibold"
                          style={{ color: RARITY_COLORS[itemRarity] ?? '#c8c8c8' }}
                        >
                          {l.itemData.name}
                        </div>
                      )}
                      {l.itemData.baseType && (
                        <div className="text-[10px] text-text-dim">
                          {l.itemData.baseType}
                          {l.itemData.ilvl ? ` (iLvl ${l.itemData.ilvl})` : ''}
                        </div>
                      )}
                      {(l.itemData.gemLevel || l.itemData.quality) && (
                        <div className="text-[10px] text-text-dim flex gap-2">
                          {l.itemData.gemLevel && (
                            <span>
                              Level: <span className="text-text font-semibold">{l.itemData.gemLevel}</span>
                            </span>
                          )}
                          {l.itemData.quality && (
                            <span>
                              Quality: <span className="text-text font-semibold">+{l.itemData.quality}%</span>
                            </span>
                          )}
                        </div>
                      )}
                      {(l.itemData.armour || l.itemData.evasion || l.itemData.energyShield) && (
                        <div className="text-[10px] text-text-dim flex gap-2">
                          {l.itemData.armour ? (
                            <span>
                              AR: <span className="text-[#88ccff] font-semibold">{l.itemData.armour}</span>
                            </span>
                          ) : null}
                          {l.itemData.evasion ? (
                            <span>
                              EV: <span className="text-[#88ccff] font-semibold">{l.itemData.evasion}</span>
                            </span>
                          ) : null}
                          {l.itemData.energyShield ? (
                            <span>
                              ES: <span className="text-[#88ccff] font-semibold">{l.itemData.energyShield}</span>
                            </span>
                          ) : null}
                        </div>
                      )}
                      {(l.itemData.pdps || l.itemData.edps) && (
                        <div className="text-[10px] text-text-dim flex gap-2">
                          {l.itemData.pdps ? (
                            <span>
                              pDPS: <span className="text-[#88ccff] font-semibold">{Math.round(l.itemData.pdps)}</span>
                            </span>
                          ) : null}
                          {l.itemData.edps ? (
                            <span>
                              eDPS: <span className="text-[#88ccff] font-semibold">{Math.round(l.itemData.edps)}</span>
                            </span>
                          ) : null}
                          {l.itemData.dps ? (
                            <span>
                              DPS: <span className="text-[#88ccff] font-semibold">{Math.round(l.itemData.dps)}</span>
                            </span>
                          ) : null}
                        </div>
                      )}
                      {l.itemData.implicitMods && l.itemData.implicitMods.length > 0 && (
                        <div
                          className="mt-1 pt-1 w-full"
                          style={{
                            backgroundImage:
                              'linear-gradient(90deg, transparent, var(--border) 20%, var(--border) 80%, transparent)',
                            backgroundSize: '200px 1px',
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'top center',
                          }}
                        >
                          {l.itemData.implicitMods.map((mod, mi) => (
                            <div key={mi} className="text-[10px] text-[#8787FE]">
                              {mod}
                            </div>
                          ))}
                        </div>
                      )}
                      {l.itemData.explicitMods && l.itemData.explicitMods.length > 0 && (
                        <div
                          className="mt-[2px] pt-1 w-full"
                          style={{
                            backgroundImage:
                              'linear-gradient(90deg, transparent, var(--border) 20%, var(--border) 80%, transparent)',
                            backgroundSize: '200px 1px',
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'top center',
                          }}
                        >
                          {l.itemData.explicitMods.map((mod, mi) => (
                            <div key={mi} className="text-[10px] text-[#8787FE]">
                              {mod}
                            </div>
                          ))}
                        </div>
                      )}
                      {(l.itemData.identified === false || l.itemData.corrupted || l.itemData.mirrored) && (
                        <div
                          className="mt-1 pt-1 w-full flex flex-col gap-[2px]"
                          style={{
                            backgroundImage:
                              'linear-gradient(90deg, transparent, var(--border) 20%, var(--border) 80%, transparent)',
                            backgroundSize: '200px 1px',
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'top center',
                          }}
                        >
                          {l.itemData.identified === false && (
                            <div className="text-[10px] text-[#ef5350] font-semibold">Unidentified</div>
                          )}
                          {l.itemData.mirrored && (
                            <div className="text-[10px] text-[#8787FE] font-semibold">Mirrored</div>
                          )}
                          {l.itemData.corrupted && (
                            <div className="text-[10px] text-[#ef5350] font-semibold">Corrupted</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}
          </div>
        )
      })}
      {total != null && total > listings.length && (
        <div className="px-[10px] py-1 text-[9px] text-text-dim text-center">
          Showing {listings.length} of {total} results
        </div>
      )}
    </div>
  )
}
