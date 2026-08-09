import type { PriceEntry, ScalpelPluginContext } from '@scalpelpoe/plugin-sdk'
import { useCallback, useEffect, useState } from 'react'
import { ECONOMY_SLUGS } from './economy-categories'

export interface EconomyData {
  entries: PriceEntry[]
  updatedAt: number | null
  loading: boolean
  error: string | null
}

export function useEconomyPrices(ctx: ScalpelPluginContext): EconomyData & { refresh: () => Promise<void> } {
  const [entries, setEntries] = useState<PriceEntry[]>([])
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const { prices, updatedAt: ts } = await ctx.prices.getPrices()
      setEntries(prices.filter((p) => ECONOMY_SLUGS.has(p.category)))
      setUpdatedAt(ts)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [ctx])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      await ctx.prices.refresh()
    } catch (e) {
      ctx.log(`scalpel-economy: refresh failed (${e instanceof Error ? e.message : String(e)})`)
    }
    await load()
  }, [ctx, load])

  useEffect(() => {
    void load()
    const off = ctx.prices.onChange(() => {
      void load()
    })
    return off
  }, [ctx, load])

  return { entries, updatedAt, loading, error, refresh }
}

export function useStoredCategory(ctx: ScalpelPluginContext): [string, (slug: string) => void] {
  const [slug, setSlugState] = useState('currency')

  useEffect(() => {
    void (async () => {
      const saved = await ctx.storage.get<string>('economySlug')
      if (saved) setSlugState(saved)
    })()
  }, [ctx])

  const setSlug = useCallback(
    (next: string) => {
      setSlugState(next)
      void ctx.storage.set('economySlug', next)
    },
    [ctx],
  )

  return [slug, setSlug]
}
