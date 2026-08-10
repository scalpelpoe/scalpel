import { useEffect, useMemo, useState } from 'react'
import type { FilterAction, FilterBlock } from '@shared/types'
import {
  ALERT_SOUNDS,
  BEAM_COLORS,
  MINIMAP_COLORS,
  MINIMAP_SHAPES,
  MINIMAP_SIZES,
  POE_COLOR_HEX,
} from '@shared/data/filter/filter-actions'
import { ColorActionEditor } from '@renderer/features/filter/filter-block-editor/ColorActionEditor'

function actionOf(block: FilterBlock, type: FilterAction['type'], fallback: string[] = []): FilterAction {
  return block.actions.find((a) => a.type === type) ?? { type, values: fallback }
}

function upsertAction(block: FilterBlock, action: FilterAction): FilterBlock {
  const actions = [...block.actions]
  const idx = actions.findIndex((a) => a.type === action.type)
  if (action.values.length === 0) {
    if (idx >= 0) actions.splice(idx, 1)
  } else if (idx >= 0) {
    actions[idx] = action
  } else {
    actions.push(action)
  }
  // Alert sound types are mutually exclusive
  if (action.type === 'PlayAlertSound' || action.type === 'CustomAlertSound') {
    const drop = action.type === 'PlayAlertSound' ? 'CustomAlertSound' : 'PlayAlertSound'
    const dropIdx = actions.findIndex((a) => a.type === drop)
    if (dropIdx >= 0) actions.splice(dropIdx, 1)
  }
  return { ...block, actions }
}

interface Props {
  blockIndex: number
  tierLabel: string
  onClose: () => void
  onSaved: () => void
}

export function TierStyleEditor({ blockIndex, tierLabel, onClose, onSaved }: Props): JSX.Element {
  const [block, setBlock] = useState<FilterBlock | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void window.api.getFilterBlock(blockIndex).then((r) => {
      if (!r.ok || !r.block) {
        setError(r.error ?? 'Could not load tier')
        return
      }
      setBlock(structuredClone(r.block))
    })
  }, [blockIndex])

  const text = useMemo(() => (block ? actionOf(block, 'SetTextColor', ['200', '200', '200', '255']) : null), [block])
  const border = useMemo(
    () => (block ? actionOf(block, 'SetBorderColor', ['100', '100', '100', '255']) : null),
    [block],
  )
  const bg = useMemo(() => (block ? actionOf(block, 'SetBackgroundColor', ['0', '0', '0', '180']) : null), [block])
  const font = useMemo(() => (block ? actionOf(block, 'SetFontSize', ['32']) : null), [block])
  const alert = useMemo(() => {
    if (!block) return null
    const custom = block.actions.find((a) => a.type === 'CustomAlertSound')
    if (custom) return custom
    return actionOf(block, 'PlayAlertSound')
  }, [block])
  const beam = useMemo(() => (block ? actionOf(block, 'PlayEffect') : null), [block])
  const minimap = useMemo(() => (block ? actionOf(block, 'MinimapIcon') : null), [block])

  const textUnset = Boolean(block && !block.actions.some((a) => a.type === 'SetTextColor'))
  const borderUnset = Boolean(block && !block.actions.some((a) => a.type === 'SetBorderColor'))
  const bgUnset = Boolean(block && !block.actions.some((a) => a.type === 'SetBackgroundColor'))

  const save = async (): Promise<void> => {
    if (!block) return
    setSaving(true)
    setError(null)
    try {
      const result = await window.api.saveBlockEdit(blockIndex, block)
      if (!result.ok) {
        setError(result.error ?? 'Save failed')
        return
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!block) {
    return <div style={{ padding: 12, color: '#9a9aab', fontSize: 12 }}>{error ?? 'Loading style…'}</div>
  }

  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: 8,
        background: '#0a0b10',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#f0e6d2' }}>Style — {tierLabel}</div>
        <button type="button" onClick={onClose} style={{ fontSize: 11 }}>
          Close
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {text && (
          <div>
            <div style={{ fontSize: 10, color: '#9a9aab', marginBottom: 4 }}>Text</div>
            <ColorActionEditor action={text} onChange={(a) => setBlock(upsertAction(block, a))} unset={textUnset} />
          </div>
        )}
        {border && (
          <div>
            <div style={{ fontSize: 10, color: '#9a9aab', marginBottom: 4 }}>Border</div>
            <ColorActionEditor action={border} onChange={(a) => setBlock(upsertAction(block, a))} unset={borderUnset} />
          </div>
        )}
        {bg && (
          <div>
            <div style={{ fontSize: 10, color: '#9a9aab', marginBottom: 4 }}>Background</div>
            <ColorActionEditor action={bg} onChange={(a) => setBlock(upsertAction(block, a))} unset={bgUnset} />
          </div>
        )}
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#9a9aab' }}>
        Font size
        <input
          type="number"
          min={18}
          max={45}
          value={Number(font?.values[0] ?? 32)}
          onChange={(e) =>
            setBlock(
              upsertAction(block, {
                type: 'SetFontSize',
                values: [String(Math.max(18, Math.min(45, Number(e.target.value) || 32)))],
              }),
            )
          }
          style={{
            background: '#12131a',
            color: '#f0e6d2',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 6,
            padding: '6px 8px',
            width: 80,
          }}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#9a9aab' }}>
        Alert sound
        <select
          value={
            alert?.type === 'CustomAlertSound'
              ? `custom:${alert.values[0] ?? ''}`
              : alert && alert.values.length > 0
                ? alert.values[0]
                : '__none__'
          }
          onChange={(e) => {
            const val = e.target.value
            if (val === '__none__') setBlock(upsertAction(block, { type: 'PlayAlertSound', values: [] }))
            else if (val.startsWith('custom:'))
              setBlock(upsertAction(block, { type: 'CustomAlertSound', values: [val.slice(7), '300'] }))
            else setBlock(upsertAction(block, { type: 'PlayAlertSound', values: [val, '300'] }))
          }}
          style={{
            background: '#12131a',
            color: '#f0e6d2',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 6,
            padding: '6px 8px',
          }}
        >
          <option value="__none__">None</option>
          {ALERT_SOUNDS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <div>
        <div style={{ fontSize: 10, color: '#9a9aab', marginBottom: 4 }}>Beam</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            onClick={() => setBlock(upsertAction(block, { type: 'PlayEffect', values: [] }))}
            style={{
              fontSize: 10,
              background: !beam || beam.values.length === 0 ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
              color: !beam || beam.values.length === 0 ? '#171821' : '#f0e6d2',
            }}
          >
            None
          </button>
          {BEAM_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => setBlock(upsertAction(block, { type: 'PlayEffect', values: [c] }))}
              style={{
                width: 22,
                height: 22,
                padding: 0,
                background: POE_COLOR_HEX[c],
                border: beam?.values[0] === c ? '2px solid #fff' : '2px solid transparent',
              }}
            />
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 10, color: '#9a9aab', marginBottom: 4 }}>Minimap</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setBlock(upsertAction(block, { type: 'MinimapIcon', values: [] }))}
            style={{ fontSize: 10 }}
          >
            None
          </button>
          <select
            value={minimap?.values[0] ?? '0'}
            disabled={!minimap || minimap.values.length === 0}
            onChange={(e) =>
              setBlock(
                upsertAction(block, {
                  type: 'MinimapIcon',
                  values: [e.target.value, minimap?.values[1] ?? 'White', minimap?.values[2] ?? 'Circle'],
                }),
              )
            }
            style={{
              background: '#12131a',
              color: '#f0e6d2',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 4,
            }}
          >
            {MINIMAP_SIZES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={minimap?.values[1] ?? 'White'}
            disabled={!minimap || minimap.values.length === 0}
            onChange={(e) =>
              setBlock(
                upsertAction(block, {
                  type: 'MinimapIcon',
                  values: [minimap?.values[0] ?? '0', e.target.value, minimap?.values[2] ?? 'Circle'],
                }),
              )
            }
            style={{
              background: '#12131a',
              color: '#f0e6d2',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 4,
            }}
          >
            {MINIMAP_COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={minimap?.values[2] ?? 'Circle'}
            disabled={!minimap || minimap.values.length === 0}
            onChange={(e) =>
              setBlock(
                upsertAction(block, {
                  type: 'MinimapIcon',
                  values: [minimap?.values[0] ?? '0', minimap?.values[1] ?? 'White', e.target.value],
                }),
              )
            }
            style={{
              background: '#12131a',
              color: '#f0e6d2',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 4,
            }}
          >
            {MINIMAP_SHAPES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() =>
              setBlock(
                upsertAction(block, {
                  type: 'MinimapIcon',
                  values: [minimap?.values[0] ?? '0', minimap?.values[1] ?? 'White', minimap?.values[2] ?? 'Circle'],
                }),
              )
            }
            style={{ fontSize: 10 }}
          >
            Enable
          </button>
        </div>
      </div>

      {error && <div style={{ color: '#f87171', fontSize: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onClose} style={{ fontSize: 12 }}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={saving}
          onClick={() => void save()}
          style={{ fontSize: 12 }}
        >
          {saving ? 'Saving…' : 'Save style'}
        </button>
      </div>
    </div>
  )
}
