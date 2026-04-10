import { useState, useEffect } from 'react'
import type { StackSizeBreakpoint } from '../../../../shared/types'
import { visColors } from './constants'
import { BoundaryControl } from './BoundaryControl'
import type { PendingThreshold } from './types'

/** Apply a boundary change and push adjacent boundaries to avoid collisions */
export function applyBoundaryChange(boundaries: number[], index: number, newValue: number, minValue: number): number[] {
  const updated = [...boundaries]
  updated[index] = newValue

  // Push subsequent boundaries up if they collide
  for (let i = index + 1; i < updated.length; i++) {
    if (updated[i] <= updated[i - 1]) {
      updated[i] = updated[i - 1] + 1
    } else break
  }

  // Push preceding boundaries down if they collide
  for (let i = index - 1; i >= 0; i--) {
    if (updated[i] >= updated[i + 1]) {
      updated[i] = Math.max(minValue, updated[i + 1] - 1)
    } else break
  }

  return updated
}

interface BreakpointEditorProps {
  breakpoints: StackSizeBreakpoint[]
  selectedBpIndex: number | null
  onSelectBp: (index: number | null) => void
  onPendingChange: (pending: PendingThreshold | null) => void
  label: string
  thresholdType: PendingThreshold['type']
  suffix?: string
  startValue?: number
  minBoundary?: number
}

export function BreakpointEditor({
  breakpoints,
  selectedBpIndex,
  onSelectBp,
  onPendingChange,
  label,
  thresholdType,
  suffix = '',
  startValue = 0,
  minBoundary = 1,
}: BreakpointEditorProps): JSX.Element {
  const origBoundaries = breakpoints.slice(1).map((bp) => bp.min)
  const [localBoundaries, setLocalBoundaries] = useState(origBoundaries)

  useEffect(() => {
    setLocalBoundaries(origBoundaries)
  }, [origBoundaries.join(',')])

  const handleLocalChange = (boundaryIndex: number, newValue: number): void => {
    if (newValue < minBoundary) return
    const prevBoundary = boundaryIndex > 0 ? localBoundaries[boundaryIndex - 1] : startValue
    if (newValue <= prevBoundary) return

    const updated = applyBoundaryChange(localBoundaries, boundaryIndex, newValue, minBoundary)
    setLocalBoundaries(updated)

    const oldValue = origBoundaries[boundaryIndex]
    if (newValue !== oldValue) {
      onPendingChange({ type: thresholdType, oldValue, newValue })
    } else {
      onPendingChange(null)
    }
  }

  return (
    <div className="px-3 py-[10px] bg-bg-card rounded">
      <div className="text-[11px] text-text-dim mb-2">{label}</div>

      <div className="relative">
        <div className="absolute left-0 right-0 top-3 h-[6px] flex rounded-[3px] overflow-hidden z-0">
          {breakpoints.map((bp, i) => {
            const vis = bp.activeMatch?.block.visibility ?? 'Hide'
            const color = visColors[vis] ?? 'var(--text-dim)'
            return <div key={i} className="flex-1 opacity-40" style={{ background: color }} />
          })}
        </div>

        <div className="flex items-start gap-0 relative z-[1]">
          {breakpoints.map((_bp, i) => {
            const isLast = i === breakpoints.length - 1
            const isSelected = selectedBpIndex === i
            const localMin = i === 0 ? startValue : localBoundaries[i - 1]
            const localMax = isLast ? Infinity : localBoundaries[i] - 1
            const rangeLabel =
              localMax === Infinity
                ? `${localMin}${suffix}+`
                : localMin === localMax
                  ? `${localMin}${suffix}`
                  : `${localMin}-${localMax}${suffix}`

            return (
              <div key={i} className="contents">
                <div className="flex-1 flex justify-center pt-[30px] px-1 pb-1 min-w-0">
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault()
                      onSelectBp(i)
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'rgba(0,0,0,0.35)'
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.background = 'rgba(0,0,0,0.25)'
                    }}
                    className="px-[10px] py-1 rounded cursor-pointer select-none transition-[background,box-shadow] duration-[120ms]"
                    style={{
                      background: isSelected ? 'var(--accent)' : 'rgba(0,0,0,0.25)',
                      boxShadow: isSelected ? '0 1px 4px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.25)',
                    }}
                  >
                    <span
                      className="text-[12px] font-semibold font-mono whitespace-nowrap leading-none block"
                      style={{
                        color: isSelected ? 'var(--bg-solid)' : 'var(--text-dim)',
                      }}
                    >
                      {rangeLabel}
                    </span>
                  </div>
                </div>

                {!isLast && (
                  <BoundaryControl
                    value={localBoundaries[i]}
                    min={i === 0 ? minBoundary : localBoundaries[i - 1] + 1}
                    onChange={(val) => handleLocalChange(i, val)}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
