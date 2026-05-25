import { useEffect, useState } from 'react'

/** Lightweight pre-flight check for the "Run Economy Audit" button. Calls
 *  batchLookupPrices on the block's base-type list and returns true when the
 *  server confirms zero priced items (common in PoE2 where poe.ninja only
 *  covers a handful of categories). Returns undefined while the check is
 *  still in flight so the caller can keep the button enabled until we know
 *  for sure -- flickering enabled->disabled on every block view would be
 *  worse than the occasional "open audit, find it empty" path.
 *
 *  Main-process price lookup is a Map access after a league-scoped ninja
 *  refresh, so calling this on every block view is cheap; no renderer-side
 *  cache needed. */
export function useAuditPricePreview(baseTypes: string[], isUniqueTier: boolean): boolean | undefined {
  const [noPrices, setNoPrices] = useState<boolean | undefined>(undefined)
  const key = baseTypes.join('|')

  useEffect(() => {
    if (baseTypes.length === 0) {
      setNoPrices(undefined)
      return
    }
    let cancelled = false
    setNoPrices(undefined)
    void (async (): Promise<void> => {
      const settings = await window.api.getSettings()
      const prices = await window.api.batchLookupPrices(baseTypes, settings.activeProfile?.league ?? '', isUniqueTier)
      if (cancelled) return
      setNoPrices(Object.values(prices).every((p) => p == null))
    })()
    return () => {
      cancelled = true
    }
  }, [key, isUniqueTier])

  return noPrices
}
