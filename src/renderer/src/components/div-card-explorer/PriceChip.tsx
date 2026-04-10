import { formatPrice } from './utils'

interface PriceChipProps {
  value: number
  divineRate: number
}

export function PriceChip({ value, divineRate }: PriceChipProps): JSX.Element {
  const { text, icon } = formatPrice(value, divineRate)
  return (
    <span className="inline-flex items-center gap-[2px]">
      {text}
      <img src={icon} alt="" className="w-[10px] h-[10px]" />
    </span>
  )
}
