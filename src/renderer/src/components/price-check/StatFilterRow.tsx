import { StepInput } from './StepInput'
import type { StatFilter } from './types'

export function StatFilterRow({
  f,
  i,
  rowIdx,
  toggleFilter,
  updateFilterMin,
  updateFilterMax,
}: {
  f: StatFilter
  i: number
  rowIdx: number
  toggleFilter: (i: number) => void
  updateFilterMin: (i: number, val: string) => void
  updateFilterMax: (i: number, val: string) => void
}): JSX.Element {
  return (
    <div
      className="flex items-center gap-2 px-3 py-[2px] text-xs"
      style={{
        opacity: f.enabled ? 1 : 0.4,
        background: rowIdx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
      }}
    >
      <div
        onClick={(e) => {
          e.stopPropagation()
          toggleFilter(i)
        }}
        className="w-4 h-4 shrink-0 rounded-[3px] cursor-pointer flex items-center justify-center transition-[background] duration-100"
        style={{
          background: f.enabled ? 'var(--accent)' : 'rgba(255,255,255,0.14)',
        }}
      >
        {f.enabled && <span className="text-[11px] text-[#171821] font-bold leading-none">&#10003;</span>}
      </div>
      <span
        onClick={() => toggleFilter(i)}
        className="flex-1 text-[11px] cursor-pointer select-none"
        style={{
          color:
            f.type === 'heist'
              ? '#ffcc88'
              : f.type === 'gem'
                ? '#a8e6cf'
                : f.type === 'weapon'
                  ? '#88ccff'
                  : f.type === 'defence'
                    ? '#88ccff'
                    : f.type === 'pseudo'
                      ? '#88ccff'
                      : f.type === 'implicit'
                        ? '#af8aff'
                        : f.type === 'crafted'
                          ? '#b4b4ff'
                          : f.type === 'fractured'
                            ? 'var(--accent)'
                            : f.type === 'imbued' || f.type === 'enchant'
                              ? '#a8e6cf'
                              : f.type === 'map'
                                ? '#80cbc4'
                                : 'var(--text)',
          fontWeight: ['pseudo', 'defence'].includes(f.type) ? 600 : 400,
        }}
      >
        {f.text}
      </span>
      <StepInput value={f.min} placeholder="min" onChange={(val) => updateFilterMin(i, val)} />
      <span className="text-text-dim text-[10px]">-</span>
      <StepInput value={f.max} placeholder="max" onChange={(val) => updateFilterMax(i, val)} />
    </div>
  )
}
