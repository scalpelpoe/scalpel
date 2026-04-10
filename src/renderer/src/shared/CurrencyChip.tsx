import type { CSSProperties } from 'react'
import { formatPrice } from './utils'

interface CurrencyChipProps {
  value: number | string
  icon: string
  iconSize?: number
  className?: string
  style?: CSSProperties
  fallback?: string
  iconPosition?: 'before' | 'after'
}

export function CurrencyChip({
  value,
  icon,
  iconSize = 12,
  className = 'inline-flex items-center gap-[3px] bg-black/25 rounded-full px-2 py-[3px] text-[11px]',
  style,
  fallback,
  iconPosition = 'before',
}: CurrencyChipProps): JSX.Element {
  if (value === 0 && fallback) {
    return (
      <span className={className} style={style}>
        <span className="text-text-dim text-[10px]">{fallback}</span>
      </span>
    )
  }

  const displayValue = typeof value === 'number' ? formatPrice(value) : value

  const iconEl = <img src={icon} alt="" style={{ width: iconSize, height: iconSize }} />
  const valueEl = <span className="text-white font-semibold">{displayValue}</span>

  return (
    <span className={className} style={style}>
      {iconPosition === 'before' ? (
        <>
          {iconEl}
          {valueEl}
        </>
      ) : (
        <>
          {valueEl}
          {iconEl}
        </>
      )}
    </span>
  )
}
