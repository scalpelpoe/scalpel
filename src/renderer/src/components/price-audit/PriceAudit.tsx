import { AuditRow } from './AuditRow'
import { FilterModeToggle, PriceSlider, DustSlider } from './SliderControls'
import { ThresholdBars } from './ThresholdBars'
import type { AuditState } from './useAuditState'

interface AuditTierControlsProps {
  state: AuditState
}

export function AuditTierControls({ state }: AuditTierControlsProps): JSX.Element | null {
  const {
    items,
    loading,
    isEmpty,
    isUniqueTier,
    hasDust,
    filterMode,
    setFilterMode,
    threshold,
    setThreshold,
    maxPrice,
    divineRate,
    mirrorRate,
    dustThreshold,
    setDustThreshold,
    maxDust,
    minDust,
    setMovedBelow,
    setMovedAbove,
  } = state

  if (isEmpty || loading || items.length === 0) return null

  return (
    <div className="flex flex-col gap-2 border-t border-border" style={{ padding: '10px 12px' }}>
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
  )
}

interface PriceAuditProps {
  state: AuditState
  itemClass: string
  onSelectItem?: () => void
}

export function PriceAudit({ state, itemClass, onSelectItem }: PriceAuditProps): JSX.Element {
  const {
    items,
    loading,
    isEmpty,
    baseTypes,
    isUniqueTier,
    hasDust,
    isBothMode,
    filterMode,
    threshold,
    dustThreshold,
    divineRate,
    mirrorRate,
    higherTier,
    lowerTier,
    tiersAbove,
    tiersBelow,
    effectiveAboveTarget,
    effectiveBelowTarget,
    setAboveTarget,
    setBelowTarget,
    moving,
    movedAbove,
    movedBelow,
    aboveThreshold,
    middleItems,
    belowThreshold,
    pricedItems,
    unpriced,
    getZone,
    handleMoveAbove,
    handleMoveBelow,
  } = state

  return (
    <div className="bg-bg-card rounded overflow-hidden flex flex-col flex-1 min-h-0">
      {!isEmpty && loading && (
        <div className="px-3 py-4 text-center text-[11px] text-text-dim">
          Fetching prices for {baseTypes.length} items...
        </div>
      )}

      {isEmpty && (
        <div className="flex-1 flex items-center justify-center p-6 text-text-dim text-[12px]">
          Nothing currently in this tier
        </div>
      )}

      {!isEmpty && !loading && items.length > 0 && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto flex flex-col">
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
