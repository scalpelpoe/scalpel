import { formatDivCardPrice } from './utils'
import { CurrencyIcon } from '../../shared/CurrencyIcon'

interface DivCardPriceChipProps {
  value: number
  divineRate: number
}

export function DivCardPriceChip({ value, divineRate }: DivCardPriceChipProps): JSX.Element {
  const { text, currencyKey } = formatDivCardPrice(value, divineRate)
  return (
    <span className="inline-flex items-center gap-[2px]">
      {text}
      <CurrencyIcon name={currencyKey} className="w-[10px] h-[10px]" />
    </span>
  )
}
