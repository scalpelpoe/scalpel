import { Down, Right } from '@icon-park/react'
import { InfoChip } from '../../shared/PriceChip'
import type { MapMod, Danger } from '../../../../shared/data/regex/map-mods'
import { TAB_COLORS, formatModText } from './mapmods-helpers'

export interface ModGroup {
  danger: Danger
  mods: MapMod[]
  label: string
  color: string
  /** Stable key for collapse-state lookup. */
  key: string
}

interface ModListProps {
  /** Pre-grouped + sorted mod groups. MapMods computes this based on the active tab,
   *  search query, and nightmare toggle. */
  grouped: ModGroup[]
  /** Mods currently checked in the active tab. */
  selected: Set<number>
  /** Group keys that are collapsed in the active tab. */
  collapsed: Set<string>
  /** Which tab is active -- drives checkbox / highlight color. */
  tab: 'avoid' | 'want'
  toggle: (id: number) => void
  toggleCollapse: (key: string) => void
}

/** The checkbox list of map mods underneath the Avoid / Want tabs. Groups by danger
 *  with sticky headers + collapse state; selected rows tint according to tab. */
export function ModList({ grouped, selected, collapsed, tab, toggle, toggleCollapse }: ModListProps): JSX.Element {
  const tabColor = tab === 'avoid' ? TAB_COLORS.avoid : TAB_COLORS.want
  const selectedTint = tab === 'avoid' ? 'rgba(239,83,80,0.08)' : 'rgba(129,199,132,0.08)'

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
                return (
                  <div
                    key={m.id}
                    onClick={() => toggle(m.id)}
                    className="flex items-center gap-2 px-3 py-[4px] cursor-pointer select-none transition-colors"
                    style={{
                      background: isSelected ? selectedTint : mi % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                    }}
                  >
                    <div
                      className="w-[14px] h-[14px] shrink-0 rounded-[3px] flex items-center justify-center transition-[background] duration-100"
                      style={{ background: isSelected ? tabColor : 'rgba(255,255,255,0.1)' }}
                    >
                      {isSelected && (
                        <span className="text-[10px] text-[#171821] font-bold leading-none">&#10003;</span>
                      )}
                    </div>
                    <span
                      className="text-[11px] flex-1"
                      style={{ color: isSelected ? 'var(--text)' : 'var(--text-dim)' }}
                    >
                      {formatModText(m.text)}
                    </span>
                    {m.nightmare && (
                      <span className="text-[8px] font-semibold shrink-0" style={{ color: TAB_COLORS.avoid }}>
                        NM
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
