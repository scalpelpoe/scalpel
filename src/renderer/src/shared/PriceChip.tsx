import { chaosIcon, divineIcon } from './icons'
import ninjaIcon from '../assets/other/poe-ninja.png'
import { formatPrice } from './utils'

interface InfoChipProps {
  icon?: string
  label?: string
  children: React.ReactNode
  size?: 'sm' | 'md'
  color?: string
  className?: string
}

export function InfoChip({ icon, label, children, size = 'md', color, className }: InfoChipProps): JSX.Element {
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-[11px]'
  return (
    <div
      className={`inline-flex items-center gap-[3px] bg-black/30 rounded-full px-2 py-[3px] ${textSize} ${className ?? ''}`}
      style={color ? { color } : undefined}
    >
      {icon && <img src={icon} alt="" className="w-3 h-3" />}
      {label && <span className="text-text-dim">{label}</span>}
      {children}
    </div>
  )
}

interface PriceChipProps {
  chaosValue: number
  divineValue?: number | null
  chaosPerDivine?: number
  label?: string
  showNinja?: boolean
  size?: 'sm' | 'md'
}

export function PriceChip({
  chaosValue,
  divineValue,
  chaosPerDivine,
  label,
  showNinja,
  size = 'md',
}: PriceChipProps): JSX.Element {
  const useDivine =
    divineValue != null
      ? divineValue >= 1
      : chaosPerDivine != null && chaosPerDivine > 0 && chaosValue >= chaosPerDivine
  const displayValue = useDivine
    ? formatPrice(divineValue != null && divineValue >= 1 ? divineValue : chaosValue / chaosPerDivine!)
    : formatPrice(chaosValue)
  const currencyIcon = useDivine ? divineIcon : chaosIcon

  return (
    <InfoChip icon={showNinja ? ninjaIcon : undefined} label={label} size={size}>
      <span className="font-semibold">{displayValue}</span>
      <img src={currencyIcon} alt="" className="w-3 h-3" />
    </InfoChip>
  )
}
