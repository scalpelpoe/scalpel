import { useMemo } from 'react'
import type { PoeItem, PriceInfo } from '@shared/types'
import { isVendorExchangeItem } from '@shared/data/trade/bulk-exchange-eligibility'
import { angePortrait } from '../../shared/icons'
import { PriceChip } from '../../shared/PriceChip'
import { NinjaPriceChip } from '../../shared/NinjaPriceChip'

/** Extra flavor appended to the Ange subtitle. One is picked per item view.  */
const ANGE_JOKES: string[] = [
  '',
  "Yeah, lady, it's me.",
  "She's right there, might as well ask.",
  'The ninja price is probably close enough.',
  "Don't let the price fixers win.",
  'Yeah, you might have to leave your map.',
  'You have to sell it there anyways.',
  'Hail.',
]

interface AngeBannerProps {
  item: PoeItem
  priceInfo?: PriceInfo
  chaosPerDivine?: number
  divineGraph?: (number | null)[]
}

/** PoE2 analog of FaustusBanner -- surfaces when the item is better priced at
 *  Ange's Currency Exchange than via the web trade API. */
export function AngeBanner({ item, priceInfo, chaosPerDivine, divineGraph }: AngeBannerProps): JSX.Element | null {
  const joke = useMemo(() => ANGE_JOKES[Math.floor(Math.random() * ANGE_JOKES.length)], [item.name, item.baseType])

  if (!isVendorExchangeItem(2, item.itemClass, item.baseType, item.rarity)) return null

  return (
    <div className="relative flex items-stretch gap-3 my-2 rounded-lg overflow-visible bg-bg-card">
      <div className="relative shrink-0 w-[100px]">
        <img src={angePortrait} alt="" className="absolute bottom-0 left-2 w-[82px] pointer-events-none select-none" />
      </div>
      <div className="flex-1 py-3 flex flex-col justify-center">
        <div className="text-[11px] text-[#ffc83c] font-semibold">You should check Ange to price this item</div>
        <div className="text-[10px] text-text-dim">
          The in-game Currency Exchange has more accurate pricing than bulk trade. {joke}
        </div>
      </div>
      {priceInfo && priceInfo.chaosValue > 0 && (
        <div className="flex flex-col gap-1 items-end shrink-0 self-center pr-3">
          <NinjaPriceChip
            baseType={item.baseType}
            priceInfo={priceInfo}
            chaosPerDivine={chaosPerDivine}
            divineGraph={divineGraph}
          />
          {item.stackSize > 1 && (
            <PriceChip
              chaosValue={priceInfo.chaosValue * item.stackSize}
              chaosPerDivine={chaosPerDivine}
              label={`${item.stackSize}x =`}
              size="sm"
            />
          )}
        </div>
      )}
    </div>
  )
}
