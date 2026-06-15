import type { PriceInfo } from '@shared/types'
import { pairCurrencyRole } from './pair-currency'
import { PriceChip } from './PriceChip'
import { usePoeVersion } from './poe-version-context'

interface NinjaPriceChipProps {
  /** Clipboard base type of the displayed item - drives pair-currency detection. */
  baseType: string
  priceInfo: PriceInfo
  /** Live divine rate from the IPC payload. Optional: for the inverse orb the
   *  rate is derivable from its own price entry (divineValue = 1/rate), so the
   *  fraction renders even when the caller has nothing to pass. */
  chaosPerDivine?: number
  /** Divine Orb's sparkline, for charting the divine rate on the inverse orb.
   *  Without it the fraction chip simply has no hover chart. */
  divineGraph?: (number | null)[]
  size?: 'sm' | 'md'
}

/** The poe.ninja price chip for an item. Measuring-stick currencies (see
 *  pair-currency.ts) get cross-denomination treatment: Divine Orb shows its
 *  baseline-currency price unpromoted, the baseline orb shows a 1/N divine
 *  fraction whose hover chart is the divine-rate chart. Everything else is a
 *  normal auto-promoting PriceChip. Single source of truth for the price-check
 *  header, the Ange/Faustus banners, and the filter-page ItemSummary. */
export function NinjaPriceChip({
  baseType,
  priceInfo,
  chaosPerDivine,
  divineGraph,
  size,
}: NinjaPriceChipProps): JSX.Element | null {
  const version = usePoeVersion()
  if (priceInfo.chaosValue <= 0) return null
  const pairRole = pairCurrencyRole(baseType, version)
  const rate =
    chaosPerDivine != null && chaosPerDivine > 0
      ? chaosPerDivine
      : priceInfo.divineValue != null && priceInfo.divineValue > 0
        ? priceInfo.chaosValue / priceInfo.divineValue
        : undefined
  if (pairRole === 'inverse' && rate != null) {
    // chaosPerDivine is intentionally NOT passed here. The sparkline peak/valley
    // chips for the divine-rate chart must stay baseline-denominated; passing the
    // rate as chaosValue with noPromote (and no chaosPerDivine) achieves that.
    // Do not add chaosPerDivine to this PriceChip call.
    return (
      <PriceChip
        chaosValue={rate}
        graph={divineGraph}
        noPromote
        displayOverride={{ text: `1/${Math.round(rate)}`, currencyKey: 'divine' }}
        showNinja
        size={size}
      />
    )
  }
  return (
    <PriceChip
      chaosValue={priceInfo.chaosValue}
      divineValue={priceInfo.divineValue}
      graph={priceInfo.graph}
      noPromote={pairRole === 'rate'}
      showNinja
      size={size}
    />
  )
}
