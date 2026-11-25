import { useState } from 'react'
import { SCRYING_ORB_AREAS, scryingAreaForMap } from '@shared/data/trade/scrying-orbs'
import { getTradeUrls } from '@shared/endpoints'
import { CurrencyIcon } from '../../shared/CurrencyIcon'
import { formatPriceTooltip } from '../../shared/currency-short-labels'

interface ScryingOrbButtonProps {
  mapName: string
}

interface ScryingResult {
  price: { amount: number; currency: string } | null
  total: number
  url: string
}

type Status = 'idle' | 'loading' | 'priced' | 'error'

// Module-level so a priced result survives the panel unmounting: ExpandedCardList
// only exists while its map row is expanded, so component state alone would drop
// the price on collapse and a re-expand would spend a fresh trade search (and rate
// limit budget) re-pricing an area the user already saw this session.
const sessionCache = new Map<string, ScryingResult>()

function renderContent(status: Status, result: ScryingResult | null): JSX.Element {
  if (status === 'loading') return <>Searching...</>
  if (status === 'error') {
    return (
      <>
        Scrying Orb <span className="text-text-dim font-normal">search failed</span>
      </>
    )
  }
  if (status === 'priced' && result) {
    if (!result.price) {
      return (
        <>
          Scrying Orb <span className="text-text-dim font-normal">none listed</span>
        </>
      )
    }
    // The label flips to "Buy" once priced: the click has already spent its
    // search, so from here the button only reopens the saved trade query.
    return (
      <>
        Buy Scrying Orb
        <span
          className="inline-flex items-center gap-[2px]"
          title={formatPriceTooltip(result.price.amount, result.price.currency)}
        >
          {result.price.amount}
          <CurrencyIcon name={result.price.currency} className="w-[10px] h-[10px]" />
        </span>
        <span className="text-text-dim font-normal">{result.total} listed</span>
      </>
    )
  }
  return <>Check Scrying Orb Price</>
}

/** "Scrying Orb" button for the Div Card Explorer's expanded map panel. A
 *  Scrying Orb is bound to a single map area. The map row already shows
 *  poe.ninja's price for it (ScryingOrbPriceChip); this button is the live
 *  side: the cheapest current listing, and the only price for an area ninja
 *  doesn't list. Two clicks: the first prices the area, the second opens the
 *  trade site to that same query. Renders nothing for a map with no
 *  `SCRYING_ORB_AREAS` entry: a data-drift guard, not a live case today (every
 *  explorer map resolves). */
export function ScryingOrbButton({ mapName }: ScryingOrbButtonProps): JSX.Element | null {
  const area = scryingAreaForMap(mapName)
  const cached = sessionCache.get(area)
  const [status, setStatus] = useState<Status>(cached ? 'priced' : 'idle')
  const [result, setResult] = useState<ScryingResult | null>(cached ?? null)

  if (!SCRYING_ORB_AREAS[area]) return null

  const handleClick = async (): Promise<void> => {
    // Once an area is priced the button only opens the saved trade query -- no
    // second search, and no refresh affordance, so the price shown stays the
    // point-in-time snapshot from the click that fetched it.
    const hit = sessionCache.get(area)
    if (hit) {
      window.api.openExternal(hit.url)
      return
    }
    setStatus('loading')
    try {
      const settings = await window.api.getSettings()
      const league = settings.activeProfile?.league ?? ''
      const response = await window.api.tradeSearch(
        { name: 'Scrying Orb', baseType: 'Scrying Orb', itemClass: 'Stackable Currency', rarity: 'Currency' },
        [{ id: 'misc.scrying_area', text: area, value: null, min: null, max: null, enabled: true, type: 'misc' }],
      )
      if (!response.queryId) {
        setStatus('error')
        return
      }
      // Results arrive sorted price: asc, so the first listing is the cheapest.
      // The trade site is deliberately NOT opened here: the first click only
      // answers "what does one cost", and browsing a column of maps should not
      // spray browser tabs. The follow-up click on the priced button opens it.
      const url = getTradeUrls(settings.poeVersion ?? 1).webSearch(league, response.queryId)
      const next: ScryingResult = { price: response.listings[0]?.price ?? null, total: response.total, url }
      sessionCache.set(area, next)
      setResult(next)
      setStatus('priced')
    } catch {
      setStatus('error')
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={status === 'loading'}
      // normal-case is load-bearing: the host is ExpandedCardList's column header,
      // which sets `uppercase` on the whole row.
      className="inline-flex items-center gap-[4px] text-[10px] px-[8px] py-[2px] border-none cursor-pointer font-semibold normal-case tracking-normal bg-white/[0.10] text-accent rounded-[4px] shrink-0 whitespace-nowrap disabled:cursor-default disabled:opacity-60"
      onMouseEnter={(e) => {
        if (status !== 'loading') e.currentTarget.style.background = 'rgba(255,255,255,0.18)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.10)'
      }}
    >
      {renderContent(status, result)}
    </button>
  )
}
