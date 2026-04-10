import { useEffect, useRef, useState } from 'react'
import type { FilterBlock, TierGroup, PoeItem } from '../../../../shared/types'
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
import { AuditRow } from './AuditRow'
import { FilterModeToggle, PriceSlider, DustSlider } from './SliderControls'
import { ThresholdBars } from './ThresholdBars'

interface Props {
  block: FilterBlock
  blockIndex: number
  tierGroup?: TierGroup
  item?: PoeItem
  itemClass: string
  onSelectItem?: () => void
}

export function PriceAudit({ block, blockIndex, tierGroup, item, itemClass, onSelectItem }: Props): JSX.Element {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<AuditItem[]>([])
  const saved = savedSliderState.get(blockIndex)
  const [threshold, setThresholdRaw] = useState(saved?.threshold ?? 0)
  const [dustThreshold, setDustThresholdRaw] = useState(saved?.dustThreshold ?? 0)
  const [filterMode, setFilterModeRaw] = useState<'price' | 'dust' | 'both'>(saved?.filterMode ?? 'price')

  const setThreshold = (v: number) => {
    setThresholdRaw(v)
    savedSliderState.set(blockIndex, { threshold: v, dustThreshold, filterMode })
  }
  const setDustThreshold = (v: number) => {
    setDustThresholdRaw(v)
    savedSliderState.set(blockIndex, { threshold, dustThreshold: v, filterMode })
  }
  const setFilterMode = (m: 'price' | 'dust' | 'both') => {
    setFilterModeRaw(m)
    savedSliderState.set(blockIndex, { threshold, dustThreshold, filterMode: m })
  }
  const [divineRate, setDivineRate] = useState(0)
  const [mirrorRate, setMirrorRate] = useState(0)
  const [moving, setMoving] = useState(false)
  const [movedBelow, setMovedBelow] = useState<string | null>(lastMovedBelow)
  const [movedAbove, setMovedAbove] = useState<string | null>(lastMovedAbove)
  const thresholdInitialized = useRef(false)

  // Get all BaseType values from the block
  const baseTypes = block.conditions.filter((c) => c.type === 'BaseType').flatMap((c) => c.values)

  // Reset threshold when switching tiers
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

  // Auto-run on mount and when block changes
  const baseTypesKey = baseTypes.join(',')
  useEffect(() => {
    if (baseTypes.length > 0 && !loading) {
      runAudit()
    }
  }, [blockIndex, baseTypesKey])

  if (baseTypes.length === 0) return <></>

  // Find adjacent tiers, filtered to match the hero dropdown (must have BaseType items, not ex/2x)
  const currentSib = tierGroup?.siblings.find((s) => s.blockIndex === blockIndex)
  const currentIdx = tierGroup?.siblings.indexOf(currentSib!) ?? -1
  const isExTier = (t: string): boolean => /^(ex\d*|exhide|exshow|2x\d*)$/.test(t) || t.startsWith('exotic')
  const isValidTier = (s: { tier: string; block: FilterBlock }): boolean =>
    !isExTier(s.tier) && s.block.conditions.some((c) => c.type === 'BaseType' && c.values.length > 0)
  const tiersAbove = tierGroup && currentIdx > 0 ? tierGroup.siblings.slice(0, currentIdx).filter(isValidTier) : []
  const tiersBelow = tierGroup && currentIdx >= 0 ? tierGroup.siblings.slice(currentIdx + 1).filter(isValidTier) : []
  const higherTier = tiersAbove.length > 0 ? tiersAbove[tiersAbove.length - 1] : null
  const lowerTier = tiersBelow.length > 0 ? tiersBelow[0] : null
  const [aboveTarget, setAboveTarget] = useState<number | null>(null)
  const [belowTarget, setBelowTarget] = useState<number | null>(null)

  // Default to adjacent tier when targets aren't set or are invalid
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
      const isUniqueTier = block.conditions.some((c) => c.type === 'Rarity' && c.values.some((v) => v === 'Unique'))
      const prices = await window.api.batchLookupPrices(baseTypes, settings.league, isUniqueTier)

      // Fetch currency rates
      const currPrices = await window.api.batchLookupPrices(['Divine Orb', 'Mirror of Kalandra'], settings.league)
      const divPrice = currPrices['Divine Orb']?.chaosValue ?? 0
      const mirPrice = currPrices['Mirror of Kalandra']?.chaosValue ?? 0
      if (divPrice > 0) setDivineRate(divPrice)
      if (mirPrice > 0) setMirrorRate(mirPrice)

      const audited: AuditItem[] = baseTypes.map((name) => ({
        name,
        chaosValue: prices[name]?.chaosValue ?? null,
        divineValue: prices[name]?.divineValue ?? undefined,
        dustValue: isUniqueTier ? (calcMaxDust(name) ?? null) : null,
        iconUrl: iconMap[name] ?? null,
      }))

      // Sort: priced items descending, then unpriced at bottom
      audited.sort((a, b) => {
        if (a.chaosValue === null && b.chaosValue === null) return 0
        if (a.chaosValue === null) return 1
        if (b.chaosValue === null) return -1
        return b.chaosValue - a.chaosValue
      })

      // Set thresholds to lowest values on first load (skip if we have saved state)
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

  // Determine item zone
  const hasDust = isUniqueTier && items.some((i) => i.dustValue !== null)
  const isBothMode = hasDust && filterMode === 'both'

  const getZone = (i: AuditItem): 'above' | 'middle' | 'below' => {
    const priceAbove = i.chaosValue !== null && i.chaosValue >= threshold
    if (!hasDust) return priceAbove ? 'above' : 'below'
    const dustAbove = i.dustValue !== null && i.dustValue >= dustThreshold
    if (filterMode === 'price') return priceAbove ? 'above' : 'below'
    if (filterMode === 'dust') return dustAbove ? 'above' : 'below'
    // Both: three zones
    if (priceAbove && dustAbove) return 'above'
    if (!priceAbove && !dustAbove) return 'below'
    return 'middle'
  }

  const hasValue = (i: AuditItem) => i.chaosValue !== null || i.dustValue !== null

  // Split items by zone
  const aboveThreshold = items.filter((i) => hasValue(i) && getZone(i) === 'above')
  const middleItems = items.filter((i) => hasValue(i) && getZone(i) === 'middle')
  const belowThreshold = items.filter((i) => hasValue(i) && getZone(i) === 'below')
  const unpriced = items.filter((i) => !hasValue(i))

  // Sort: above first, then middle, then below, each by price descending
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

  // Dust slider range
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

  return (
    <div className="bg-bg-card rounded overflow-hidden flex flex-col flex-1 min-h-0">
      {/* Loading */}
      {loading && (
        <div className="px-3 py-4 text-center text-[11px] text-text-dim">
          Fetching prices for {baseTypes.length} items...
        </div>
      )}

      {/* Audit results */}
      {!loading && items.length > 0 && (
        <div className="flex flex-col flex-1 min-h-0">
          {/* Header + Sliders */}
          <div className="flex flex-col gap-2 px-3 py-[10px] bg-bg-card">
            <span className="section-title">Audit Tier</span>
            <span className="text-[10px] text-text-dim leading-[1.4] -mt-1">
              {isUniqueTier
                ? "Easily retier uniques based on the potential price and dust value of the base. First, select if you'd like to filter by price, dust value or both, then move the slider(s) and you see the option to move the items below to a lower tier or vice versa."
                : 'Easily retier multiple items at once based on the current economy. Select a price on the slider and you will have the option to move the items below to a lower tier or vice versa.'}
            </span>
            <div className="flex items-center gap-[6px]">
              <FilterModeToggle
                hasDust={hasDust}
                filterMode={filterMode}
                setFilterMode={setFilterMode}
                setMovedBelow={setMovedBelow}
                setMovedAbove={setMovedAbove}
              />

              {/* Price slider pill */}
              {(filterMode === 'price' || filterMode === 'both' || !hasDust) && (
                <PriceSlider
                  threshold={threshold}
                  maxPrice={maxPrice}
                  divineRate={divineRate}
                  mirrorRate={mirrorRate}
                  setThreshold={setThreshold}
                  setMovedBelow={setMovedBelow}
                  setMovedAbove={setMovedAbove}
                />
              )}

              {/* Dust slider pill (unique tiers only) */}
              {hasDust && (filterMode === 'dust' || filterMode === 'both') && (
                <DustSlider
                  dustThreshold={dustThreshold}
                  maxDust={maxDust}
                  minDust={minDust}
                  setDustThreshold={setDustThreshold}
                  setMovedBelow={setMovedBelow}
                  setMovedAbove={setMovedAbove}
                />
              )}
            </div>
          </div>

          {/* Item list */}
          <div className="flex-1 overflow-y-auto flex flex-col">
            {/* All priced items in zone order + divider(s) via CSS order */}
            {pricedItems.map((it, i) => {
              const zone = getZone(it)
              const faded = isBothMode && zone === 'middle'
              const borderLeft =
                zone === 'above' && higherTier
                  ? '3px solid rgba(80,180,80,0.6)'
                  : zone === 'below' && lowerTier
                    ? '3px solid rgba(200,80,80,0.6)'
                    : '3px solid transparent'
              const zoneBg =
                zone === 'above' && higherTier
                  ? i % 2 === 0
                    ? 'rgba(40,90,40,0.15)'
                    : 'rgba(40,90,40,0.08)'
                  : zone === 'below' && lowerTier
                    ? i % 2 === 0
                      ? 'rgba(90,40,40,0.15)'
                      : 'rgba(90,40,40,0.08)'
                    : i % 2 === 0
                      ? 'rgba(0,0,0,0.25)'
                      : 'rgba(0,0,0,0.15)'
              return (
                <div key={it.name} style={{ order: i * 4, background: zoneBg, opacity: faded ? 0.35 : 1, borderLeft }}>
                  <AuditRow
                    item={it}
                    upTo={isUniqueTier}
                    divineRate={divineRate}
                    mirrorRate={mirrorRate}
                    itemClass={itemClass}
                    onSelectItem={onSelectItem}
                  />
                </div>
              )
            })}

            {/* Threshold divider bars */}
            <ThresholdBars
              pricedItems={pricedItems}
              aboveThreshold={aboveThreshold}
              middleItems={middleItems}
              belowThreshold={belowThreshold}
              threshold={threshold}
              dustThreshold={dustThreshold}
              divineRate={divineRate}
              mirrorRate={mirrorRate}
              filterMode={filterMode}
              hasDust={hasDust}
              isBothMode={isBothMode}
              higherTier={higherTier}
              lowerTier={lowerTier}
              tiersAbove={tiersAbove}
              tiersBelow={tiersBelow}
              effectiveAboveTarget={effectiveAboveTarget}
              effectiveBelowTarget={effectiveBelowTarget}
              setAboveTarget={setAboveTarget}
              setBelowTarget={setBelowTarget}
              movedAbove={movedAbove}
              movedBelow={movedBelow}
              moving={moving}
              handleMoveAbove={handleMoveAbove}
              handleMoveBelow={handleMoveBelow}
            />

            {/* Unpriced items at the bottom */}
            {unpriced.length > 0 && (
              <div style={{ order: pricedItems.length * 4 + 1 }}>
                <div className="text-[10px] text-text-dim px-3 pt-[6px] pb-[2px] uppercase tracking-[0.5px]">
                  No Price Data
                </div>
                {unpriced.map((it, i) => (
                  <div key={it.name} style={{ background: i % 2 === 0 ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.15)' }}>
                    <AuditRow
                      item={it}
                      upTo={isUniqueTier}
                      divineRate={divineRate}
                      mirrorRate={mirrorRate}
                      itemClass={itemClass}
                      onSelectItem={onSelectItem}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
