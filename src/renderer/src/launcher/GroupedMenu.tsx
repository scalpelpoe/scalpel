import { useId, useState } from 'react'
import type { LauncherItem, LauncherSliceMode } from '@shared/launcher'
import appIcon from '../../../../resources/icon.png'
import { CATEGORY_COLORS, clusterArcPath, groupedRingLayout, polarPoint } from './category-layout'
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
const OUTER = 182
const INNER = 54
const RING_R = 148
const CHIP = 44

export function GroupedMenu({
  items,
  sliceMode = 'names',
}: {
  items: LauncherItem[]
  sliceMode?: LauncherSliceMode
}): JSX.Element {
  const [hovered, setHovered] = useState<number | null>(null)
  const gradId = useId().replace(/:/g, '')
  const { close, run } = useLauncherActions()
  useLauncherEscape(close)

  const { slots, wedges } = groupedRingLayout(items)
  const dense = items.length > 8
  const active = hovered !== null ? (slots.find((s) => s.globalIndex === hovered)?.item ?? null) : null

  return (
    <div
      className="launcher-root launcher-grouped-style relative w-full h-full select-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <svg
        className="launcher-wheel absolute inset-0 w-full h-full"
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        aria-label="Scalpel tool launcher"
      >
        <defs>
          <filter id={`${gradId}-soft`} x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#000" floodOpacity="0.45" />
          </filter>
        </defs>

        <g filter={`url(#${gradId}-soft)`}>
          <path
            d={clusterArcPath(CENTER, CENTER, INNER, OUTER, -Math.PI, Math.PI)}
            fill="rgba(18, 19, 26, 0.55)"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
            className="pointer-events-none"
          />
          {wedges.map((wedge) => {
            const colors = CATEGORY_COLORS[wedge.category]
            return (
              <path
                key={wedge.category}
                d={clusterArcPath(CENTER, CENTER, INNER, OUTER, wedge.start, wedge.end)}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth={1}
                className="pointer-events-none"
              />
            )
          })}
        </g>

        <circle
          cx={CENTER}
          cy={CENTER}
          r={INNER - 2}
          fill="rgba(18, 19, 26, 0.96)"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={1}
          className="pointer-events-none"
        />
      </svg>

      {slots.map(({ item, angle, category, globalIndex }) => {
        const hot = hovered === globalIndex
        const { x, y } = polarPoint(CENTER, CENTER, angle, RING_R)
        const display = resolveChipDisplay(sliceMode, item, dense)
        return (
          <button
            key={item.action}
            type="button"
            aria-label={item.label}
            className={`launcher-grouped-chip absolute flex items-center justify-center border-0 cursor-pointer transition-[transform,box-shadow] duration-100 ${
              hot ? 'launcher-grouped-chip--hot' : ''
            }`}
            style={{
              left: x,
              top: y,
              width: CHIP,
              height: CHIP,
              transform: `translate(-50%, -50%)${hot ? ' scale(1.08)' : ''}`,
              outlineColor: CATEGORY_COLORS[category].stroke,
            }}
            onMouseEnter={() => setHovered(globalIndex)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => run(item.action)}
          >
            {display === 'icon' && item.icon ? (
              <LauncherIcon html={item.icon} size={hot ? 22 : 20} />
            ) : (
              <span className="launcher-grouped-chip-text">{chipLauncherLabel(item.label)}</span>
            )}
          </button>
        )
      })}

      <button
        type="button"
        className="launcher-hub-core absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center gap-1 w-[96px] h-[96px] rounded-full border-0 bg-transparent p-2 text-center"
        onClick={close}
        aria-label="Close launcher"
      >
        {active ? (
          <>
            <span className="launcher-hub-core-title px-1">{shortLauncherLabel(active.label)}</span>
            <span className="launcher-hub-core-meta">{isPluginItem(active.action) ? 'plugin' : 'tool'}</span>
          </>
        ) : (
          <>
            <img src={appIcon} alt="" className="w-6 h-6 rounded-[5px] opacity-95" draggable={false} />
            <span className="launcher-hub-core-brand">scalpel</span>
            <span className="launcher-hub-core-meta">grouped</span>
          </>
        )}
      </button>
    </div>
  )
}
