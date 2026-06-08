import { formatPrice } from './utils'
import { CurrencyIcon } from '../../shared/CurrencyIcon'

interface PriceChipProps {
  value: number
  divineRate: number
}

export function PriceChip({ value, divineRate }: PriceChipProps): JSX.Element {
  const { text, currencyKey } = formatPrice(value, divineRate)
  return (
    <span className="inline-flex items-center gap-[2px]">
      {text}
      <CurrencyIcon name={currencyKey} className="w-[10px] h-[10px]" />
    </span>
  )
}
