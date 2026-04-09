import type { MatchResult, OverlayData } from '../../../shared/types'
import itemIcons from '../../../shared/data/items/item-icons.json'
import { PriceAudit } from '../components/price-audit'

interface AuditViewProps {
  overlayData: OverlayData
  selectedBpIndex: number | null
  selectedQualityBpIndex: number | null
  selectedStrandBpIndex: number | null
  auditBlockIndex: number | null
  onSetAuditBlockIndex: (v: number) => void
  onSelectItem: () => void
}

function formatTier(t: string): string {
  const m = t.match(/^t(\d+)(.*)/)
  if (m) return `T${m[1]}${m[2] ? ` ${m[2]}` : ''}`
  if (t === 'exhide') return 'Hidden'
  if (t === 'restex') return 'Rest'
  return t
}

function isExTier(t: string): boolean {
  return /^(ex\d*|exhide|exshow|2x\d*)$/.test(t) || t.startsWith('exotic')
}

export function AuditView({
  overlayData,
  selectedBpIndex,
  selectedQualityBpIndex,
  selectedStrandBpIndex,
  auditBlockIndex,
  onSetAuditBlockIndex,
  onSelectItem,
}: AuditViewProps): JSX.Element | null {
  const { stackBreakpoints, qualityBreakpoints, strandBreakpoints } = overlayData
  const itemClass = overlayData.item.itemClass
  const iconMap = itemIcons as Record<string, string>

  // Determine active match accounting for breakpoint selection (same logic as FilterPanel)
  let activeMatch: MatchResult | null =
    overlayData.matches.find((m) => m.isFirstMatch) ?? overlayData.matches[0] ?? null
  let activeTierGroup = overlayData.tierGroup
  if (strandBreakpoints && strandBreakpoints.length > 1 && selectedStrandBpIndex !== null) {
    const bp = strandBreakpoints[selectedStrandBpIndex]
    if (bp?.activeMatch) {
      activeMatch = bp.activeMatch
      activeTierGroup = bp.tierGroup
    }
  } else if (qualityBreakpoints && qualityBreakpoints.length > 1 && selectedQualityBpIndex !== null) {
    const bp = qualityBreakpoints[selectedQualityBpIndex]
    if (bp?.activeMatch) {
      activeMatch = bp.activeMatch
      activeTierGroup = bp.tierGroup
    }
  } else if (stackBreakpoints && stackBreakpoints.length > 1 && selectedBpIndex !== null) {
    const bp = stackBreakpoints[selectedBpIndex]
    if (bp?.activeMatch) {
      activeMatch = bp.activeMatch
      activeTierGroup = bp.tierGroup
    }
  }
  if (!activeMatch) return null

  // Use auditBlockIndex override if set, otherwise breakpoint-aware match
  const selectedSib =
    auditBlockIndex !== null ? activeTierGroup?.siblings.find((s) => s.blockIndex === auditBlockIndex) : null
  const block = selectedSib?.block ?? activeMatch.block
  const blockIndex = selectedSib?.blockIndex ?? activeMatch.blockIndex
  const tierGroup = activeTierGroup

  // Tier label
  const tierTag = block.tierTag
  const stackCond = block.conditions.find((c) => c.type === 'StackSize')
  const stackLabel = stackCond ? `Stack ${stackCond.operator ?? ''} ${stackCond.values.join('-')}`.trim() : null
  const tierLabel =
    (tierTag ? formatTier(tierTag.tier) : `Block #${blockIndex + 1}`) + (stackLabel ? ` (${stackLabel})` : '')

  // Class display
  const classValues = block.conditions.filter((c) => c.type === 'Class').flatMap((c) => c.values)
  const classLabel = classValues.length > 0 ? classValues.join(', ') : itemClass

  // Pick 4 random icons from base types
  const baseTypes = block.conditions.filter((c) => c.type === 'BaseType').flatMap((c) => c.values)
  const withIcons = baseTypes.filter((bt) => !!iconMap[bt])
  const gridIcons: string[] = []
  const pool = [...withIcons]
  for (let i = 0; i < 4 && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    gridIcons.push(iconMap[pool[idx]])
    pool.splice(idx, 1)
  }

  // Tier dropdown siblings -- separate ex (exception) tiers from regular tiers
  const currentIsEx = tierTag ? isExTier(tierTag.tier) : false
  const siblingsWithItems = currentIsEx
    ? []
    : (tierGroup?.siblings.filter(
        (s) => s.block.conditions.some((c) => c.type === 'BaseType' && c.values.length > 0) && !isExTier(s.tier),
      ) ?? [])

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {/* Hero */}
      <div
        className="bg-bg-solid border-b border-border flex gap-2.5 items-start overflow-hidden"
        style={{
          margin: '-12px -12px 0 -12px',
          padding: '10px 12px',
        }}
      >
        {/* 2x2 icon grid with glow */}
        {gridIcons.length > 0 && (
          <div className="relative w-10 h-10 shrink-0">
            <img
              src={gridIcons[0]}
              alt=""
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{
                width: 90,
                height: 90,
                objectFit: 'contain',
                filter: 'blur(14px) saturate(1.8)',
                opacity: 0.6,
              }}
            />
            <div className="relative w-10 h-10 grid grid-cols-2 grid-rows-2 gap-px">
              {gridIcons.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt=""
                  className="object-contain"
                  style={{ width: 19, height: 19, imageRendering: 'auto' }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Tier name + class */}
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          <span className="text-accent font-bold text-sm">{tierLabel}</span>
          <span className="text-text-dim text-xs">{classLabel}</span>
        </div>

        {/* Tier dropdown */}
        <div className="flex flex-col items-start gap-1 shrink-0">
          <span className="text-[10px] text-text-dim pl-1">
            {siblingsWithItems.length > 1 ? 'Audit Other Tier' : 'Current Tier'}
          </span>
          <select
            value={blockIndex}
            disabled={siblingsWithItems.length <= 1}
            onChange={(e) => {
              onSetAuditBlockIndex(Number(e.target.value))
            }}
            className="text-[11px] rounded w-full"
            style={{
              padding: '4px 24px 4px 8px',
              opacity: siblingsWithItems.length <= 1 ? 0.7 : 1,
            }}
          >
            {siblingsWithItems.length > 0 ? (
              siblingsWithItems.map((s) => (
                <option key={s.blockIndex} value={s.blockIndex}>
                  {formatTier(s.tier)}
                  {s.visibility === 'Hide' ? ' [HIDDEN]' : ''}
                </option>
              ))
            ) : (
              <option value={blockIndex}>{tierTag ? formatTier(tierTag.tier) : tierLabel}</option>
            )}
          </select>
        </div>
      </div>

      {/* Audit panel */}
      <PriceAudit
        block={block}
        blockIndex={blockIndex}
        tierGroup={tierGroup}
        item={overlayData.item}
        itemClass={itemClass}
        onSelectItem={onSelectItem}
      />
    </div>
  )
}
