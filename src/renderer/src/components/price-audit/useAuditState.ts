import { useEffect, useRef, useState } from 'react'
import type { FilterBlock, TierGroup, TierSibling, PoeItem } from '../../../../shared/types'
import {
  AuditItem,
  calcMaxDust,
  iconMap,
  savedSliderState,
  lastMovedBelow,
  lastMovedAbove,
  setLastMovedBelow,
  setLastMovedAbove,
  formatTierLabel,
} from './constants'

interface UseAuditStateArgs {
  block: FilterBlock
  blockIndex: number
  tierGroup?: TierGroup
  item?: PoeItem
}

export interface AuditState {
  // Fetched data
  items: AuditItem[]
  loading: boolean
  divineRate: number
  mirrorRate: number
  baseTypes: string[]

  // Slider state
  threshold: number
  dustThreshold: number
  filterMode: 'price' | 'dust' | 'both'
  setThreshold: (v: number) => void
  setDustThreshold: (v: number) => void
  setFilterMode: (m: 'price' | 'dust' | 'both') => void

  // Move UI state
  moving: boolean
  movedBelow: string | null
  movedAbove: string | null
  setMovedBelow: (v: string | null) => void
  setMovedAbove: (v: string | null) => void

  // Tier-retarget state
  aboveTarget: number | null
  belowTarget: number | null
  setAboveTarget: (v: number | null) => void
  setBelowTarget: (v: number | null) => void

  // Derived
  isEmpty: boolean
  isUniqueTier: boolean
  hasDust: boolean
  isBothMode: boolean
  maxPrice: number
  maxDust: number
  minDust: number
  higherTier: TierSibling | null
  lowerTier: TierSibling | null
  tiersAbove: TierSibling[]
  tiersBelow: TierSibling[]
  effectiveAboveTarget: number | null
  effectiveBelowTarget: number | null
  pricedItems: AuditItem[]
  aboveThreshold: AuditItem[]
  middleItems: AuditItem[]
  belowThreshold: AuditItem[]
  unpriced: AuditItem[]
  getZone: (i: AuditItem) => 'above' | 'middle' | 'below'

  // Actions
  handleMoveAbove: () => Promise<void>
  handleMoveBelow: () => Promise<void>
}

export function useAuditState({ block, blockIndex, tierGroup, item }: UseAuditStateArgs): AuditState {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<AuditItem[]>([])
  const saved = savedSliderState.get(blockIndex)
  const [threshold, setThresholdRaw] = useState(saved?.threshold ?? 0)
  const [dustThreshold, setDustThresholdRaw] = useState(saved?.dustThreshold ?? 0)
  const [filterMode, setFilterModeRaw] = useState<'price' | 'dust' | 'both'>(saved?.filterMode ?? 'price')

  const setThreshold = (v: number): void => {
    setThresholdRaw(v)
    savedSliderState.set(blockIndex, { threshold: v, dustThreshold, filterMode })
  }
  const setDustThreshold = (v: number): void => {
    setDustThresholdRaw(v)
    savedSliderState.set(blockIndex, { threshold, dustThreshold: v, filterMode })
  }
  const setFilterMode = (m: 'price' | 'dust' | 'both'): void => {
    setFilterModeRaw(m)
    savedSliderState.set(blockIndex, { threshold, dustThreshold, filterMode: m })
  }

  const [divineRate, setDivineRate] = useState(0)
  const [mirrorRate, setMirrorRate] = useState(0)
  const [moving, setMoving] = useState(false)
  const [movedBelow, setMovedBelow] = useState<string | null>(lastMovedBelow)
  const [movedAbove, setMovedAbove] = useState<string | null>(lastMovedAbove)
  const thresholdInitialized = useRef(false)

  const baseTypes = block.conditions.filter((c) => c.type === 'BaseType').flatMap((c) => c.values)

  const prevBlockIndex = useRef(blockIndex)
  useEffect(() => {
    if (prevBlockIndex.current !== blockIndex) {
      thresholdInitialized.current = false
      prevBlockIndex.current = blockIndex
      setLastMovedBelow(null)
      setLastMovedAbove(null)
      setMovedBelow(null)
      setMovedAbove(null)
    }
  }, [blockIndex])

  const baseTypesKey = baseTypes.join(',')
  useEffect(() => {
    if (baseTypes.length > 0 && !loading) {
      void runAudit()
    }
  }, [blockIndex, baseTypesKey])

  const isEmpty = baseTypes.length === 0

  const currentSib = tierGroup?.siblings.find((s) => s.blockIndex === blockIndex)
  const currentIdx = tierGroup?.siblings.indexOf(currentSib!) ?? -1
  const isExTier = (t: string): boolean => /^(ex\d*|exhide|exshow|2x\d*|rest|restex)$/.test(t) || t.startsWith('exotic')
  const isValidTier = (s: { tier: string }): boolean => !isExTier(s.tier)
  const tiersAbove = tierGroup && currentIdx > 0 ? tierGroup.siblings.slice(0, currentIdx).filter(isValidTier) : []
  const tiersBelow = tierGroup && currentIdx >= 0 ? tierGroup.siblings.slice(currentIdx + 1).filter(isValidTier) : []
  const higherTier = tiersAbove.length > 0 ? tiersAbove[tiersAbove.length - 1] : null
  const lowerTier = tiersBelow.length > 0 ? tiersBelow[0] : null
  const [aboveTarget, setAboveTarget] = useState<number | null>(null)
  const [belowTarget, setBelowTarget] = useState<number | null>(null)

  const effectiveAboveTarget = tiersAbove.find((s) => s.blockIndex === aboveTarget)
    ? aboveTarget
    : (higherTier?.blockIndex ?? null)
  const effectiveBelowTarget = tiersBelow.find((s) => s.blockIndex === belowTarget)
    ? belowTarget
    : (lowerTier?.blockIndex ?? null)

  const runAudit = async (): Promise<void> => {
    const isFirstLoad = items.length === 0
    if (isFirstLoad) setLoading(true)
    try {
      const settings = await window.api.getSettings()
      const isUnique = block.conditions.some((c) => c.type === 'Rarity' && c.values.some((v) => v === 'Unique'))
      const prices = await window.api.batchLookupPrices(baseTypes, settings.league, isUnique)

      const currPrices = await window.api.batchLookupPrices(['Divine Orb', 'Mirror of Kalandra'], settings.league)
      const divPrice = currPrices['Divine Orb']?.chaosValue ?? 0
      const mirPrice = currPrices['Mirror of Kalandra']?.chaosValue ?? 0
      if (divPrice > 0) setDivineRate(divPrice)
      if (mirPrice > 0) setMirrorRate(mirPrice)

      const audited: AuditItem[] = baseTypes.map((name) => ({
        name,
        chaosValue: prices[name]?.chaosValue ?? null,
        divineValue: prices[name]?.divineValue ?? undefined,
        dustValue: isUnique ? (calcMaxDust(name) ?? null) : null,
        iconUrl: iconMap[name] ?? null,
      }))

      audited.sort((a, b) => {
        if (a.chaosValue === null && b.chaosValue === null) return 0
        if (a.chaosValue === null) return 1
        if (b.chaosValue === null) return -1
        return b.chaosValue - a.chaosValue
      })

      if (!thresholdInitialized.current) {
        if (!savedSliderState.has(blockIndex)) {
          const priced = audited.filter((i) => i.chaosValue !== null)
          if (priced.length > 0) {
            setThreshold(Math.min(...priced.map((i) => i.chaosValue!)))
          }
          const dusted = audited.filter((i) => i.dustValue !== null)
          if (dusted.length > 0) {
            setDustThreshold(Math.min(...dusted.map((i) => i.dustValue!)))
          }
        }
        thresholdInitialized.current = true
      }

      setItems(audited)
    } catch (err) {
      console.error('[PriceAudit] Failed:', err)
    }
    if (isFirstLoad) setLoading(false)
  }

  const isUniqueTier = block.conditions.some((c) => c.type === 'Rarity' && c.values.some((v) => v === 'Unique'))
  const hasDust = isUniqueTier && items.some((i) => i.dustValue !== null)
  const isBothMode = hasDust && filterMode === 'both'

  const getZone = (i: AuditItem): 'above' | 'middle' | 'below' => {
    const priceAbove = i.chaosValue !== null && i.chaosValue >= threshold
    if (!hasDust) return priceAbove ? 'above' : 'below'
    const dustAbove = i.dustValue !== null && i.dustValue >= dustThreshold
    if (filterMode === 'price') return priceAbove ? 'above' : 'below'
    if (filterMode === 'dust') return dustAbove ? 'above' : 'below'
    if (priceAbove && dustAbove) return 'above'
    if (!priceAbove && !dustAbove) return 'below'
    return 'middle'
  }

  const hasValue = (i: AuditItem): boolean => i.chaosValue !== null || i.dustValue !== null

  const aboveThreshold = items.filter((i) => hasValue(i) && getZone(i) === 'above')
  const middleItems = items.filter((i) => hasValue(i) && getZone(i) === 'middle')
  const belowThreshold = items.filter((i) => hasValue(i) && getZone(i) === 'below')
  const unpriced = items.filter((i) => !hasValue(i))

  const zoneOrder = { above: 0, middle: 1, below: 2 }
  const pricedItems = [...items.filter(hasValue)].sort((a, b) => {
    const za = zoneOrder[getZone(a)]
    const zb = zoneOrder[getZone(b)]
    if (za !== zb) return za - zb
    return (b.chaosValue ?? 0) - (a.chaosValue ?? 0)
  })

  const maxPrice =
    pricedItems.length > 0
      ? Math.max(...pricedItems.filter((i) => i.chaosValue !== null).map((i) => i.chaosValue!), 0)
      : 100

  const dustedItems = items.filter((i) => i.dustValue !== null)
  const maxDust = dustedItems.length > 0 ? Math.max(...dustedItems.map((i) => i.dustValue!)) : 0
  const minDust = dustedItems.length > 0 ? Math.min(...dustedItems.map((i) => i.dustValue!)) : 0

  const handleMoveBelow = async (): Promise<void> => {
    if (effectiveBelowTarget === null || belowThreshold.length === 0 || moving) return
    const target = tiersBelow.find((s) => s.blockIndex === effectiveBelowTarget)
    if (!target) return
    setMoving(true)
    const count = belowThreshold.length
    const tier = formatTierLabel(target.tier)
    await window.api.batchMoveItemTier(
      belowThreshold.map((it) => it.name),
      blockIndex,
      target.blockIndex,
      JSON.stringify(item),
    )
    setMoving(false)
    setItems([])
    setLastMovedBelow(`Moved ${count} items to ${tier}`)
    setMovedBelow(`Moved ${count} items to ${tier}`)
  }

  const handleMoveAbove = async (): Promise<void> => {
    if (effectiveAboveTarget === null || aboveThreshold.length === 0 || moving) return
    const target = tiersAbove.find((s) => s.blockIndex === effectiveAboveTarget)
    if (!target) return
    setMoving(true)
    const count = aboveThreshold.length
    const tier = formatTierLabel(target.tier)
    await window.api.batchMoveItemTier(
      aboveThreshold.map((it) => it.name),
      blockIndex,
      target.blockIndex,
      JSON.stringify(item),
    )
    setMoving(false)
    setItems([])
    setLastMovedAbove(`Moved ${count} items to ${tier}`)
    setMovedAbove(`Moved ${count} items to ${tier}`)
  }

  return {
    items,
    loading,
    divineRate,
    mirrorRate,
    baseTypes,
    threshold,
    dustThreshold,
    filterMode,
    setThreshold,
    setDustThreshold,
    setFilterMode,
    moving,
    movedBelow,
    movedAbove,
    setMovedBelow,
    setMovedAbove,
    aboveTarget,
    belowTarget,
    setAboveTarget,
    setBelowTarget,
    isEmpty,
    isUniqueTier,
    hasDust,
    isBothMode,
    maxPrice,
    maxDust,
    minDust,
    higherTier,
    lowerTier,
    tiersAbove,
    tiersBelow,
    effectiveAboveTarget,
    effectiveBelowTarget,
    pricedItems,
    aboveThreshold,
    middleItems,
    belowThreshold,
    unpriced,
    getZone,
    handleMoveAbove,
    handleMoveBelow,
  }
}
