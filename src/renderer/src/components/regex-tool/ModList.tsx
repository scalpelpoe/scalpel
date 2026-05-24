import { Down, Right } from '@icon-park/react'
import { InfoChip } from '../../shared/InfoChip'
import { formatModText, RegexCheckbox } from './mapmods-helpers'
import { ScrubInput } from './ScrubInput'
import { zebraRowBg } from '../../shared/utils'

export interface ModListMod {
  id: string | number
  text: string
  /** Optional badge label rendered on the right (e.g. "NM" for nightmare on maps). */
  badge?: { label: string; color: string }
}

export interface ModGroup {
  mods: ModListMod[]
  label: string
  color: string
  /** Stable key for collapse-state lookup. */
  key: string
}

interface ModListProps {
  /** Pre-grouped + sorted mod groups. */
  grouped: ModGroup[]
  /** Mods currently checked. */
  selected: Set<string | number>
  /** Group keys that are collapsed. */
  collapsed: Set<string>
  /** Color used for checkbox fill when selected. */
  tabColor: string
  /** Row background tint when selected. */
  selectedTint: string
  toggle: (id: string | number) => void
  toggleCollapse: (key: string) => void
  /** Optional per-mod value support (waystones). When omitted, no value inputs render. */
  values?: Record<string | number, number>
  /** Returns the placeholder hint (e.g. "20-40") for a ranged mod, or undefined when
   *  the mod has no numeric range and should show no input. */
  rangeHint?: (id: string | number) => string | undefined
  /** Called when the user edits a row's value; null clears it. */
  onValueChange?: (id: string | number, value: number | null) => void
}

/** The checkbox list of mods underneath a tab. Groups by category with sticky headers +
 *  collapse state; selected rows tint according to the caller-provided selectedTint. */
export function ModList({
  grouped,
  selected,
  collapsed,
  tabColor,
  selectedTint,
  toggle,
  toggleCollapse,
  values,
  rangeHint,
  onValueChange,
}: ModListProps): JSX.Element {
  return (
    <div className="flex-1 overflow-y-auto bg-bg-card">
      {grouped.map(({ mods, label, color, key }) => {
        const isCollapsed = collapsed.has(key)
        const selectedInGroup = mods.filter((m) => selected.has(m.id)).length
        return (
          <div key={key}>
            <div
              className="flex items-center gap-2 px-3 py-[8px] sticky-group-header cursor-pointer select-none sticky top-0 z-[1]"
              style={{ height: 39, boxSizing: 'border-box' }}
              onClick={() => toggleCollapse(key)}
            >
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
              <span className="text-[10px] uppercase tracking-wider font-bold flex-1" style={{ color }}>
                {label}
              </span>
              {selectedInGroup > 0 && (
                <InfoChip color={color}>
                  <span className="font-bold">{selectedInGroup}</span>
                </InfoChip>
              )}
              {isCollapsed ? (
                <Right size={12} theme="two-tone" fill={['currentColor', 'currentColor']} className="text-text-dim" />
              ) : (
                <Down size={12} theme="two-tone" fill={['currentColor', 'currentColor']} className="text-text-dim" />
              )}
            </div>
            {!isCollapsed &&
              mods.map((m, mi) => {
                const isSelected = selected.has(m.id)
                const valueHint = rangeHint?.(m.id)
                return (
                  <div
                    key={m.id}
                    onClick={() => toggle(m.id)}
                    className="flex items-center gap-2 px-3 py-[4px] cursor-pointer select-none transition-colors"
                    style={{
                      background: isSelected ? selectedTint : zebraRowBg(mi),
                    }}
                  >
                    <RegexCheckbox checked={isSelected} color={tabColor} />
                    <span
                      className="text-[11px] flex-1"
                      style={{ color: isSelected ? 'var(--text)' : 'var(--text-dim)' }}
                    >
                      {formatModText(m.text)}
                    </span>
                    {isSelected && onValueChange && valueHint && (
                      // Wrapper stops the scrubber's mousedown/click from bubbling to the
                      // row's toggle handler, so editing a value doesn't deselect the mod.
                      <span
                        className="shrink-0"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <ScrubInput
                          value={values?.[m.id] ?? null}
                          placeholder={valueHint}
                          onChange={(v) => onValueChange(m.id, v)}
                        />
                      </span>
                    )}
                    {m.badge && (
                      <span className="text-[8px] font-semibold shrink-0" style={{ color: m.badge.color }}>
                        {m.badge.label}
                      </span>
                    )}
                  </div>
                )
              })}
          </div>
        )
      })}
    </div>
  )
}
