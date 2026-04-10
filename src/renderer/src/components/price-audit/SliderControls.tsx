import { chaosIcon, divineIcon } from '../../shared/icons'
import dustIcon from '../../assets/currency/thaumaturgic-dust.png'
import { formatDust, logPos, logScale, mirrorIcon, setLastMovedAbove, setLastMovedBelow } from './constants'

interface FilterModeToggleProps {
  hasDust: boolean
  filterMode: 'price' | 'dust' | 'both'
  setFilterMode: (m: 'price' | 'dust' | 'both') => void
  setMovedBelow: (v: string | null) => void
  setMovedAbove: (v: string | null) => void
}

export function FilterModeToggle({
  hasDust,
  filterMode,
  setFilterMode,
  setMovedBelow,
  setMovedAbove,
}: FilterModeToggleProps): JSX.Element | null {
  if (!hasDust) return null
  return (
    <div className="flex bg-black/30 rounded-full px-[3px] py-[2px] shrink-0 relative cursor-pointer self-stretch items-center">
      {(['price', 'dust', 'both'] as const).map((mode) => (
        <div
          key={mode}
          onClick={() => {
            setFilterMode(mode)
            setLastMovedBelow(null)
            setLastMovedAbove(null)
            setMovedBelow(null)
            setMovedAbove(null)
          }}
          onMouseEnter={(e) => {
            if (filterMode !== mode)
              e.currentTarget.style.background = filterMode === mode ? 'var(--accent)' : 'rgba(255,255,255,0.1)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = filterMode === mode ? 'var(--accent)' : 'transparent'
          }}
          className="text-[9px] font-bold uppercase px-2 py-1 text-center rounded-full cursor-pointer select-none transition-[background,color] duration-200 ease-in-out leading-[1.2]"
          style={{
            color: filterMode === mode ? '#171821' : 'var(--text-dim)',
            background: filterMode === mode ? 'var(--accent)' : 'transparent',
          }}
        >
          {mode}
        </div>
      ))}
    </div>
  )
}

interface PriceSliderProps {
  threshold: number
  maxPrice: number
  divineRate: number
  mirrorRate: number
  setThreshold: (v: number) => void
  setMovedBelow: (v: string | null) => void
  setMovedAbove: (v: string | null) => void
}

export function PriceSlider({
  threshold,
  maxPrice,
  divineRate,
  mirrorRate,
  setThreshold,
  setMovedBelow,
  setMovedAbove,
}: PriceSliderProps): JSX.Element {
  const thresholdInMir = mirrorRate > 0 ? threshold / mirrorRate : 0
  const thresholdInDiv = divineRate > 0 ? threshold / divineRate : 0
  const showMir = thresholdInMir >= 1
  const showDiv = !showMir && thresholdInDiv >= 1

  const pos = logPos(threshold, maxPrice)
  const pct = pos / 10

  return (
    <div className="flex-1 flex items-center gap-[6px] bg-black/30 rounded-full pl-[6px] pr-[10px] py-1 relative overflow-hidden">
      <img
        src={chaosIcon}
        alt=""
        className="absolute -left-[10px] top-1/2 -translate-y-1/2 w-[60px] h-[60px] object-contain opacity-40 pointer-events-none"
        style={{ filter: 'blur(12px) saturate(2.5)' }}
      />
      <img
        src={showMir ? mirrorIcon : showDiv ? divineIcon : chaosIcon}
        alt=""
        className="w-3.5 h-3.5 shrink-0 relative z-[1]"
      />
      <input
        type="range"
        min={0}
        max={1000}
        step={1}
        value={pos}
        onChange={(e) => {
          setThreshold(logScale(Number(e.target.value), maxPrice))
          setLastMovedBelow(null)
          setLastMovedAbove(null)
          setMovedBelow(null)
          setMovedAbove(null)
        }}
        className="flex-1 min-w-0 h-1 rounded-sm"
        style={{
          background: `linear-gradient(to right, rgba(200,160,80,0.5) ${pct}%, rgba(255,255,255,0.12) ${pct}%)`,
        }}
      />
      <span className="text-[11px] font-mono text-accent font-semibold shrink-0 min-w-[32px] text-right">
        {showMir
          ? thresholdInMir >= 10
            ? `${Math.round(thresholdInMir)}m`
            : `${thresholdInMir.toFixed(1)}m`
          : showDiv
            ? thresholdInDiv >= 10
              ? `${Math.round(thresholdInDiv)}d`
              : `${thresholdInDiv.toFixed(1)}d`
            : threshold < 10
              ? `${threshold.toFixed(1)}c`
              : `${threshold}c`}
      </span>
    </div>
  )
}

interface DustSliderProps {
  dustThreshold: number
  maxDust: number
  minDust: number
  setDustThreshold: (v: number) => void
  setMovedBelow: (v: string | null) => void
  setMovedAbove: (v: string | null) => void
}

export function DustSlider({
  dustThreshold,
  maxDust,
  minDust,
  setDustThreshold,
  setMovedBelow,
  setMovedAbove,
}: DustSliderProps): JSX.Element {
  const pct = maxDust > minDust ? ((dustThreshold - minDust) / (maxDust - minDust)) * 100 : 0
  const step = Math.max(1, Math.round((maxDust - minDust) / 200))

  return (
    <div className="flex-1 flex items-center gap-[6px] bg-black/30 rounded-full pl-[6px] pr-[10px] py-1 relative overflow-hidden">
      <img
        src={dustIcon}
        alt=""
        className="absolute -left-[10px] top-1/2 -translate-y-1/2 w-[60px] h-[60px] object-contain opacity-40 pointer-events-none"
        style={{ filter: 'blur(12px) saturate(2.5)' }}
      />
      <img src={dustIcon} alt="" className="w-3.5 h-3.5 shrink-0 relative z-[1]" />
      <input
        type="range"
        min={minDust}
        max={maxDust}
        step={step}
        value={dustThreshold}
        onChange={(e) => {
          setDustThreshold(Number(e.target.value))
          setLastMovedBelow(null)
          setLastMovedAbove(null)
          setMovedBelow(null)
          setMovedAbove(null)
        }}
        className="flex-1 min-w-0 h-1 rounded-sm"
        style={{
          background: `linear-gradient(to right, rgba(110,120,190,0.5) ${pct}%, rgba(255,255,255,0.12) ${pct}%)`,
        }}
      />
      <span className="text-[11px] font-mono text-accent font-semibold shrink-0 min-w-[32px] text-right">
        {formatDust(dustThreshold)}
      </span>
    </div>
  )
}
