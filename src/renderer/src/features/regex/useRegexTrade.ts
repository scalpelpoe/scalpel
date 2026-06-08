import { useEffect, useRef, useState } from 'react'
import type { Listing } from '../../shared/trade-types'

export interface RegexTradeResult {
  total: number
  listings: Listing[]
  queryId: string
  league: string
  remainingIds: string[]
}

export interface RegexTrade {
  searching: boolean
  listings: Listing[]
  total: number | null
  queryId: string | null
  league: string
  error: string | null
  remainingIds: string[]
  loadingMore: boolean
  rateLimitTiers: Array<{ used: number; max: number; window: number; penalty: number }>
  runSearch: (fn: () => Promise<RegexTradeResult>) => Promise<void>
  loadMore: () => Promise<void>
}

export function useRegexTrade(): RegexTrade {
  const [searching, setSearching] = useState(false)
  const [listings, setListings] = useState<Listing[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [queryId, setQueryId] = useState<string | null>(null)
  // Mirror of queryId for stale-response detection in loadMore.
  // See PriceCheck.tsx queryIdRef for the full rationale.
  const queryIdRef = useRef<string | null>(null)
  const [league, setLeague] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [remainingIds, setRemainingIds] = useState<string[]>([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [rateLimitTiers, setRateLimitTiers] = useState<
    Array<{ used: number; max: number; window: number; penalty: number }>
  >([])

  // Auto-prefetch the second batch of listings after a fresh trade search
  // lands. Mirrors PriceCheck's behavior - the /fetch rate-limit bucket resets
  // fast enough that one extra call back-to-back is safe.
  const autoPrefetchedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!queryId || remainingIds.length === 0) return
    if (autoPrefetchedFor.current === queryId) return
    // Defer if a previous loadMore is still in flight; effect re-fires once
    // `loadingMore` clears. See PriceCheck.tsx auto-prefetch effect for details.
    if (loadingMore) return
    autoPrefetchedFor.current = queryId
    void loadMore()
  }, [queryId, remainingIds.length, loadingMore])

  useEffect(() => {
    const unsub = window.api.onRateLimit((state) => setRateLimitTiers(state.tiers))
    return unsub
  }, [])

  const runSearch = async (fn: () => Promise<RegexTradeResult>): Promise<void> => {
    setSearching(true)
    setError(null)
    // Reset the auto-prefetch sentinel so a fresh search triggers it again.
    autoPrefetchedFor.current = null
    try {
      const result = await fn()
      setListings(result.listings)
      setTotal(result.total)
      setQueryId(result.queryId)
      queryIdRef.current = result.queryId
      setLeague(result.league)
      setRemainingIds(result.remainingIds)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  const loadMore = async (): Promise<void> => {
    if (!queryId || remainingIds.length === 0 || loadingMore) return
    const fetchQueryId = queryId
    setLoadingMore(true)
    try {
      const result = await window.api.fetchMoreListings(fetchQueryId, remainingIds)
      // Stale-response guard: drop if the user has re-run the search while this
      // fetch was in flight. Mirrors the same guard in PriceCheck.loadMore.
      if (queryIdRef.current !== fetchQueryId) return
      setListings((prev) => [...prev, ...result.listings])
      setRemainingIds(result.remainingIds)
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false)
    }
  }

  return {
    searching,
    listings,
    total,
    queryId,
    league,
    error,
    remainingIds,
    loadingMore,
    rateLimitTiers,
    runSearch,
    loadMore,
  }
}
