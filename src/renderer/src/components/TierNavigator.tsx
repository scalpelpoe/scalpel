import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { FilterBlock, PoeItem, TierGroup, TierSibling } from '../../../shared/types'
import { Down, Up } from '@icon-park/react'
import { IP } from '../shared/constants'
import { LootLabel, HiddenLootLabel, extractLabelStyle } from '../shared/LootLabel'

interface Props {
  group: TierGroup
  baseType: string
  item: PoeItem
  onMoved: (newTier: string) => void
}

export function TierNavigator({ group, baseType, item, onMoved }: Props): JSX.Element {
  const [moving, setMoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLDivElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const currentSib = group.siblings.find((s) => s.tier === group.currentTier)
  const hasStackSize = group.siblings.some((s) => s.block.conditions.some((c) => c.type === 'StackSize'))

  // Ex/exotic (exception) tiers are locked - no tier switching allowed
  const isExTier = (t: string): boolean => /^(ex\d*|exhide|exshow|2x\d*)$/.test(t) || t.startsWith('exotic')
  const currentIsEx = currentSib ? isExTier(currentSib.tier) : false
  const filteredSiblings = currentIsEx ? [] : group.siblings.filter((s) => !isExTier(s.tier))
  if (filteredSiblings.length <= 1) return <></>

  // Compute the max label height so the toggle doesn't resize when switching tiers
  const maxScaledSize = Math.max(
    ...group.siblings.map((s) => {
      if (s.visibility === 'Hide') return 11
      const fs = s.block.actions.find((a) => a.type === 'SetFontSize')
      return Math.round((fs ? Number(fs.values[0]) || 32 : 32) * 0.48)
    }),
  )
  const minLabelHeight = Math.round(maxScaledSize * 1.2 + 6) // lineHeight 1.2 + padding + border

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      )
        setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSelect = async (sib: TierSibling): Promise<void> => {
    if (sib.tier === group.currentTier || moving) {
      setOpen(false)
      return
    }

    const fromSib = currentSib
    if (!fromSib) return

    setMoving(true)
    setError(null)
    setOpen(false)

    const result = await window.api.moveItemTier(baseType, fromSib.blockIndex, sib.blockIndex, JSON.stringify(item))
    setMoving(false)

    if (result.ok) {
      onMoved(sib.tier)
    } else {
      setError(result.error ?? 'Failed to move')
    }
  }

  return (
    <div ref={ref} className="relative">
      {/* Toggle button */}
      <div
        ref={toggleRef}
        onClick={() => {
          if (moving) return
          if (!open && toggleRef.current) {
            const rect = toggleRef.current.getBoundingClientRect()
            setDropdownPos({ top: rect.bottom + 2, left: rect.left, width: rect.width })
          }
          setOpen((o) => !o)
        }}
        className="flex items-center gap-2 bg-bg-card border border-border rounded select-none px-[10px] py-1.5"
        style={{
          cursor: moving ? 'wait' : 'pointer',
        }}
      >
        <span className="text-[11px] text-text-dim shrink-0 self-stretch flex items-center border-r border-border bg-black/25 px-2 -my-1.5 -ml-[10px] mr-1 rounded-l">
          Switch Tier
        </span>
        <div className="flex items-center" style={{ minHeight: minLabelHeight }}>
          {currentSib &&
            (currentSib.visibility === 'Hide' ? (
              <HiddenLootLabel label={item.baseType} />
            ) : (
              <LootLabel
                block={currentSib.block}
                label={item.baseType}
                showStack={hasStackSize ? { min: getStackMin(currentSib.block) ?? 1 } : undefined}
              />
            ))}
        </div>
        {currentSib?.visibility === 'Hide' && <span className="text-[9px] font-bold text-hide shrink-0">[HIDDEN]</span>}
        <span className="text-[10px] text-text-dim ml-auto shrink-0">{formatTierLabel(group.currentTier)}</span>
        {moving ? (
          <span className="text-[10px] text-accent">saving...</span>
        ) : open ? (
          <Up size={12} {...IP} />
        ) : (
          <Down size={12} {...IP} />
        )}
      </div>

      {error && <div className="text-[10px] text-danger px-[10px] py-1">{error}</div>}

      {/* Dropdown list - rendered as portal to avoid transform containment */}
      {open &&
        dropdownPos &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed bg-bg border border-border rounded overflow-hidden overflow-y-auto z-[9999]"
            style={{
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              maxHeight: 400,
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            }}
          >
            {filteredSiblings.map((sib) => {
              const isCurrent = sib.tier === group.currentTier
              const isHidden = sib.visibility === 'Hide'

              return (
                <div
                  key={sib.tier}
                  onClick={() => handleSelect(sib)}
                  className="flex items-center gap-2 cursor-pointer"
                  style={{
                    padding: '8px 10px',
                    background: isCurrent ? 'rgba(200,169,110,0.1)' : 'transparent',
                    borderLeft: isCurrent ? '3px solid var(--accent)' : '3px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isCurrent ? 'rgba(200,169,110,0.1)' : 'transparent'
                  }}
                >
                  {/* Tier label */}
                  <span
                    className="text-[11px] font-bold w-[60px] shrink-0 overflow-hidden text-ellipsis whitespace-nowrap"
                    style={{
                      color: isCurrent ? 'var(--accent)' : 'var(--text-dim)',
                    }}
                  >
                    {formatTierLabel(sib.tier)}
                  </span>

                  {/* Loot label preview */}
                  <div className="flex-1 min-w-0 flex items-center gap-[6px]">
                    {isHidden ? (
                      <HiddenLootLabel label={item.baseType} />
                    ) : (
                      <LootLabel
                        block={sib.block}
                        label={item.baseType}
                        showStack={hasStackSize ? { min: getStackMin(sib.block) ?? 1 } : undefined}
                      />
                    )}
                    {isHidden && <span className="text-[9px] font-bold text-hide shrink-0">[HIDDEN]</span>}
                  </div>

                  {/* Current indicator */}
                  {isCurrent && <span className="text-[9px] text-accent italic shrink-0">current</span>}
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </div>
  )
}

/** Extract PoE loot label styling from a filter block's actions */
function getStackMin(block: FilterBlock): number | null {
  const cond = block.conditions.find((c) => c.type === 'StackSize')
  if (!cond) return null
  const val = Number(cond.values[0])
  if (!val || val <= 1) return null
  return val
}

/** Used by the shared LootLabel to compute minLabelHeight */
function _getLabelHeight(block: FilterBlock): number {
  const { fontSize } = extractLabelStyle(block)
  return Math.round(fontSize * 0.48 * 1.2) + 4
}

function formatTierLabel(tier: string): string {
  const m = tier.match(/^t(\d+)(.*)/)
  if (m) {
    const suffix = m[2] ? ` ${m[2]}` : ''
    return `T${m[1]}${suffix}`
  }
  if (tier === 'exhide') return 'Hidden'
  if (tier === 'restex') return 'Rest'
  return tier
}
