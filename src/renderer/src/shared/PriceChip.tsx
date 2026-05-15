import { useState } from 'react'
import { getCurrencyIcons } from './icons'
import { usePoeVersion } from './poe-version-context'
import ninjaIcon from '../assets/other/poe-ninja.png'
import { formatPrice } from './utils'
import { PriceTrend } from './PriceTrend'
import { SparklineOverlay } from './SparklineOverlay'
import { InfoChip } from './InfoChip'

interface PriceChipProps {
  chaosValue: number
  divineValue?: number | null
  chaosPerDivine?: number
  label?: string
  showNinja?: boolean
  size?: 'sm' | 'md'
  /** 7-day percent-change graph entries from poe.ninja. When present, renders a
   *  trend arrow and sparkline overlay on hover. */
  graph?: (number | null)[]
  /** When true, suppress the trend arrow and sparkline overlay. */
  hideTrend?: boolean
}

export function PriceChip({
  chaosValue,
  divineValue,
  chaosPerDivine,
  label,
  showNinja,
  size = 'md',
  graph,
  hideTrend,
}: PriceChipProps): JSX.Element {
  const icons = getCurrencyIcons(usePoeVersion())
  const useDivine =
    divineValue != null
      ? divineValue >= 1
      : chaosPerDivine != null && chaosPerDivine > 0 && chaosValue >= chaosPerDivine
  const displayValue = useDivine
    ? formatPrice(divineValue != null && divineValue >= 1 ? divineValue : chaosValue / chaosPerDivine!)
    : formatPrice(chaosValue)
  const currencyIcon = useDivine ? icons.divine : icons.baseline

  const showTrend = !hideTrend && graph != null && graph.length > 0
  const [hovered, setHovered] = useState(false)
  // Viewport-space cursor position + scale, used by the portaled overlay so it can
  // sit above content without being clipped by the chip's transformed ancestor.
  const [cursor, setCursor] = useState({ viewportX: 0, viewportY: 0, scale: 1 })

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>): void {
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    const unscaledWidth = el.offsetWidth
    const scale = unscaledWidth > 0 ? rect.width / unscaledWidth : 1
    setCursor({ viewportX: e.clientX, viewportY: e.clientY, scale })
  }

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={showTrend ? () => setHovered(true) : undefined}
      onMouseLeave={showTrend ? () => setHovered(false) : undefined}
      onMouseMove={showTrend ? handleMouseMove : undefined}
    >
      <InfoChip icon={showNinja ? ninjaIcon : undefined} label={label} size={size}>
        <span className="font-semibold">{displayValue}</span>
        <img src={currencyIcon} alt="" className="w-3 h-3" />
        {showTrend && <PriceTrend graph={graph} />}
      </InfoChip>
      {showTrend && (
        <SparklineOverlay
          graph={graph}
          visible={hovered}
          cursor={cursor}
          currentPrice={{ chaosValue, divineValue, chaosPerDivine }}
        />
      )}
    </div>
  )
}
