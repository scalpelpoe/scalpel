import { useMemo } from 'react'
import { ChartHistogram } from '@icon-park/react'
import type { OverlayData, FilterBlock, TierGroup } from '@shared/types'
import { iconMap, IP } from '../shared/constants'
import { PriceAudit, AuditTierControls, useAuditState } from '../features/price-audit'
import { getActiveMatch } from '../shared/activeMatch'
import { Notice } from './Notice'
import { m } from '@shared/paraglide/messages.js'

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
  const match = t.match(/^t(\d+)(.*)/)
  if (match) return `T${match[1]}${match[2] ? ` ${match[2]}` : ''}`
  if (t === 'exhide') return m.audit_tier_hidden()
  if (t === 'restex') return m.audit_tier_rest()
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
  const { match: activeMatch, tierGroup: activeTierGroup } = getActiveMatch(
    overlayData,
    selectedBpIndex,
    selectedQualityBpIndex,
    selectedStrandBpIndex,
  )

  // The audit hotkey (`openAudit` app macro) and the FilterBlockEditor "Audit Tier"
  // button both flip view to 'audit' regardless of whether the active match actually
  // has anything to audit. Render an explanatory panel instead of a blank view when
  // we can't do anything useful.
  if (!activeMatch) return <AuditUnavailable reason="no-match" />
  const baseTypeConds = activeMatch.block.conditions.filter((c) => c.type === 'BaseType')
  const hasBaseTypes = baseTypeConds.some((c) => c.values.length > 0)
  const tierStr = activeMatch.block.tierTag?.tier ?? ''
  if (!hasBaseTypes) return <AuditUnavailable reason="no-basetypes" />
  if (isExTier(tierStr)) return <AuditUnavailable reason="ex-tier" />

  const selectedSib =
    auditBlockIndex !== null ? activeTierGroup?.siblings.find((s) => s.blockIndex === auditBlockIndex) : null
  const block = selectedSib?.block ?? activeMatch.block
  const blockIndex = selectedSib?.blockIndex ?? activeMatch.blockIndex

  return (
    <AuditViewInner
      overlayData={overlayData}
      block={block}
      blockIndex={blockIndex}
      tierGroup={activeTierGroup}
      onSetAuditBlockIndex={onSetAuditBlockIndex}
      onSelectItem={onSelectItem}
    />
  )
}

interface AuditViewInnerProps {
  overlayData: OverlayData
  block: FilterBlock
  blockIndex: number
  tierGroup?: TierGroup
  onSetAuditBlockIndex: (v: number) => void
  onSelectItem: () => void
}

function AuditViewInner({
  overlayData,
  block,
  blockIndex,
  tierGroup,
  onSetAuditBlockIndex,
  onSelectItem,
}: AuditViewInnerProps): JSX.Element {
  const itemClass = overlayData.item.itemClass

  const state = useAuditState({ block, blockIndex, tierGroup, item: overlayData.item })

  const tierTag = block.tierTag
  const stackCond = block.conditions.find((c) => c.type === 'StackSize')
  const stackLabel = stackCond ? `Stack ${stackCond.operator ?? ''} ${stackCond.values.join('-')}`.trim() : null
  const tierLabel =
    (tierTag ? formatTier(tierTag.tier) : `Block #${blockIndex + 1}`) + (stackLabel ? ` (${stackLabel})` : '')

  const classValues = block.conditions.filter((c) => c.type === 'Class').flatMap((c) => c.values)
  const classLabel = classValues.length > 0 ? classValues.join(', ') : itemClass

  // Memoize on the baseTypes list so slider-driven re-renders of this component don't
  // reshuffle the hero icon grid. Only re-rolls when the tier (and therefore the pool
  // of baseTypes) actually changes.
  const gridIcons = useMemo(() => {
    const pool = state.baseTypes.filter((bt) => !!iconMap[bt])
    const picked: string[] = []
    const scratch = [...pool]
    for (let i = 0; i < 4 && scratch.length > 0; i++) {
      const idx = Math.floor(Math.random() * scratch.length)
      picked.push(iconMap[scratch[idx]])
      scratch.splice(idx, 1)
    }
    return picked
  }, [state.baseTypes.join('|')])

  const currentIsEx = tierTag ? isExTier(tierTag.tier) : false
  const siblingsWithItems = currentIsEx ? [] : (tierGroup?.siblings.filter((s) => !isExTier(s.tier)) ?? [])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Hero + Audit Tier controls (pinned above the scrollable list) */}
      <div className="bg-bg-card border-b border-border overflow-hidden shrink-0">
        <div className="flex gap-2.5 items-start overflow-hidden" style={{ padding: '10px 12px' }}>
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

          <div className="flex-1 flex flex-col gap-1 min-w-0">
            <span className="text-accent font-bold text-sm">{tierLabel}</span>
            <span className="text-text-dim text-xs">{classLabel}</span>
          </div>

          <div className="flex flex-col items-start gap-1 shrink-0">
            <span className="text-[10px] text-text-dim pl-1">
              {siblingsWithItems.length > 1 ? m.audit_other_tier() : m.audit_current_tier()}
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
                    {s.visibility === 'Hide' ? ` ${m.audit_hidden_marker()}` : ''}
                  </option>
                ))
              ) : (
                <option value={blockIndex}>{tierTag ? formatTier(tierTag.tier) : tierLabel}</option>
              )}
            </select>
          </div>
        </div>

        <AuditTierControls state={state} />
      </div>

      <div className="flex-1 min-h-0 flex flex-col p-3">
        <PriceAudit state={state} itemClass={itemClass} onSelectItem={onSelectItem} />
      </div>
    </div>
  )
}

function unavailableBody(reason: 'no-match' | 'no-basetypes' | 'ex-tier'): string {
  if (reason === 'no-basetypes') return m.audit_no_basetypes()
  if (reason === 'ex-tier') return m.audit_ex_tier()
  return m.audit_no_match()
}

function AuditUnavailable({ reason }: { reason: 'no-match' | 'no-basetypes' | 'ex-tier' }): JSX.Element {
  return <Notice icon={<ChartHistogram size={32} {...IP} />} title={m.audit_nothing()} body={unavailableBody(reason)} />
}
