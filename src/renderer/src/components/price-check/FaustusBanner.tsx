import { useMemo } from 'react'
import type { PoeItem, PriceInfo } from '../../../../shared/types'
import { isFaustusItem } from '../../../../shared/data/trade/faustus-items'
import { faustusPortrait } from '../../shared/icons'
import { PriceChip } from '../../shared/PriceChip'

/** Extra flavor appended to the Faustus subtitle. One is picked per item view */
const FAUSTUS_JOKES: string[] = [
  'Plus he might give you an update on the Marylene.',
  'The pirate math nerd knows a lot.',
  '',
  'Look at this tricorn hat wearing dork lmao.',
  'The ninja price is probably close enough.',
  "Don't let the price fixers win.",
  'Yeah, you might have to leave your map.',
  'You have to sell it there anyways.',
]

interface FaustusBannerProps {
  item: PoeItem
  priceInfo?: PriceInfo
  chaosPerDivine?: number
}

/** Navy-rounded card that surfaces when an item is better priced via Faustus' Currency
 *  Exchange than the web trade. */
export function FaustusBanner({ item, priceInfo, chaosPerDivine }: FaustusBannerProps): JSX.Element | null {
  const joke = useMemo(
    () => FAUSTUS_JOKES[Math.floor(Math.random() * FAUSTUS_JOKES.length)],
    [item.name, item.baseType],
  )

  if (!isFaustusItem(item.itemClass, item.baseType, item.rarity)) return null

  return (
    <div className="relative flex items-stretch gap-3 my-2 rounded-lg overflow-visible bg-bg-card">
      <div className="relative shrink-0 w-[100px]">
        <img
          src={faustusPortrait}
          alt=""
          className="absolute bottom-0 left-2 w-[92px] pointer-events-none select-none"
        />
      </div>
      <div className="flex-1 py-3 flex flex-col justify-center">
        <div className="text-[11px] text-[#ffc83c] font-semibold">You should check Faustus to price this item</div>
        <div className="text-[10px] text-text-dim">
          The in-game Currency Exchange has more accurate pricing than bulk trade. {joke}
        </div>
      </div>
      {priceInfo && priceInfo.chaosValue > 0 && (
        <div className="flex flex-col gap-1 items-end shrink-0 self-center pr-3">
          <PriceChip chaosValue={priceInfo.chaosValue} divineValue={priceInfo.divineValue} showNinja />
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
