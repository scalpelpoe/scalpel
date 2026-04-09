import { useState, useEffect, useCallback, useRef } from 'react'
import type { MatchResult } from '../../../shared/types'
import { ItemSummary } from './ItemSummary'
import { FilterBlockEditor, type SaveState } from './filter-block-editor'
import { TierNavigator } from './TierNavigator'
import { getItemIconUrl, RARITY_COLORS } from './filter-panel/constants'
import { CollapsedHeader } from './filter-panel/CollapsedHeader'
import { SaveButton } from './filter-panel/SaveButton'
import { BreakpointEditor } from './filter-panel/BreakpointEditor'
import type { FilterPanelProps, PendingThreshold } from './filter-panel/types'

export function FilterPanel({
  data,
  selectedBpIndex,
  onSelectBp,
  selectedQualityBpIndex,
  onSelectQualityBp,
  selectedStrandBpIndex,
  onSelectStrandBp,
  onClose,
  onOpenAudit,
  onOpenTools,
  onOpenDustExplore,
  onOpenDivExplore,
}: FilterPanelProps): JSX.Element {
  const { item, matches, stackBreakpoints, qualityBreakpoints, strandBreakpoints, tierGroup } = data
  const hasBreakpoints = stackBreakpoints && stackBreakpoints.length > 1
  const hasQualityBreakpoints = qualityBreakpoints && qualityBreakpoints.length > 1
  const hasStrandBreakpoints = strandBreakpoints && strandBreakpoints.length > 1
  const [blockSaveState, setBlockSaveState] = useState<SaveState | null>(null)
  const handleSaveStateChange = useCallback((s: SaveState) => setBlockSaveState(s), [])
  const [pendingThreshold, setPendingThreshold] = useState<PendingThreshold | null>(null)
  const [thresholdSaving, setThresholdSaving] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [thresholdError, setThresholdError] = useState<string | null>(null)

  const hasPendingThreshold = pendingThreshold !== null
  const isDirty = (blockSaveState?.isDirty ?? false) || hasPendingThreshold
  const isSaving = (blockSaveState?.saving ?? false) || thresholdSaving
  const isSaved = !isDirty && !isSaving && ((blockSaveState?.saved ?? false) || false)

  const handleSave = async (): Promise<void> => {
    if (blockSaveState?.isDirty) blockSaveState.save()
    if (pendingThreshold) {
      setThresholdSaving(true)
      setThresholdError(null)
      const api =
        pendingThreshold.type === 'stack'
          ? window.api.updateStackThresholds
          : pendingThreshold.type === 'strand'
            ? window.api.updateStrandThresholds
            : window.api.updateQualityThresholds
      const result = await api(pendingThreshold.oldValue, pendingThreshold.newValue, JSON.stringify(item))
      setThresholdSaving(false)
      if (result.ok) {
        setPendingThreshold(null)
      } else {
        setThresholdError(result.error ?? 'Failed to update threshold')
      }
    }
  }

  // Auto-select first breakpoint when breakpoints exist but none selected
  useEffect(() => {
    if (hasBreakpoints && selectedBpIndex === null) {
      const matchIdx = stackBreakpoints.findIndex((bp) => item.stackSize >= bp.min && item.stackSize <= bp.max)
      onSelectBp(matchIdx >= 0 ? matchIdx : 0)
    }
  }, [hasBreakpoints])

  useEffect(() => {
    if (hasQualityBreakpoints && selectedQualityBpIndex === null) {
      const matchIdx = qualityBreakpoints.findIndex((bp) => item.quality >= bp.min && item.quality <= bp.max)
      onSelectQualityBp(matchIdx >= 0 ? matchIdx : 0)
    }
  }, [hasQualityBreakpoints])

  useEffect(() => {
    if (hasStrandBreakpoints && selectedStrandBpIndex === null) {
      const matchIdx = strandBreakpoints.findIndex(
        (bp) => (item.memoryStrands ?? 0) >= bp.min && (item.memoryStrands ?? 0) <= bp.max,
      )
      onSelectStrandBp(matchIdx >= 0 ? matchIdx : 0)
    }
  }, [hasStrandBreakpoints])

  // Determine which match and tier group to display
  let displayMatch: MatchResult | null = null
  let displayLabel: string | null = null
  let activeTierGroup = tierGroup ?? undefined

  if (hasStrandBreakpoints && selectedStrandBpIndex !== null) {
    const bp = strandBreakpoints[selectedStrandBpIndex]
    displayMatch = bp.activeMatch
    activeTierGroup = bp.tierGroup
    const rangeLabel = bp.max === Infinity ? `${bp.min}+` : bp.min === bp.max ? `${bp.min}` : `${bp.min}\u2013${bp.max}`
    displayLabel = `strands ${rangeLabel}`
  } else if (hasQualityBreakpoints && selectedQualityBpIndex !== null) {
    const bp = qualityBreakpoints[selectedQualityBpIndex]
    displayMatch = bp.activeMatch
    activeTierGroup = bp.tierGroup
    const rangeLabel =
      bp.max === Infinity ? `${bp.min}%+` : bp.min === bp.max ? `${bp.min}%` : `${bp.min}\u2013${bp.max}%`
    displayLabel = `quality ${rangeLabel}`
  } else if (hasBreakpoints && selectedBpIndex !== null) {
    const bp = stackBreakpoints[selectedBpIndex]
    displayMatch = bp.activeMatch
    activeTierGroup = bp.tierGroup
    const rangeLabel = bp.max === Infinity ? `${bp.min}+` : bp.min === bp.max ? `${bp.min}` : `${bp.min}\u2013${bp.max}`
    displayLabel = `stack ${rangeLabel}`
  } else {
    displayMatch = matches.find((m) => m.isFirstMatch) ?? null
  }

  // suppress unused variable warning for displayLabel (used for future tooltip/aria)
  void displayLabel

  const iconUrl = getItemIconUrl(item)
  const rarityColor = RARITY_COLORS[item.rarity] ?? '#c8c8c8'

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <CollapsedHeader
        collapsed={collapsed}
        iconUrl={iconUrl}
        itemName={item.name}
        baseType={item.baseType}
        rarityColor={rarityColor}
        isDirty={isDirty}
        isSaving={isSaving}
        isSaved={isSaved}
        onSave={handleSave}
      />

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        onScroll={() => {
          if (scrollRef.current) setCollapsed(scrollRef.current.scrollTop > 60)
        }}
        className="flex-1 overflow-y-auto"
      >
        <ItemSummary
          item={item}
          priceInfo={data.priceInfo}
          onRecolor={onOpenTools}
          onDustExplore={onOpenDustExplore}
          onDivExplore={onOpenDivExplore}
          rightSlot={<SaveButton isDirty={isDirty} isSaving={isSaving} isSaved={isSaved} onSave={handleSave} />}
          flush
        />
        <div className="p-3 flex flex-col gap-3">
          {activeTierGroup && (
            <TierNavigator
              key={activeTierGroup.currentTier}
              group={activeTierGroup}
              baseType={item.baseType}
              item={item}
              onMoved={() => {}}
            />
          )}
          {!activeTierGroup && (
            <div
              className="flex items-center gap-2 px-[10px] py-2 rounded text-[11px] text-text-dim"
              style={{ background: 'rgba(0,0,0,0.25)' }}
            >
              <span className="font-semibold text-accent">
                {displayMatch?.block.tierTag
                  ? (() => {
                      const t = displayMatch.block.tierTag!.tier
                      const m = t.match(/^t(\d+)(.*)/)
                      return m
                        ? `T${m[1]}${m[2] ? ` ${m[2]}` : ''}`
                        : t === 'exhide'
                          ? 'Hidden'
                          : t === 'restex'
                            ? 'Rest'
                            : t
                    })()
                  : `Block #${displayMatch?.blockIndex ?? '?'}`}
              </span>
              {displayMatch?.block.tierTag?.typePath && (
                <span className="text-[10px]">{displayMatch.block.tierTag.typePath.replace(/->/g, ' > ')}</span>
              )}
            </div>
          )}

          {hasBreakpoints && (
            <BreakpointEditor
              label="Stack Size Thresholds"
              thresholdType="stack"
              startValue={1}
              minBoundary={2}
              breakpoints={stackBreakpoints}
              selectedBpIndex={selectedBpIndex}
              onSelectBp={onSelectBp}
              onPendingChange={setPendingThreshold}
            />
          )}

          {hasQualityBreakpoints && (
            <BreakpointEditor
              label="Quality Thresholds"
              thresholdType="quality"
              suffix="%"
              startValue={0}
              minBoundary={1}
              breakpoints={qualityBreakpoints}
              selectedBpIndex={selectedQualityBpIndex}
              onSelectBp={onSelectQualityBp}
              onPendingChange={setPendingThreshold}
            />
          )}

          {hasStrandBreakpoints && (
            <BreakpointEditor
              label="Strand Thresholds"
              thresholdType="strand"
              startValue={0}
              minBoundary={1}
              breakpoints={strandBreakpoints}
              selectedBpIndex={selectedStrandBpIndex}
              onSelectBp={onSelectStrandBp}
              onPendingChange={setPendingThreshold}
            />
          )}

          {thresholdError && <div className="text-[10px] text-danger px-1 py-0">{thresholdError}</div>}

          {displayMatch ? (
            <div className="bg-bg-card rounded">
              <FilterBlockEditor
                key={`${item.name}-${item.baseType}-${displayMatch.blockIndex}-${selectedBpIndex}`}
                match={displayMatch}
                itemClass={item.itemClass}
                item={item}
                onClose={onClose}
                onSaveStateChange={handleSaveStateChange}
                tierGroup={activeTierGroup}
                onOpenAudit={onOpenAudit}
              />
            </div>
          ) : (
            <div className="p-3 bg-bg-card rounded text-text-dim text-center text-[12px]">
              No filter blocks match this item - it uses default visibility.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
