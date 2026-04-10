import { CloseSmall } from '@icon-park/react'
import dustIcon from '../../assets/currency/thaumaturgic-dust.png'
import { chaosIcon } from '../../shared/icons'
import { IconGlow } from '../../shared/IconGlow'
import { ActiveFilter, FilterType } from './types'
import { ALL_FILTER_TYPES, FILTER_LABELS } from './constants'
import { scaleRange, formatDust, formatRatio } from './utils'

interface FilterRowProps {
  filter: ActiveFilter
  idx: number
  availableTypes: FilterType[]
  minValues: Record<Exclude<FilterType, 'name'>, number>
  maxValues: Record<Exclude<FilterType, 'name'>, number>
  divineRate: number
  mirrorRate: number
  onTypeChange: (idx: number, newType: FilterType) => void
  onUpdate: (idx: number, updates: Partial<ActiveFilter>) => void
  onRemove: (idx: number) => void
}

function formatFilterVal(type: FilterType, val: number, divineRate: number, mirrorRate: number): string {
  if (type === 'chaosValue') {
    const inMir = mirrorRate > 0 ? val / mirrorRate : 0
    const inDiv = divineRate > 0 ? val / divineRate : 0
    if (inMir >= 1) return `${inMir >= 10 ? Math.round(inMir) : inMir.toFixed(1)}m`
    if (inDiv >= 1) return `${inDiv >= 10 ? Math.round(inDiv) : inDiv.toFixed(1)}d`
    return val < 10 ? `${val.toFixed(1)}c` : `${Math.round(val)}c`
  }
  if (type === 'dustIlvl84') return formatDust(val)
  return formatRatio(val)
}

export function FilterRow({
  filter: f,
  idx,
  availableTypes,
  minValues,
  maxValues,
  divineRate,
  mirrorRate,
  onTypeChange,
  onUpdate,
  onRemove,
}: FilterRowProps): JSX.Element {
  const filterIcon = f.type === 'chaosValue' ? chaosIcon : dustIcon

  return (
    <div className="flex items-center gap-[6px]">
      <select
        value={f.type}
        onChange={(e) => onTypeChange(idx, e.target.value as FilterType)}
        className="shrink-0 text-[11px] h-[25px] leading-[25px] w-[128px] box-border cursor-pointer rounded"
        style={{ padding: '0 24px 0 8px' }}
      >
        {availableTypes.map((t) => (
          <option key={t} value={t}>
            {FILTER_LABELS[t]}
          </option>
        ))}
      </select>

      {f.type === 'name' ? (
        <input
          type="text"
          placeholder="Filter uniques by name"
          value={f.value}
          onChange={(e) => onUpdate(idx, { value: e.target.value })}
          className="flex-1 bg-black/25 border border-[rgba(80,80,110,0.3)] rounded-full px-[10px] text-[11px] text-text outline-none h-[25px] box-border bg-black/30"
        />
      ) : (
        <div className="flex-1 flex items-center gap-1 bg-black/30 rounded-full px-[6px] relative overflow-hidden h-[25px] box-border">
          {/* Left icon with glow */}
          <IconGlow
            src={filterIcon}
            size={14}
            blur={8}
            saturate={2.5}
            opacity={0.4}
            glowWidth={36}
            glowHeight={36}
            imgStyle={{ zIndex: 1 }}
          />
          <span className="text-[10px] font-mono text-accent font-semibold shrink-0 min-w-[26px] text-right">
            {formatFilterVal(
              f.type,
              scaleRange(
                f.min,
                minValues[f.type as Exclude<FilterType, 'name'>],
                maxValues[f.type as Exclude<FilterType, 'name'>],
                f.type,
              ),
              divineRate,
              mirrorRate,
            )}
          </span>
          <div
            className="flex-1 relative h-[18px]"
            onPointerDown={(e) => {
              // When thumbs overlap, route the click to the nearest one
              const rect = e.currentTarget.getBoundingClientRect()
              const pct = ((e.clientX - rect.left) / rect.width) * 1000
              const distMin = Math.abs(pct - f.min)
              const distMax = Math.abs(pct - f.max)
              const inputs = e.currentTarget.querySelectorAll('input')
              if (distMin <= distMax) {
                ;(inputs[0] as HTMLElement).style.zIndex = '4'
                ;(inputs[1] as HTMLElement).style.zIndex = '3'
              } else {
                ;(inputs[0] as HTMLElement).style.zIndex = '3'
                ;(inputs[1] as HTMLElement).style.zIndex = '4'
              }
            }}
          >
            <input
              type="range"
              min={0}
              max={1000}
              step={1}
              value={f.min}
              onChange={(e) => {
                const v = Number(e.target.value)
                onUpdate(idx, { min: Math.min(v, f.max - 10) })
              }}
              className="absolute inset-0 w-full pointer-events-none z-[3] range-thumb"
              style={{ background: 'transparent', height: '100%' }}
            />
            <input
              type="range"
              min={0}
              max={1000}
              step={1}
              value={f.max}
              onChange={(e) => {
                const v = Number(e.target.value)
                onUpdate(idx, { max: Math.max(v, f.min + 10) })
              }}
              className="absolute inset-0 w-full pointer-events-none z-[4] range-thumb"
              style={{ background: 'transparent', height: '100%' }}
            />
            <div className="absolute top-[7px] left-0 right-0 h-1 rounded-sm bg-white/[0.12]" />
            <div
              className="absolute top-[7px] h-1 rounded-sm bg-accent opacity-40"
              style={{ left: `${f.min / 10}%`, right: `${100 - f.max / 10}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-accent font-semibold shrink-0 min-w-[26px] text-left">
            {formatFilterVal(
              f.type,
              scaleRange(
                f.max,
                minValues[f.type as Exclude<FilterType, 'name'>],
                maxValues[f.type as Exclude<FilterType, 'name'>],
                f.type,
              ),
              divineRate,
              mirrorRate,
            )}
          </span>
          {/* Right icon with glow */}
          <IconGlow
            src={filterIcon}
            size={14}
            blur={8}
            saturate={2.5}
            opacity={0.4}
            glowWidth={36}
            glowHeight={36}
            imgStyle={{ zIndex: 1 }}
          />
        </div>
      )}

      <button
        onClick={() => onRemove(idx)}
        className="flex items-center justify-center w-5 h-5 shrink-0 rounded bg-white/[0.06] border-none cursor-pointer text-text-dim p-0 hover:bg-[rgba(239,83,80,0.2)] hover:text-white"
      >
        <CloseSmall size={14} theme="outline" fill="currentColor" className="flex" />
      </button>
    </div>
  )
}

interface EmptyFilterRowProps {
  onAdd: (type: FilterType) => void
}

export function EmptyFilterRow({ onAdd }: EmptyFilterRowProps): JSX.Element {
  return (
    <div className="flex items-center gap-[6px]">
      <select
        value=""
        onChange={(e) => {
          const t = e.target.value as FilterType
          if (t) onAdd(t)
        }}
        className="shrink-0 text-[11px] text-text h-[25px] leading-[25px] w-[128px] box-border cursor-pointer rounded"
        style={{ padding: '0 24px 0 8px' }}
      >
        <option value="" disabled hidden>
          Add Filter
        </option>
        {ALL_FILTER_TYPES.map((t) => (
          <option key={t} value={t}>
            {FILTER_LABELS[t]}
          </option>
        ))}
      </select>
      <div className="flex-1 bg-black/[0.15] border border-border rounded-full px-[10px] text-[11px] text-text-dim opacity-40 h-[25px] flex items-center box-border">
        Select a filter to begin...
      </div>
    </div>
  )
}
