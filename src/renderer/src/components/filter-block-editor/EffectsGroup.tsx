import { useEffect, useRef, useState } from 'react'
import type { FilterAction } from '../../../../shared/types'
import {
  ALERT_SOUNDS,
  BEAM_COLORS,
  MINIMAP_SIZES,
  MINIMAP_COLORS,
  MINIMAP_SHAPES,
  POE_COLOR_HEX,
  getShapeIconUrl,
  getMinimapIconUrl,
} from '../../../../shared/data/filter/filter-actions'
import { Toggle } from '../Toggle'
import { Down, Right } from '@icon-park/react'
import { IP } from './constants'

export function ActionBox({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="bg-black/25 rounded px-[10px] py-2">
      <div className="text-[9px] text-text-dim uppercase tracking-[0.5px] mb-[6px]">{title}</div>
      {children}
    </div>
  )
}

export function ActionEditor({
  action,
  onChange,
}: {
  action: FilterAction
  onChange: (a: FilterAction) => void
}): JSX.Element {
  const friendlyNames: Record<string, string> = {
    CustomAlertSound: 'Custom Sound',
    CustomAlertSoundOptional: 'Custom Sound',
    DisableDropSound: 'Disable Drop Sound',
    EnableDropSound: 'Enable Drop Sound',
    DisableDropSoundIfAlertSound: 'Disable Drop Sound (if alert)',
    EnableDropSoundIfAlertSound: 'Enable Drop Sound (if alert)',
  }

  return (
    <div className="flex gap-2 items-center">
      <span className="text-[11px] text-text-dim min-w-[100px]">{friendlyNames[action.type] ?? action.type}</span>
      <input
        type="text"
        value={action.values.join(' ')}
        className="flex-1 bg-black/30"
        onChange={(e) => onChange({ ...action, values: [e.target.value] })}
      />
    </div>
  )
}

function AlertSoundEditor({
  action,
  onChange,
}: {
  action: FilterAction
  onChange: (a: FilterAction) => void
}): JSX.Element {
  const isNone = action.values.length === 0
  const isCustom = action.type === 'CustomAlertSound' || action.type === 'CustomAlertSoundOptional'
  const [soundFiles, setSoundFiles] = useState<string[]>([])
  const filterDirRef = useRef('')

  useEffect(() => {
    window.api.getSettings().then((s) => {
      if (s.filterDir) {
        filterDirRef.current = s.filterDir
        window.api.scanSoundFiles(s.filterDir).then(setSoundFiles)
      }
    })
  }, [])

  const volume = action.values[1] ?? '300'
  // Unified value: built-in sounds use their ID, custom sounds use "custom:filename"
  const currentValue = isNone ? '__none__' : isCustom ? `custom:${action.values[0] ?? ''}` : (action.values[0] ?? '1')

  const playBuiltinSound = (id: string): void => {
    const paddedId = id.padStart(2, '0')
    const soundUrl = new URL(`../../assets/sounds/AlertSound_${paddedId}.ogg`, import.meta.url).href
    const audio = new Audio(soundUrl)
    audio.volume = 0.4
    audio.play().catch(() => {})
  }

  const playCustomSound = (file: string): void => {
    if (!file || !filterDirRef.current) return
    window.api.getSoundDataUrl(filterDirRef.current, file).then((url) => {
      if (!url) return
      const audio = new Audio(url)
      audio.volume = 0.4
      audio.play().catch(() => {})
    })
  }

  const handleChange = (val: string): void => {
    if (val === '__none__') {
      onChange({ ...action, values: [] })
    } else if (val.startsWith('custom:')) {
      const file = val.slice(7)
      onChange({ type: 'CustomAlertSound', values: [file, volume] })
      playCustomSound(file)
    } else {
      onChange({ type: 'PlayAlertSound', values: [val, volume] })
      playBuiltinSound(val)
    }
  }

  const playPreview = (): void => {
    if (isCustom) playCustomSound(action.values[0] ?? '')
    else playBuiltinSound(action.values[0] ?? '1')
  }

  return (
    <div className="flex gap-2 items-center">
      <select value={currentValue} onChange={(e) => handleChange(e.target.value)} className="flex-1">
        <option value="__none__">None</option>
        <optgroup label="Built-in">
          {ALERT_SOUNDS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </optgroup>
        {soundFiles.length > 0 && (
          <optgroup label="Custom Sounds">
            {soundFiles.map((f) => (
              <option key={f} value={`custom:${f}`}>
                {f}
              </option>
            ))}
          </optgroup>
        )}
        {isCustom && action.values[0] && !soundFiles.includes(action.values[0]) && (
          <option value={currentValue}>{action.values[0]} (missing)</option>
        )}
      </select>
      {!isNone && (
        <button
          onClick={playPreview}
          title="Preview sound"
          className="w-[30px] h-[30px] shrink-0 text-[10px] cursor-pointer bg-bg-hover border-none rounded text-text flex items-center justify-center"
        >
          &#9654;
        </button>
      )}
    </div>
  )
}

function PlayEffectEditor({
  action,
  onChange,
}: {
  action: FilterAction
  onChange: (a: FilterAction) => void
}): JSX.Element {
  const isNone = action.values.length === 0
  const color = action.values[0] ?? ''
  const isTemp = action.values[1]?.toLowerCase() === 'temp'

  return (
    <div className="flex gap-2 items-center">
      <div className="flex gap-[3px] flex-1">
        {/* None option */}
        <div
          onClick={() => onChange({ ...action, values: [] })}
          title="None"
          className="flex-1 h-6 rounded-[3px] bg-white/5 cursor-pointer flex items-center justify-center transition-[opacity,border-color] duration-100"
          style={{
            border: isNone ? '2px solid var(--text)' : '2px solid transparent',
            opacity: isNone ? 1 : 0.5,
          }}
        >
          <span className="text-[8px] text-text-dim uppercase tracking-[0.5px]">None</span>
        </div>
        {BEAM_COLORS.map((c) => (
          <div
            key={c}
            onClick={() => onChange({ ...action, values: isTemp ? [c, 'Temp'] : [c] })}
            title={c}
            className="flex-1 h-6 rounded-[3px] cursor-pointer transition-[opacity,border-color] duration-100"
            style={{
              background: POE_COLOR_HEX[c],
              border: !isNone && color === c ? '2px solid var(--text)' : '2px solid transparent',
              opacity: !isNone && color === c ? 1 : 0.5,
            }}
          />
        ))}
      </div>
      <div className="flex items-center gap-[5px] select-none" style={{ opacity: isNone ? 0.3 : 1 }}>
        <Toggle
          checked={isTemp}
          disabled={isNone}
          onChange={(val) => onChange({ ...action, values: val ? [color || 'Red', 'Temp'] : [color || 'Red'] })}
        />
        <span className="text-[10px] text-text-dim">Temp</span>
      </div>
    </div>
  )
}

function MinimapIconEditor({
  action,
  onChange,
}: {
  action: FilterAction
  onChange: (a: FilterAction) => void
}): JSX.Element {
  const isNone = action.values.length === 0
  const sizeVal = action.values[0] ?? '0'
  const colorVal = action.values[1] ?? 'Red'
  const shapeVal = action.values[2] ?? 'Circle'
  const previewUrl = getMinimapIconUrl(colorVal, shapeVal)

  const update = (size: string, color: string, shape: string): void => {
    onChange({ ...action, values: [size, color, shape] })
  }

  return (
    <div className="flex flex-col gap-[6px]">
      {/* Preview + size + None toggle */}
      <div className="flex gap-2 items-center">
        {!isNone && previewUrl && (
          <img
            src={previewUrl}
            alt={`${colorVal} ${shapeVal}`}
            className="w-6 h-6"
            style={{ imageRendering: 'auto' }}
          />
        )}
        <div className="flex gap-[3px] ml-auto">
          <button
            onClick={() => onChange({ ...action, values: [] })}
            className="px-2 py-[2px] text-[10px]"
            style={{
              color: isNone ? '#171821' : 'var(--text-dim)',
              background: isNone ? 'var(--text)' : 'rgba(255,255,255,0.08)',
            }}
          >
            None
          </button>
          {MINIMAP_SIZES.map((s) => (
            <button
              key={s.id}
              onClick={() => update(s.id, colorVal, shapeVal)}
              className="px-2 py-[2px] text-[10px]"
              style={{
                color: !isNone && sizeVal === s.id ? '#171821' : 'var(--text-dim)',
                background: !isNone && sizeVal === s.id ? 'var(--accent)' : 'rgba(255,255,255,0.08)',
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>
      {/* Color row */}
      <div
        className="flex gap-[3px] transition-opacity duration-150"
        style={{ opacity: isNone ? 0.3 : 1, pointerEvents: isNone ? 'none' : undefined }}
      >
        {MINIMAP_COLORS.map((c) => (
          <div
            key={c}
            onClick={() => update(sizeVal, c, shapeVal)}
            title={c}
            className="flex-1 h-4 rounded-sm cursor-pointer transition-opacity duration-100"
            style={{
              background: POE_COLOR_HEX[c],
              border: colorVal === c ? '2px solid var(--text)' : '2px solid transparent',
              opacity: colorVal === c ? 1 : 0.45,
            }}
          />
        ))}
      </div>
      {/* Shape grid with real icons */}
      <div
        className="flex gap-1 flex-wrap transition-opacity duration-150"
        style={{ opacity: isNone ? 0.3 : 1, pointerEvents: isNone ? 'none' : undefined }}
      >
        {MINIMAP_SHAPES.map((s) => {
          const isSelected = shapeVal === s.id
          const iconUrl = isSelected ? getMinimapIconUrl(colorVal, s.id) : getShapeIconUrl(s.id)
          return (
            <div
              key={s.id}
              onClick={() => update(sizeVal, colorVal, s.id)}
              title={s.name}
              className="flex items-center justify-center w-[30px] h-[30px] rounded cursor-pointer transition-[border-color] duration-100"
              style={{
                border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: isSelected ? 'var(--accent-dim)' : 'transparent',
                opacity: isSelected ? 1 : 0.6,
              }}
            >
              {iconUrl ? (
                <img src={iconUrl} alt={s.name} className="w-5 h-5" style={{ imageRendering: 'auto' }} />
              ) : (
                <span className="text-[9px] text-text-dim">{s.name}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function EffectsGroup({
  iconAction,
  effectAction,
  soundAction,
  updateAction,
  addAction,
}: {
  iconAction?: { action: FilterAction; index: number }
  effectAction?: { action: FilterAction; index: number }
  soundAction?: { action: FilterAction; index: number }
  updateAction: (index: number, action: FilterAction) => void
  addAction: (action: FilterAction) => number
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)

  // Count how many effects are active (have non-empty values)
  const hasIcon = iconAction && iconAction.action.values.length > 0
  const hasBeam = effectAction && effectAction.action.values.length > 0
  const hasSound = soundAction && soundAction.action.values.length > 0
  const _activeCount = [hasIcon, hasBeam, hasSound].filter(Boolean).length
  const _summary = [hasIcon && 'minimap', hasBeam && 'beam', hasSound && 'sound'].filter(Boolean).join(', ')

  return (
    <div>
      <div
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-[6px] px-[10px] py-1 cursor-pointer select-none"
      >
        <span className="flex -mt-px">{expanded ? <Down size={12} {...IP} /> : <Right size={12} {...IP} />}</span>
        <span className="text-[11px] text-text-dim">Effects (Minimap, Beam, Sound)</span>
      </div>
      {expanded && (
        <div className="flex flex-col gap-2 px-[10px] pt-[6px] pb-[10px]">
          <ActionBox title="Minimap Icon">
            <MinimapIconEditor
              action={iconAction?.action ?? { type: 'MinimapIcon', values: [] }}
              onChange={(updated) => {
                if (iconAction) {
                  updateAction(iconAction.index, updated)
                } else {
                  addAction(updated)
                }
              }}
            />
          </ActionBox>
          <ActionBox title="Beam Effect">
            <PlayEffectEditor
              action={effectAction?.action ?? { type: 'PlayEffect', values: [] }}
              onChange={(updated) => {
                if (effectAction) {
                  updateAction(effectAction.index, updated)
                } else {
                  addAction(updated)
                }
              }}
            />
          </ActionBox>
          <ActionBox title="Alert Sound">
            <AlertSoundEditor
              action={soundAction?.action ?? { type: 'PlayAlertSound', values: [] }}
              onChange={(updated) => {
                if (soundAction) {
                  updateAction(soundAction.index, updated)
                } else {
                  addAction(updated)
                }
              }}
            />
          </ActionBox>
        </div>
      )}
    </div>
  )
}
