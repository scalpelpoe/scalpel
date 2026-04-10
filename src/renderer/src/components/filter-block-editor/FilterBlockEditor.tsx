import { useCallback, useEffect, useRef, useState } from 'react'
import type { FilterAction, FilterBlock } from '../../../../shared/types'
import { invalidateColorFreqCache } from './color-freq-cache'
import { ConditionRow } from './ConditionRow'
import { ColorActionEditor } from './ColorActionEditor'
import { EffectsGroup, ActionBox, ActionEditor } from './EffectsGroup'
import type { FilterBlockEditorProps } from './types'

export function FilterBlockEditor({
  match,
  itemClass,
  item,
  onClose: _onClose,
  onSaveStateChange,
  tierGroup: _tierGroup,
  league: _league,
  onOpenAudit,
}: FilterBlockEditorProps): JSX.Element {
  const { block, blockIndex } = match
  const [editing, setEditing] = useState<FilterBlock>(structuredClone(block))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDirty = JSON.stringify(editing) !== JSON.stringify(block)

  const editingRef = useRef(editing)
  editingRef.current = editing

  const save = useCallback(async (): Promise<void> => {
    setSaving(true)
    setError(null)
    const result = await window.api.saveBlockEdit(
      blockIndex,
      editingRef.current,
      item ? JSON.stringify(item) : undefined,
    )
    setSaving(false)
    if (result.ok) {
      invalidateColorFreqCache()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      setError(result.error ?? 'Unknown error')
    }
  }, [blockIndex, item])

  // Report save state to parent
  useEffect(() => {
    onSaveStateChange?.({ isDirty, saving, saved, error, save })
  }, [isDirty, saving, saved, error, save])

  const updateVisibility = (v: FilterBlock['visibility']): void => setEditing((prev) => ({ ...prev, visibility: v }))

  const updateAction = (idx: number, updated: FilterAction): void =>
    setEditing((prev) => {
      const actions = [...prev.actions]
      actions[idx] = updated
      return { ...prev, actions }
    })

  const addAction = (action: FilterAction): number => {
    let newIndex = -1
    setEditing((prev) => {
      newIndex = prev.actions.length
      return { ...prev, actions: [...prev.actions, action] }
    })
    return newIndex
  }

  return (
    <div>
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
        {/* Conditions */}
        {(() => {
          const hasClass = editing.conditions.some((c) => c.type === 'Class')
          const showClassRow = !hasClass && itemClass
          if (editing.conditions.length === 0 && !showClassRow) return null
          return (
            <div className="font-mono text-[11px] bg-black/20 rounded p-[6px_8px] mb-3 flex flex-col gap-[2px]">
              <div className="flex gap-[6px] flex-wrap">
                <span className="min-w-[130px]" style={{ color: '#7ec8e3' }}>
                  Tier
                </span>
                <span style={{ color: '#f0c27f' }}>
                  {block.tierTag ? block.tierTag.tier : `Block #${blockIndex + 1}`}
                </span>
              </div>
              {showClassRow && (
                <ConditionRow cond={{ type: 'Class', operator: '=', values: [itemClass] }} itemClass={itemClass} />
              )}
              {editing.conditions.map((cond, i) => (
                <ConditionRow key={i} cond={cond} itemClass={itemClass} />
              ))}
              {onOpenAudit &&
                editing.conditions.some((c) => c.type === 'BaseType' && c.values.length > 0) &&
                !(
                  block.tierTag &&
                  (/^(ex\d*|exhide|exshow|2x\d*)$/.test(block.tierTag.tier) || block.tierTag.tier.startsWith('exotic'))
                ) && (
                  <div className="bg-black/20 rounded p-[6px_8px] mt-[6px] flex items-center gap-2">
                    <button onClick={onOpenAudit} className="primary px-3 py-1 text-[11px] shrink-0 mr-1">
                      Run Economy Audit on Tier
                    </button>
                    <span className="text-[10px] text-text-dim">Make bulk changes based on the current economy</span>
                  </div>
                )}
            </div>
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

          // Ensure all three color types are always editable.
          // Missing colors get a placeholder index of -1 and are added on first edit.
          const colorDefaults: Record<string, string[]> = {
            SetTextColor: ['200', '200', '200', '255'],
            SetBorderColor: ['200', '200', '200', '255'],
            SetBackgroundColor: ['0', '0', '0', '240'],
          }
          const existingColorActions = editing.actions
            .map((a, i) => ({ action: a, index: i }))
            .filter(({ action }) => colorTypes.has(action.type))
          const colorActions = ['SetTextColor', 'SetBorderColor', 'SetBackgroundColor'].map((type) => {
            const existing = existingColorActions.find(({ action }) => action.type === type)
            if (existing) return existing
            return { action: { type, values: colorDefaults[type] } as FilterAction, index: -1 }
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

          // Extract current style values for the label preview
          const getColorRgba = (type: string): string | undefined => {
            const a = colorActions.find(({ action }) => action.type === type)
            if (!a) return undefined
            const [r, g, b, alpha] = a.action.values.map(Number)
            return `rgba(${r ?? 0},${g ?? 0},${b ?? 0},${(alpha ?? 255) / 255})`
          }
          const textColorCss = getColorRgba('SetTextColor')
          const bgColorCss = getColorRgba('SetBackgroundColor')
          const borderColorCss = getColorRgba('SetBorderColor')
          const fontSize = fontSizeAction ? Number(fontSizeAction.action.values[0]) || 32 : 32

          return (
            <div className="flex flex-col gap-2">
              {/* Appearance: label preview + colors + font size */}
              {(colorActions.length > 0 || fontSizeAction) && (
                <div className="bg-black/25 rounded overflow-hidden">
                  {/* Label preview header */}
                  <div className="flex items-center px-3 py-[10px] h-[42px]">
                    <div className="flex-1 flex items-center justify-center">
                      <div
                        className="inline-flex items-center justify-center px-[6px] py-px rounded-sm origin-center"
                        style={{
                          background: bgColorCss ?? 'transparent',
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

                  {/* Color editors */}
                  {colorActions.length > 0 && (
                    <div className="flex gap-2 px-[10px] py-2">
                      {colorActions.map(({ action, index }) => (
                        <ColorActionEditor
                          key={action.type}
                          action={action}
                          onChange={(updated) => {
                            if (index === -1) {
                              addAction(updated)
                            } else {
                              updateAction(index, updated)
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
