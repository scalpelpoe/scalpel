import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FilterAction, FilterBlock } from '../../../../shared/types'
import { invalidateColorFreqCache } from './color-freq-cache'
import { ConditionRow } from './ConditionRow'
import { ColorActionEditor } from './ColorActionEditor'
import { EffectsGroup, ActionBox, ActionEditor } from './EffectsGroup'
import { formatTierLabel } from '../price-audit/constants'
import { SettingConfig, MenuUnfold, MenuFold, ChartHistogram } from '@icon-park/react'
import { IP } from '../../shared/constants'
import { InfoChip } from '../../shared/InfoChip'
import { composeLabelStyle } from '../../shared/LootLabel'
import { TierActionCard } from './TierActionCard'
import { TierIconStrip } from './TierIconStrip'
import { useAuditPricePreview } from './useAuditPricePreview'
import type { FilterBlockEditorProps } from './types'

export function FilterBlockEditor({
  match,
  chain,
  itemClass,
  item,
  onClose: _onClose,
  onSaveStateChange,
  tierGroup: _tierGroup,
  league: _league,
  onOpenAudit,
  tierSisterOpen,
  onToggleTierSister,
  tierSisterSide,
}: FilterBlockEditorProps): JSX.Element {
  const { block, blockIndex } = match
  // Resolve the full chain once. Without one, we behave exactly like the old
  // single-block editor (the primary match is its own chain). With one, color
  // edits route to whichever block in the chain currently owns each action.
  const chainMatches = useMemo(() => chain ?? [match], [chain, match])
  const originals = useMemo(() => {
    const by: Record<number, FilterBlock> = {}
    for (const m of chainMatches) by[m.blockIndex] = m.block
    return by
  }, [chainMatches])

  // Per-block edit buffers, keyed by blockIndex. Lazily populated: a block is
  // only cloned into `edits` once the user actually changes something on it.
  // Everything non-color still edits the primary; color edits route by action
  // owner (see `findColorOwner`).
  const [edits, setEdits] = useState<Record<number, FilterBlock>>(() => ({ [blockIndex]: structuredClone(block) }))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Read the current editing state of any chain block, cloning on demand. */
  const blockAt = useCallback((idx: number): FilterBlock => edits[idx] ?? originals[idx], [edits, originals])

  /** The primary (non-Continue) match -- everything outside color slots still
   *  edits this single block. */
  const editing = blockAt(blockIndex)

  const isDirty = Object.entries(edits).some(
    ([idxStr, b]) => JSON.stringify(b) !== JSON.stringify(originals[Number(idxStr)]),
  )

  const editsRef = useRef(edits)
  editsRef.current = edits
  const originalsRef = useRef(originals)
  originalsRef.current = originals

  const save = useCallback(async (): Promise<void> => {
    setSaving(true)
    setError(null)
    const itemJson = item ? JSON.stringify(item) : undefined
    // Save every dirty block in the chain. Serial (not Promise.all) so the
    // main process mutates `currentFilter` for block N before handling block
    // M -- both targets are in the same file and both calls rewrite it. Stops
    // at the first failure so a mid-chain error doesn't leave partial edits.
    const dirtyEntries = Object.entries(editsRef.current).filter(
      ([idxStr, b]) => JSON.stringify(b) !== JSON.stringify(originalsRef.current[Number(idxStr)]),
    )
    let failure: string | null = null
    for (const [idxStr, b] of dirtyEntries) {
      const result = await window.api.saveBlockEdit(Number(idxStr), b, itemJson)
      if (!result.ok) {
        failure = result.error ?? 'Unknown error'
        break
      }
    }
    setSaving(false)
    if (failure) {
      setError(failure)
    } else {
      invalidateColorFreqCache()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }, [item])

  // Report save state to parent
  useEffect(() => {
    onSaveStateChange?.({ isDirty, saving, saved, error, save })
  }, [isDirty, saving, saved, error, save])

  const updateVisibility = (v: FilterBlock['visibility']): void =>
    setEdits((prev) => {
      const current = prev[blockIndex] ?? structuredClone(originals[blockIndex])
      return { ...prev, [blockIndex]: { ...current, visibility: v } }
    })

  const updateActionOn = (targetIdx: number, actionIdx: number, updated: FilterAction): void =>
    setEdits((prev) => {
      const current = prev[targetIdx] ?? structuredClone(originals[targetIdx])
      const actions = [...current.actions]
      actions[actionIdx] = updated
      return { ...prev, [targetIdx]: { ...current, actions } }
    })

  const addActionOn = (targetIdx: number, action: FilterAction): number => {
    let newIndex = -1
    setEdits((prev) => {
      const current = prev[targetIdx] ?? structuredClone(originals[targetIdx])
      newIndex = current.actions.length
      return { ...prev, [targetIdx]: { ...current, actions: [...current.actions, action] } }
    })
    return newIndex
  }

  // Everything outside color editing still targets the primary block.
  const updateAction = (idx: number, updated: FilterAction): void => updateActionOn(blockIndex, idx, updated)
  const addAction = (action: FilterAction): number => addActionOn(blockIndex, action)

  /** Which chain block currently owns an action of the given type? Game
   *  semantics: later blocks in the chain override earlier ones, so we walk
   *  bottom-up. Returns null when nobody in the chain has authored it. */
  const findColorOwner = (type: string): { blockIndex: number; actionIndex: number } | null => {
    for (let i = chainMatches.length - 1; i >= 0; i--) {
      const idx = chainMatches[i].blockIndex
      const actions = blockAt(idx).actions
      const actIdx = actions.findIndex((a) => a.type === type)
      if (actIdx >= 0) return { blockIndex: idx, actionIndex: actIdx }
    }
    return null
  }

  const rawTierHeading = block.tierTag ? formatTierLabel(block.tierTag.tier) : `Block #${blockIndex + 1}`
  const tierHeading = rawTierHeading.replace(/\b\w/g, (c) => c.toUpperCase())
  const typePathLabel = block.tierTag?.typePath?.replace(/->/g, ' > ')

  // PoE2's poe.ninja coverage is a patchwork -- whole item classes (Waystones,
  // Relics, Talismans, Fishing Rods, half the rare equipment slots) have no
  // price data at all, which would land the audit view on a wall of "No price"
  // rows with no sliders to play with. `auditHasNoPrices` is the preview check:
  // true when the IPC came back confirming zero priced items for this tier's
  // base list. Undefined while we're still waiting, so the button stays
  // enabled during the short pre-flight rather than flickering disabled.
  const auditHasNoPrices = useAuditPricePreview(
    editing.conditions.filter((c) => c.type === 'BaseType').flatMap((c) => c.values),
    editing.conditions.some((c) => c.type === 'Rarity' && c.values.includes('Unique')),
  )

  return (
    <div>
      {/* Tier title -- scopes the whole block section so Show/Hide + conditions read as
       *  "settings for THIS tier", separate from the item-scoped Switch Tier control above. */}
      <div className="px-3 pt-3 pb-2 flex items-center gap-2 flex-wrap">
        <SettingConfig size={14} {...IP} className="text-accent" />
        <span className="section-title">Tier: {tierHeading}</span>
        {itemClass && (
          <InfoChip size="sm" className="ml-auto">
            <span className="text-text-dim">{itemClass}</span>
          </InfoChip>
        )}
        {typePathLabel && (
          <InfoChip size="sm" className={itemClass ? undefined : 'ml-auto'}>
            <span className="text-text-dim">{typePathLabel}</span>
          </InfoChip>
        )}
      </div>

      {/* Show / Hide toggle */}
      <div className="flex gap-1 px-3 py-2 border-b border-border">
        {(['Show', 'Hide'] as const).map((v) => {
          const active = editing.visibility === v
          return (
            <div
              key={v}
              onClick={() => updateVisibility(v)}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = 'rgba(0,0,0,0.25)'
              }}
              className="flex-1 py-[6px] rounded cursor-pointer text-[11px] font-bold tracking-[0.5px] uppercase text-center select-none transition-all duration-[120ms]"
              style={{
                color: active ? '#fff' : 'var(--text-dim)',
                background: active ? (v === 'Show' ? '#4caf50' : '#ef5350') : 'rgba(0,0,0,0.25)',
                boxShadow: active ? '0 1px 4px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.2)',
              }}
            >
              {v}
            </div>
          )
        })}
      </div>

      <div className="p-3">
        {/* Conditions are split into two panels so the reader can see at a glance which
         *  items are caught by the tier ("Items in this Tier") vs the other constraints
         *  the tier imposes ("Additional Tier Details"). Class is always omitted -- the
         *  header chip covers it. */}
        {(() => {
          const baseTypeConds = editing.conditions.filter((c) => c.type === 'BaseType')
          const otherConds = editing.conditions.filter((c) => c.type !== 'Class' && c.type !== 'BaseType')
          const isExTier =
            block.tierTag &&
            (/^(ex\d*|exhide|exshow|2x\d*)$/.test(block.tierTag.tier) || block.tierTag.tier.startsWith('exotic'))
          const showAuditButton = !!onOpenAudit && baseTypeConds.some((c) => c.values.length > 0) && !isExTier
          const hasItemsPanel = baseTypeConds.length > 0 || showAuditButton
          const baseTypeCount = baseTypeConds.reduce((sum, c) => sum + c.values.length, 0)

          return (
            <>
              {hasItemsPanel && (
                <div className="bg-black/20 rounded p-[6px_8px] mb-3 flex flex-col gap-[8px]">
                  <div className="text-[10px] font-bold text-text-dim uppercase tracking-[0.5px]">
                    Items in this Tier
                  </div>
                  <div className="flex gap-2 items-stretch">
                    {baseTypeCount > 0 && onToggleTierSister && (
                      <TierActionCard
                        buttonLabel={tierSisterOpen ? 'Collapse' : 'Expand'}
                        leadingIcon={
                          // Default icon arrow points right (sister opens to the right);
                          // flip horizontally when the sister is on the left.
                          <span
                            style={{
                              display: 'inline-flex',
                              transform: tierSisterSide === 'left' ? 'scaleX(-1)' : undefined,
                            }}
                          >
                            {tierSisterOpen ? <MenuFold size={18} {...IP} /> : <MenuUnfold size={18} {...IP} />}
                          </span>
                        }
                        onClick={onToggleTierSister}
                      >
                        <TierIconStrip names={baseTypeConds.flatMap((c) => c.values)} />
                      </TierActionCard>
                    )}
                    {showAuditButton && (
                      <TierActionCard
                        buttonLabel={auditHasNoPrices ? 'Audit Unavailable' : 'Run Economy Audit'}
                        leadingIcon={<ChartHistogram size={18} {...IP} />}
                        onClick={onOpenAudit}
                        disabled={auditHasNoPrices === true}
                        primary={!auditHasNoPrices}
                      >
                        <div className="text-[10px] text-text-dim leading-[1.3]">
                          {auditHasNoPrices
                            ? 'No bulk retiering in this category yet.'
                            : 'Make bulk changes to this tier based on the current economy.'}
                        </div>
                      </TierActionCard>
                    )}
                  </div>
                </div>
              )}

              {otherConds.length > 0 && (
                <div className="bg-black/20 rounded p-[6px_8px] mb-3 flex flex-col gap-[6px]">
                  <div className="text-[10px] font-bold text-text-dim uppercase tracking-[0.5px]">
                    Additional Tier Details
                  </div>
                  <div className="font-mono text-[11px] flex flex-col gap-[2px]">
                    {otherConds.map((cond, i) => (
                      <ConditionRow key={i} cond={cond} itemClass={itemClass} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )
        })()}

        {/* Actions */}
        {(() => {
          const colorTypes = new Set(['SetTextColor', 'SetBorderColor', 'SetBackgroundColor'])
          const soundTypes = new Set([
            'PlayAlertSound',
            'PlayAlertSoundPositional',
            'PlaySound',
            'CustomAlertSound',
            'CustomAlertSoundOptional',
          ])
          const effectTypes = new Set(['PlayEffect'])
          const iconTypes = new Set(['MinimapIcon'])
          const fontSizeType = 'SetFontSize'
          const skipTypes = new Set([...colorTypes, ...soundTypes, ...effectTypes, ...iconTypes, fontSizeType])

          // Ensure all three color types are always editable. Each slot tracks
          // which chain block currently owns its value (may be a Continue
          // decorator upstream of the primary match) so edits route there
          // rather than materializing a new action on the primary block and
          // silently overriding the Continue source. Slots with no owner get
          // a placeholder; first edit creates the action on the primary block.
          const colorDefaults: Record<string, string[]> = {
            SetTextColor: ['200', '200', '200', '255'],
            SetBorderColor: ['200', '200', '200', '255'],
            SetBackgroundColor: ['0', '0', '0', '240'],
          }
          type ColorSlot = {
            action: FilterAction
            /** Block that authored the action, or the primary block when unset (add-target). */
            targetIndex: number
            /** Action index within that block, or -1 when unset. */
            actionIndex: number
            /** True when no chain block has authored this color -- rendered as `(NONE)`. */
            unset: boolean
          }
          const colorSlots: ColorSlot[] = ['SetTextColor', 'SetBorderColor', 'SetBackgroundColor'].map((type) => {
            const owner = findColorOwner(type)
            if (owner) {
              return {
                action: blockAt(owner.blockIndex).actions[owner.actionIndex],
                targetIndex: owner.blockIndex,
                actionIndex: owner.actionIndex,
                unset: false,
              }
            }
            return {
              action: { type, values: colorDefaults[type] } as FilterAction,
              targetIndex: blockIndex,
              actionIndex: -1,
              unset: true,
            }
          })
          const soundAction = editing.actions
            .map((a, i) => ({ action: a, index: i }))
            .find(({ action }) => soundTypes.has(action.type))
          const effectAction = editing.actions
            .map((a, i) => ({ action: a, index: i }))
            .find(({ action }) => effectTypes.has(action.type))
          const iconAction = editing.actions
            .map((a, i) => ({ action: a, index: i }))
            .find(({ action }) => iconTypes.has(action.type))
          const fontSizeAction = editing.actions
            .map((a, i) => ({ action: a, index: i }))
            .find(({ action }) => action.type === fontSizeType)
          const otherActions = editing.actions
            .map((a, i) => ({ action: a, index: i }))
            .filter(({ action }) => !skipTypes.has(action.type))

          // Compose the effective label style across the whole match chain so the
          // preview reflects what the game would actually render -- Continue
          // decorators upstream plus overrides from the primary block. Font size
          // falls back to the primary's SetFontSize when the chain doesn't set
          // one because that's what the slider edits.
          const composed = composeLabelStyle(chainMatches.map((m) => blockAt(m.blockIndex)))
          const textColorCss = composed.textColor
          const bgColorCss = composed.bgColor
          const borderColorCss = composed.borderColor !== 'transparent' ? composed.borderColor : undefined
          const fontSize = fontSizeAction ? Number(fontSizeAction.action.values[0]) || 32 : composed.fontSize

          return (
            <div className="flex flex-col gap-2">
              {/* Appearance: label preview + colors + font size */}
              {(colorSlots.length > 0 || fontSizeAction) && (
                <div className="bg-black/25 rounded overflow-hidden">
                  <div className="text-[10px] font-bold text-text-dim uppercase tracking-[0.5px] px-3 pt-[8px] pb-[2px]">
                    Tier Label
                  </div>
                  {/* Label preview header */}
                  <div className="flex items-center px-3 py-[10px] h-[42px]">
                    <div className="flex-1 flex items-center justify-center">
                      <div
                        className="inline-flex items-center justify-center px-[6px] py-px rounded-sm origin-center"
                        style={{
                          background: bgColorCss,
                          border: borderColorCss
                            ? `${Math.max(0.25, 7.5 / (fontSize * 0.48))}px solid ${borderColorCss}`
                            : '0.5px solid transparent',
                          transform: `scale(${(fontSize * 0.48) / 15})`,
                        }}
                      >
                        <span
                          className="text-[15px] leading-[1.2] whitespace-nowrap"
                          style={{
                            fontFamily: "'Fontin SmallCaps', serif",
                            color: textColorCss ?? 'var(--text)',
                          }}
                        >
                          {item?.baseType ?? 'Sample Label'}
                        </span>
                      </div>
                    </div>
                    {fontSizeAction && (
                      <div className="flex items-center gap-[6px]">
                        <input
                          type="range"
                          min={18}
                          max={45}
                          value={fontSizeAction.action.values[0] ?? '32'}
                          className="w-20 accent-accent"
                          onChange={(e) =>
                            updateAction(fontSizeAction.index, {
                              ...fontSizeAction.action,
                              values: [e.target.value],
                            })
                          }
                        />
                        <span className="text-[10px] text-text-dim font-mono min-w-[18px] text-right">
                          {fontSizeAction.action.values[0] ?? '32'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Color editors -- each slot routes its edit to whichever block
                      in the Continue chain currently owns that action type, so
                      changes to a Continue decorator land on the decorator. */}
                  {colorSlots.length > 0 && (
                    <div className="flex gap-2 px-[10px] py-2">
                      {colorSlots.map(({ action, targetIndex, actionIndex, unset }) => (
                        <ColorActionEditor
                          key={action.type}
                          action={action}
                          unset={unset}
                          onChange={(updated) => {
                            if (actionIndex === -1) {
                              addActionOn(targetIndex, updated)
                            } else {
                              updateActionOn(targetIndex, actionIndex, updated)
                            }
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Effects (minimap, beam, sound) -- collapsed by default */}
              <EffectsGroup
                iconAction={iconAction}
                effectAction={effectAction}
                soundAction={soundAction}
                updateAction={updateAction}
                addAction={addAction}
              />

              {/* Other actions */}
              {otherActions.length > 0 && (
                <ActionBox title="Other">
                  <div className="flex flex-col gap-[6px]">
                    {otherActions.map(({ action, index }) => (
                      <ActionEditor key={index} action={action} onChange={(updated) => updateAction(index, updated)} />
                    ))}
                  </div>
                </ActionBox>
              )}
            </div>
          )
        })()}

        {error && <div className="text-[11px] text-danger">{error}</div>}
      </div>
    </div>
  )
}
