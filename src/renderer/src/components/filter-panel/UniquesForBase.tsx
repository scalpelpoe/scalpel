import { useEffect, useMemo, useRef, useState } from 'react'
import { iconFor, RARITY_COLORS } from '../../shared/constants'
import { ItemRowContent } from '../../shared/ItemRowContent'
import { Skeleton } from '../../shared/Skeleton'
import { createMomentumScrollHandler } from '../../shared/momentumScroll'

type PriceMap = Record<string, { chaosValue: number; divineValue?: number } | null>

// FilterPanel remounts on every overlay-data event (searchId-keyed in App), so without
// these caches we'd refetch on every card click and lose scroll/sort across mounts.
// Cached at module level so they survive remounts.
const uniquesByBaseCache = new Map<string, string[]>()
const pricesByBaseCache = new Map<string, PriceMap>()
const scrollPositionCache = new Map<string, number>()

/** Renders every unique that can drop on the given base, as a row of horizontally-
 *  scrolling cards. Each card reuses ItemRowContent so the name/icon/price layout
 *  matches the sister overlay rows. Hidden when no uniques with available icons. */
export function UniquesForBase({ baseType, itemClass }: { baseType: string; itemClass: string }): JSX.Element | null {
  const [uniques, setUniques] = useState<string[] | null>(() => uniquesByBaseCache.get(baseType) ?? null)
  const [prices, setPrices] = useState<PriceMap>(() => pricesByBaseCache.get(baseType) ?? {})
  const [league, setLeague] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  // Restore scroll position on mount/baseType-change. Saving is done in onScroll
  // so the cache is always current; an unmount-cleanup-only save is racy.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollPositionCache.get(baseType) ?? 0
  }, [baseType])

  useEffect(() => {
    window.api.getSettings().then((s) => setLeague(s.activeProfile?.league ?? ''))
  }, [])

  useEffect(() => {
    const cached = uniquesByBaseCache.get(baseType)
    if (cached) {
      setUniques(cached)
      return
    }
    setUniques(null)
    let cancelled = false
    window.api.getUniquesForBase(baseType).then((list) => {
      uniquesByBaseCache.set(baseType, list)
      if (!cancelled) setUniques(list)
    })
    return () => {
      cancelled = true
    }
  }, [baseType])

  // Show every unique on the base, even ones missing direct art -- iconFor
  // falls back to the base or a sibling unique's icon so the card isn't blank.
  const visible = uniques ?? []

  useEffect(() => {
    if (visible.length === 0 || !league) return
    let cancelled = false
    window.api
      .batchLookupRefPrices(
        visible.map((name) => ({ name, baseType })),
        league,
      )
      .then((p) => {
        pricesByBaseCache.set(baseType, p)
        if (!cancelled) setPrices(p)
      })
    return () => {
      cancelled = true
    }
  }, [visible.join('|'), league, baseType])

  // Sort by chaos price descending, unpriced fall to the bottom -- mirrors the sister overlay.
  const sortedNames = useMemo(() => {
    return [...visible].sort((a, b) => (prices[b]?.chaosValue ?? -1) - (prices[a]?.chaosValue ?? -1))
  }, [visible, prices])

  if (uniques !== null && visible.length === 0) return null

  return (
    // -mx-3 cancels the FilterPanel's p-3 so the scroll track runs edge-to-edge;
    // inner padding keeps the first/last cards aligned with the rest of the column.
    <div
      ref={scrollRef}
      className="flex gap-2 overflow-x-auto overflow-y-hidden no-scrollbar -mx-3"
      style={{ paddingLeft: 12, paddingRight: 12 }}
      onMouseDown={createMomentumScrollHandler()}
      onScroll={(e) => scrollPositionCache.set(baseType, e.currentTarget.scrollLeft)}
    >
      {uniques === null
        ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="w-[120px] h-[80px] shrink-0 rounded" />)
        : sortedNames.map((name) => (
            <button
              key={name}
              onClick={() => window.api.lookupBaseType(baseType, itemClass, 'Unique', name)}
              title={`Switch to ${name}`}
              className="unique-card flex flex-col items-center justify-between gap-1 w-[120px] shrink-0 px-2 py-2 rounded cursor-pointer bg-bg-card hover:bg-bg-hover transition-colors"
            >
              <ItemRowContent
                name={name}
                iconUrl={iconFor(name, baseType)}
                price={prices[name]}
                nameColor={RARITY_COLORS.Unique}
              />
            </button>
          ))}
    </div>
  )
}
