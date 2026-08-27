import { useState } from 'react'
import type { LauncherItem, LauncherSliceMode } from '@shared/launcher'
import type { LauncherCategory } from '@shared/launcher-categories'
import { groupLauncherItems } from '@shared/launcher-categories'
import appIcon from '../../../../resources/icon.png'
import {
  CATEGORY_COLORS,
  LAUNCHER_CATEGORY_LABELS,
  categoryHubAngle,
  polarPoint,
  twoTierChildSlots,
} from './category-layout'
import {
  LauncherIcon,
  chipLauncherLabel,
  isPluginItem,
  resolveChipDisplay,
  shortLauncherLabel,
  useLauncherActions,
  useLauncherEscape,
} from './shared'

const VIEW = 400
const CENTER = VIEW / 2
const HUB_R = 118
const RING_R = 148
const HUB_CHIP = 52
const CHIP = 44

export function TwoTierMenu({
  items,
  sliceMode = 'icons',
}: {
  items: LauncherItem[]
  sliceMode?: LauncherSliceMode
}): JSX.Element {
  const [expandedCategory, setExpandedCategory] = useState<LauncherCategory | null>(null)
  const [hoveredChild, setHoveredChild] = useState<number | null>(null)
  const { close, run } = useLauncherActions()
  useLauncherEscape(close)

  const groups = groupLauncherItems(items)
  const dense = items.length > 8
  const expandedGroup = expandedCategory ? groups.find((g) => g.category === expandedCategory) : null
  const childSlots = expandedCategory ? twoTierChildSlots(items, expandedCategory, { x: CENTER, y: CENTER }) : []
  const activeChild = expandedGroup && hoveredChild !== null ? expandedGroup.items[hoveredChild] : null

  const toggleCategory = (category: LauncherCategory): void => {
    setExpandedCategory((prev) => (prev === category ? null : category))
    setHoveredChild(null)
  }

  return (
    <div
      className="launcher-root launcher-twotier-style relative w-full h-full select-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <svg
        className="launcher-wheel absolute inset-0 w-full h-full pointer-events-none"
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        aria-hidden
      >
        <circle cx={CENTER} cy={CENTER} r={RING_R + 4} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
        {!expandedCategory && (
          <circle cx={CENTER} cy={CENTER} r={HUB_R + 4} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
        )}
      </svg>

      {!expandedCategory &&
        groups.map((group, gi) => {
          const angle = categoryHubAngle(gi, groups.length)
          const { x, y } = polarPoint(CENTER, CENTER, angle, HUB_R)
          const colors = CATEGORY_COLORS[group.category]
          return (
            <button
              key={group.category}
              type="button"
              aria-label={`${LAUNCHER_CATEGORY_LABELS[group.category]}, ${group.items.length} tools`}
              className="launcher-twotier-hub absolute flex flex-col items-center justify-center gap-0.5 border-0 cursor-pointer transition-[transform,box-shadow] duration-100"
              style={{
                left: x,
                top: y,
                width: HUB_CHIP,
                height: HUB_CHIP,
                transform: 'translate(-50%, -50%)',
                background: colors.fill,
                outlineColor: colors.stroke,
              }}
              onClick={() => toggleCategory(group.category)}
            >
              <span className="launcher-twotier-hub-label" style={{ color: colors.label }}>
                {LAUNCHER_CATEGORY_LABELS[group.category].split(' ')[0]}
              </span>
              <span className="launcher-twotier-hub-count">{group.items.length}</span>
            </button>
          )
        })}

      {expandedCategory &&
        childSlots.map(({ item, x, y, index }) => {
          const hot = hoveredChild === index
          const display = resolveChipDisplay(sliceMode, item, dense)
          return (
            <button
              key={item.action}
              type="button"
              aria-label={item.label}
              className={`launcher-hub-chip absolute flex items-center justify-center border-0 cursor-pointer transition-[transform] duration-100 ${
                hot ? 'launcher-hub-chip--hot' : ''
              }`}
              style={{
                left: x,
                top: y,
                width: CHIP,
                height: CHIP,
                transform: `translate(-50%, -50%)${hot ? ' scale(1.08)' : ''}`,
              }}
              onMouseEnter={() => setHoveredChild(index)}
              onMouseLeave={() => setHoveredChild(null)}
              onClick={() => run(item.action)}
            >
              {display === 'icon' && item.icon ? (
                <LauncherIcon html={item.icon} size={hot ? 22 : 20} />
              ) : (
                <span className="launcher-hub-chip-text">{chipLauncherLabel(item.label)}</span>
              )}
            </button>
          )
        })}

      <button
        type="button"
        className="launcher-hub-core absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center gap-1 w-[96px] h-[96px] rounded-full border-0 bg-transparent p-2 text-center"
        onClick={() => {
          if (expandedCategory) {
            setExpandedCategory(null)
            setHoveredChild(null)
          } else {
            close()
          }
        }}
        aria-label={expandedCategory ? 'Back to categories' : 'Close launcher'}
      >
        {activeChild ? (
          <>
            <span className="launcher-hub-core-title px-1">{shortLauncherLabel(activeChild.label)}</span>
            <span className="launcher-hub-core-meta">{isPluginItem(activeChild.action) ? 'plugin' : 'tool'}</span>
          </>
        ) : expandedCategory ? (
          <>
            <span className="launcher-hub-core-title px-1">{LAUNCHER_CATEGORY_LABELS[expandedCategory]}</span>
            <span className="launcher-hub-core-meta">click to go back</span>
          </>
        ) : (
          <>
            <img src={appIcon} alt="" className="w-6 h-6 rounded-[5px] opacity-95" draggable={false} />
            <span className="launcher-hub-core-brand">scalpel</span>
            <span className="launcher-hub-core-meta">click a group</span>
          </>
        )}
      </button>
    </div>
  )
}
