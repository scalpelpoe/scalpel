import { useState, useMemo, useEffect } from 'react'
import { MapCardEntry, Props, TierStyle } from './types'
import { cards, regularMaps, DROPPOOL_WEIGHT, DROPS_PER_MAP } from './constants'
import { computeEvBarRGB } from './utils'
import { MapInfoBlock } from './MapInfoBlock'
import { CardChips } from './CardChips'
import { ExpandedCardList } from './ExpandedCardList'

export function DivCardExplorer({ onSelectItem }: Props): JSX.Element {
  const [prices, setPrices] = useState<Record<string, number>>({})
  const [divineRate, setDivineRate] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expandedMap, setExpandedMap] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [minEv, _setMinEv] = useState(0)
  const [tierStyles, setTierStyles] = useState<Record<string, TierStyle>>({})
  const [cardTiers, setCardTiers] = useState<Record<string, string>>({})
  const [hiddenCards, setHiddenCards] = useState<Record<string, boolean>>({})
  const [manualFlags, setManualFlags] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('div-outlier-flags') || '{}')
    } catch {
      return {}
    }
  })

  // Fetch live prices and tier data
  useEffect(() => {
    window.api.getDivCardTiers().then(({ tierStyles: ts, cardTiers: ct, hiddenCards: hc }) => {
      setTierStyles(ts)
      setCardTiers(ct)
      setHiddenCards(hc)
    })
    let cancelled = false
    const fetchPrices = async (attempt = 0): Promise<void> => {
      try {
        const settings = await window.api.getSettings()
        const cardNames = cards.map((c) => c.name)
        const result: Record<string, number> = {}
        const chunkSize = 200
        for (let i = 0; i < cardNames.length; i += chunkSize) {
          const chunk = cardNames.slice(i, i + chunkSize)
          const p = await window.api.batchLookupDivCardPrices(chunk, settings.league)
          for (const [name, info] of Object.entries(p)) {
            if (info?.chaosValue) result[name] = info.chaosValue
          }
        }
        if (cancelled) return
        if (Object.keys(result).length === 0 && attempt < 3) {
          await new Promise((r) => setTimeout(r, 2000))
          if (!cancelled) return fetchPrices(attempt + 1)
          return
        }
        setPrices(result)
        const currPrices = await window.api.batchLookupPrices(['Divine Orb'], settings.league)
        const divPrice = currPrices['Divine Orb']?.chaosValue ?? 0
        if (divPrice > 0) setDivineRate(divPrice)
      } catch {
        if (!cancelled && attempt < 3) {
          await new Promise((r) => setTimeout(r, 2000))
          if (!cancelled) return fetchPrices(attempt + 1)
          return
        }
      }
      setLoading(false)
    }
    fetchPrices()
    return () => {
      cancelled = true
    }
  }, [])

  // Merge live prices into card data
  const pricedCards = useMemo(() => {
    // Hard-coded overrides for cards with unreliable ninja prices
    const priceOverrides: Record<string, (div: number) => number> = {
      "Brother's Gift": (div) => div * 5,
    }
    return cards.map((c) => {
      const override = priceOverrides[c.name]
      return {
        ...c,
        price: override ? override(divineRate || 200) : (prices[c.name] ?? c.price),
      }
    })
  }, [prices, divineRate])

  // Outlier detection: IQR-based for t3+ tiers
  const outlierCards = useMemo(() => {
    const outliers = new Set<string>()
    // Only detect outliers on tiers that aren't t1/t2 (high-value tiers have legitimate variance)
    const highTiers = new Set(['t1', 't2', 'currency', 'boss', 'uber'])
    // Group cards by tier
    const tierGroups: Record<string, number[]> = {}
    for (const c of pricedCards) {
      const tier = cardTiers[c.name]
      if (!tier || highTiers.has(tier)) continue
      if (c.price <= 0) continue
      if (!tierGroups[tier]) tierGroups[tier] = []
      tierGroups[tier].push(c.price)
    }
    // Compute IQR per tier and flag outliers
    for (const [tier, tierPrices] of Object.entries(tierGroups)) {
      if (tierPrices.length < 4) continue
      const sorted = [...tierPrices].sort((a, b) => a - b)
      const q1 = sorted[Math.floor(sorted.length * 0.25)]
      const q3 = sorted[Math.floor(sorted.length * 0.75)]
      const iqr = q3 - q1
      const threshold = q3 + 3 * iqr
      for (const c of pricedCards) {
        if (cardTiers[c.name] !== tier) continue
        if (c.price > threshold) outliers.add(c.name)
      }
    }
    return outliers
  }, [pricedCards, cardTiers])

  // Combine auto + manual flags
  const flaggedCards = useMemo(() => {
    const flagged = new Set(outlierCards)
    for (const [name, val] of Object.entries(manualFlags)) {
      if (val) flagged.add(name)
      else flagged.delete(name) // manual unflag overrides auto
    }
    return flagged
  }, [outlierCards, manualFlags])

  const mapEntries = useMemo(() => {
    return regularMaps.map((m) => {
      const mapCards: MapCardEntry[] = []
      for (const card of pricedCards) {
        if (card.price <= 0) continue
        const dropsHere = card.drop.all_areas || card.drop.areas.some((a) => m.ids.includes(a))
        if (!dropsHere) continue
        const hasWeight = card.weight != null && card.weight > 0
        const isFlagged = flaggedCards.has(card.name)
        const dropRate = hasWeight ? (card.weight / DROPPOOL_WEIGHT) * DROPS_PER_MAP : 0
        const cardEv = hasWeight && !isFlagged ? card.price * dropRate : 0
        mapCards.push({ card, dropRate, cardEv })
      }
      mapCards.sort((a, b) => b.cardEv - a.cardEv)
      const totalEv = mapCards.reduce((sum, c) => sum + c.cardEv, 0)
      return { map: m, cards: mapCards, totalEv }
    })
  }, [pricedCards, flaggedCards])

  const sorted = useMemo(() => {
    let filtered = mapEntries.filter((e) => e.totalEv >= minEv && e.cards.length > 0)
    if (search) {
      const q = search.toLowerCase()
      filtered = filtered.filter(
        (e) => e.map.name.toLowerCase().includes(q) || e.cards.some((c) => c.card.name.toLowerCase().includes(q)),
      )
    }
    const result = [...filtered]
    result.sort((a, b) => b.totalEv - a.totalEv)
    return result
  }, [mapEntries, search, minEv])

  const toggleFlag = (cardName: string): void => {
    setManualFlags((prev) => {
      const next = { ...prev }
      if (flaggedCards.has(cardName) && !prev[cardName]) {
        // Auto-flagged, manual unflag
        next[cardName] = false
      } else if (prev[cardName] === false) {
        // Was manually unflagged, remove override (revert to auto)
        delete next[cardName]
      } else {
        // Not flagged, manually flag
        next[cardName] = !prev[cardName]
      }
      localStorage.setItem('div-outlier-flags', JSON.stringify(next))
      return next
    })
  }

  const topEv = sorted.length > 0 ? sorted[0].totalEv : 1

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header */}
      <div className="bg-bg-card px-3 py-[10px] flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="section-title">Div Card Explorer</span>
          {loading && <span className="text-[10px] text-text-dim">Fetching prices...</span>}
        </div>

        <div className="flex items-center gap-[6px]">
          <input
            type="text"
            placeholder="Filter by Card Name or Map"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-[10px] py-0 text-[11px] h-[25px] box-border bg-[rgba(0,0,0,0.25)] border border-[rgba(80,80,110,0.3)] rounded-full text-text outline-none bg-black/30"
          />
        </div>
      </div>

      {/* Map list */}
      <div className="flex-1 overflow-y-auto bg-bg-solid">
        {sorted.map((entry, i) => {
          const isExpanded = expandedMap === entry.map.name
          const evRatio = entry.totalEv / topEv
          const showCount = entry.cards.length <= 4 ? entry.cards.length : 3
          const topCards = entry.cards.slice(0, showCount)
          const { r, g } = computeEvBarRGB(evRatio)
          const barColor = `rgb(${r},${g},40)`

          return (
            <div key={entry.map.name}>
              <div
                onClick={() => setExpandedMap(isExpanded ? null : entry.map.name)}
                className="flex items-center gap-2 py-2 px-3 cursor-pointer relative overflow-hidden"
                style={{
                  background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                  borderLeft: `3px solid ${barColor}`,
                }}
              >
                <MapInfoBlock map={entry.map} totalEv={entry.totalEv} evRatio={evRatio} r={r} g={g} />
                <CardChips
                  topCards={topCards}
                  totalCount={entry.cards.length}
                  showCount={showCount}
                  cardTiers={cardTiers}
                  tierStyles={tierStyles}
                  hiddenCards={hiddenCards}
                  onSelectCard={(cardName) => {
                    window.api.lookupBaseType(cardName, 'Divination Cards')
                    onSelectItem?.()
                  }}
                />
              </div>

              {isExpanded && (
                <ExpandedCardList
                  cards={entry.cards}
                  r={r}
                  g={g}
                  divineRate={divineRate}
                  cardTiers={cardTiers}
                  flaggedCards={flaggedCards}
                  hiddenCards={hiddenCards}
                  onSelectCard={(cardName) => {
                    window.api.lookupBaseType(cardName, 'Divination Cards')
                    onSelectItem?.()
                  }}
                  onToggleFlag={toggleFlag}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
