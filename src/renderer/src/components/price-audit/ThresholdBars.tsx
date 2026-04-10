import { chaosIcon, divineIcon } from '../../shared/icons'
import dustIcon from '../../assets/currency/thaumaturgic-dust.png'
import type { FilterBlock } from '../../../../shared/types'
import { AuditItem, formatDust, formatTierLabel, mirrorIcon, retierSelectStyle } from './constants'

interface TierSibling {
  tier: string
  blockIndex: number
  block: FilterBlock
  visibility?: string
}

interface ThresholdBarsProps {
  pricedItems: AuditItem[]
  aboveThreshold: AuditItem[]
  middleItems: AuditItem[]
  belowThreshold: AuditItem[]
  threshold: number
  dustThreshold: number
  divineRate: number
  mirrorRate: number
  filterMode: 'price' | 'dust' | 'both'
  hasDust: boolean
  isBothMode: boolean
  higherTier: TierSibling | null
  lowerTier: TierSibling | null
  tiersAbove: TierSibling[]
  tiersBelow: TierSibling[]
  effectiveAboveTarget: number | null
  effectiveBelowTarget: number | null
  setAboveTarget: (v: number | null) => void
  setBelowTarget: (v: number | null) => void
  movedAbove: string | null
  movedBelow: string | null
  moving: boolean
  handleMoveAbove: () => Promise<void>
  handleMoveBelow: () => Promise<void>
}

export function ThresholdBars({
  pricedItems,
  aboveThreshold,
  middleItems,
  belowThreshold,
  threshold,
  dustThreshold,
  divineRate,
  mirrorRate,
  filterMode,
  hasDust,
  isBothMode,
  higherTier,
  lowerTier,
  tiersAbove,
  tiersBelow,
  effectiveAboveTarget,
  effectiveBelowTarget,
  setAboveTarget,
  setBelowTarget,
  movedAbove,
  movedBelow,
  moving,
  handleMoveAbove,
  handleMoveBelow,
}: ThresholdBarsProps): JSX.Element | null {
  if (pricedItems.length === 0) return null

  const thresholdInMir = mirrorRate > 0 ? threshold / mirrorRate : 0
  const thresholdInDiv = divineRate > 0 ? threshold / divineRate : 0
  const showMir = thresholdInMir >= 1
  const showDiv = !showMir && thresholdInDiv >= 1

  const priceLabel = showMir
    ? thresholdInMir >= 10
      ? `${Math.round(thresholdInMir)}`
      : thresholdInMir.toFixed(1)
    : showDiv
      ? thresholdInDiv >= 10
        ? `${Math.round(thresholdInDiv)}`
        : thresholdInDiv.toFixed(1)
      : threshold < 10
        ? `${threshold.toFixed(1)}`
        : String(threshold)
  const priceIcon = showMir ? mirrorIcon : showDiv ? divineIcon : chaosIcon

  const priceChipContent = (prefix: string) => (
    <span className="flex items-center gap-[3px]">
      {prefix && <span className="text-[9px] font-normal leading-none">{prefix}</span>}
      {priceLabel}
      <img src={priceIcon} alt="" className="w-3 h-3" />
    </span>
  )
  const dustChipContent = (prefix: string) => (
    <span className="flex items-center gap-[3px]">
      {prefix && <span className="text-[9px] font-normal leading-none">{prefix}</span>}
      {formatDust(dustThreshold)}
      <img src={dustIcon} alt="" className="w-3 h-3" />
    </span>
  )
  const chipContent = (prefix: string) => (
    <>
      {prefix && <span className="text-[9px] font-normal leading-none flex items-center">{prefix}</span>}
      {filterMode !== 'dust' && priceChipContent('')}
      {hasDust && filterMode !== 'price' && dustChipContent('')}
    </>
  )
  const pillCls =
    'text-[10px] text-accent font-bold font-mono shrink-0 flex items-center gap-[6px] bg-bg-card rounded-full px-[10px] py-[3px] border border-border'
  const thresholdChips = (prefix: string, pill?: boolean) => (
    <div
      className={`text-[10px] text-accent font-bold font-mono shrink-0 flex items-center gap-[6px]${pill ? ' bg-bg-card rounded-full px-[10px] py-[3px] border border-border' : ''}`}
    >
      {chipContent(prefix)}
    </div>
  )

  const topOrder = aboveThreshold.length * 4 - 2
  const bottomOrder = isBothMode ? (aboveThreshold.length + middleItems.length) * 4 - 2 : aboveThreshold.length * 4 - 1

  // When bars are adjacent (single mode with both tiers), show a shared threshold pill
  const barsTouch = !isBothMode && higherTier && lowerTier

  return (
    <>
      {/* Promotion bar (green): Move Above */}
      {higherTier && (
        <div
          className="flex items-center px-2 py-[6px] bg-[rgba(80,180,80,0.25)] gap-1 relative justify-center"
          style={{ order: topOrder }}
        >
          {movedAbove ? (
            <span className="text-[10px] text-accent font-semibold text-center flex-1">{movedAbove}</span>
          ) : aboveThreshold.length > 0 ? (
            <div className={`flex ${isBothMode ? 'items-start' : 'items-center'} justify-center w-full`}>
              {isBothMode && <div className={`${pillCls} absolute left-2`}>{priceChipContent('>')}</div>}
              <div className="flex flex-col items-center -mt-[6px]">
                <div className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-b-[6px] border-b-[rgba(30,75,30,0.85)] mb-0 -mt-[6px]" />
                <div className="flex items-center gap-[6px] text-[10px] font-semibold bg-black/35 rounded-b-[6px] px-3 py-[5px]">
                  <span className="text-[#ccc] whitespace-nowrap">Move the {aboveThreshold.length} items above to</span>
                  <select
                    value={effectiveAboveTarget ?? ''}
                    onChange={(e) => setAboveTarget(Number(e.target.value))}
                    disabled={tiersAbove.length <= 1}
                    style={{ ...retierSelectStyle, opacity: tiersAbove.length <= 1 ? 0.7 : 1 }}
                  >
                    {tiersAbove.map((s) => (
                      <option key={s.blockIndex} value={s.blockIndex}>
                        {formatTierLabel(s.tier)}
                        {s.visibility === 'Hide' ? ' [HIDDEN]' : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleMoveAbove}
                    disabled={moving}
                    className="px-[10px] py-[3px] text-[10px] font-semibold bg-accent text-[#171821] whitespace-nowrap rounded-full"
                    style={{ opacity: moving ? 0.5 : 1 }}
                  >
                    Retier Items
                  </button>
                </div>
              </div>
              {isBothMode && <div className={`${pillCls} absolute right-2`}>{dustChipContent('>')}</div>}
            </div>
          ) : null}
          {!barsTouch && !isBothMode && (
            <>
              <div className={`${pillCls} absolute left-2`}>{chipContent('')}</div>
              <div className={`${pillCls} absolute right-2`}>{chipContent('')}</div>
            </>
          )}
        </div>
      )}

      {/* Shared threshold chips between touching bars */}
      {barsTouch && (
        <div className="flex justify-between -mt-[10px] -mb-[10px] relative z-[2] px-2" style={{ order: topOrder + 1 }}>
          <div className="bg-bg-card rounded-full px-[10px] py-[3px] border border-border">{thresholdChips('')}</div>
          <div className="bg-bg-card rounded-full px-[10px] py-[3px] border border-border">{thresholdChips('')}</div>
        </div>
      )}

      {/* Relegation bar (red): Move Below */}
      {lowerTier && (
        <div
          className="flex items-center px-2 py-[6px] bg-[rgba(200,80,80,0.25)] gap-1 justify-center relative"
          style={{ order: bottomOrder }}
        >
          {movedBelow ? (
            <span className="text-[10px] text-accent font-semibold text-center flex-1">{movedBelow}</span>
          ) : belowThreshold.length > 0 ? (
            <div className={`flex ${isBothMode ? 'items-end' : 'items-center'} justify-center w-full`}>
              {isBothMode && <div className={`${pillCls} absolute left-2`}>{priceChipContent('<')}</div>}
              <div className="flex flex-col items-center -mb-[6px]">
                <div className="flex items-center gap-[6px] text-[10px] font-semibold bg-black/35 rounded-t-[6px] px-3 py-[5px]">
                  <span className="text-[#ccc] whitespace-nowrap">Move the {belowThreshold.length} items below to</span>
                  <select
                    value={effectiveBelowTarget ?? ''}
                    onChange={(e) => setBelowTarget(Number(e.target.value))}
                    disabled={tiersBelow.length <= 1}
                    style={{ ...retierSelectStyle, opacity: tiersBelow.length <= 1 ? 0.7 : 1 }}
                  >
                    {tiersBelow.map((s) => (
                      <option key={s.blockIndex} value={s.blockIndex}>
                        {formatTierLabel(s.tier)}
                        {s.visibility === 'Hide' ? ' [HIDDEN]' : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleMoveBelow}
                    disabled={moving}
                    className="px-[10px] py-[3px] text-[10px] font-semibold bg-accent text-[#171821] whitespace-nowrap rounded-full"
                    style={{ opacity: moving ? 0.5 : 1 }}
                  >
                    Retier Items
                  </button>
                </div>
                <div className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[6px] border-t-[rgba(75,30,30,0.85)] mt-0 -mb-[6px]" />
              </div>
              {isBothMode && <div className={`${pillCls} absolute right-2`}>{dustChipContent('<')}</div>}
            </div>
          ) : null}
          {!barsTouch && !isBothMode && (
            <>
              <div className={`${pillCls} absolute left-2`}>{chipContent('')}</div>
              <div className={`${pillCls} absolute right-2`}>{chipContent('')}</div>
            </>
          )}
        </div>
      )}
    </>
  )
}
