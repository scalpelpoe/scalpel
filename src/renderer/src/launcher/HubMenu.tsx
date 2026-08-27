import { useEffect, useId, useState } from 'react'
import type { LauncherItem, LauncherSliceMode } from '@shared/launcher'
import appIcon from '../../../../resources/icon.png'
import { LauncherIcon, chipLauncherLabel, isPluginItem, shortLauncherLabel, useLauncherActions } from './shared'

const VIEW = 400
const CENTER = VIEW / 2
const RING_R = 148
const HUB_R = 58
const CHIP = 44

function chipCenter(index: number, total: number): { x: number; y: number } {
  const mid = ((index + 0.5) / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2
  return {
    x: CENTER + Math.cos(mid) * RING_R,
    y: CENTER + Math.sin(mid) * RING_R,
  }
}

export function HubMenu({
  items,
  sliceMode = 'icons',
}: {
  items: LauncherItem[]
  sliceMode?: LauncherSliceMode
}): JSX.Element {
  const [hovered, setHovered] = useState<number | null>(null)
  const gradId = useId().replace(/:/g, '')
  const { close, run } = useLauncherActions()

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const count = items.length
  const active = hovered !== null ? items[hovered] : null
  const showNames = sliceMode === 'names' || sliceMode === 'both'
  const showIcons = sliceMode === 'icons' || sliceMode === 'both'

  return (
    <div
      className="launcher-root launcher-hub-style relative w-full h-full select-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="launcher-hub-backdrop absolute inset-0 rounded-full pointer-events-none" aria-hidden />

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

        {/* Orbital hairline */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RING_R}
          fill="none"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth={1}
          className="pointer-events-none"
        />

        {/* Hub disc + concentric rings */}
        <g filter={`url(#${gradId}-soft)`} className="pointer-events-none">
          <circle cx={CENTER} cy={CENTER} r={HUB_R + 10} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          <circle cx={CENTER} cy={CENTER} r={HUB_R + 4} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
          <circle
            cx={CENTER}
            cy={CENTER}
            r={HUB_R}
            fill="rgba(18, 19, 26, 0.96)"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={1}
          />
        </g>
      </svg>

      {count > 0 &&
        items.map((item, i) => {
          const { x, y } = chipCenter(i, count)
          const hot = hovered === i
          const preferIcon = showIcons && Boolean(item.icon)
          const both = preferIcon && showNames
          return (
            <button
              key={item.action}
              type="button"
              title={item.label}
              className={`launcher-hub-chip absolute flex flex-col items-center justify-center gap-0.5 border-0 cursor-pointer transition-[background,box-shadow,transform,color] duration-100 ${
                hot ? 'launcher-hub-chip--hot' : ''
              }`}
              style={{
                left: x,
                top: y,
                width: both ? CHIP + 10 : CHIP,
                height: both ? CHIP + 16 : CHIP,
                transform: `translate(-50%, -50%)${hot ? ' scale(1.08)' : ''}`,
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => run(item.action)}
            >
              {preferIcon && item.icon ? (
                <LauncherIcon html={item.icon} size={hot ? 22 : 20} />
              ) : (
                <span className="launcher-hub-chip-text">{chipLauncherLabel(item.label)}</span>
              )}
              {both ? <span className="launcher-hub-chip-caption">{chipLauncherLabel(item.label)}</span> : null}
            </button>
          )
        })}

      <button
        type="button"
        className="launcher-hub-core absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center gap-1 w-[108px] h-[108px] rounded-full border-0 bg-transparent p-2 text-center"
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
            <span className="launcher-hub-core-meta">esc to close</span>
          </>
        )}
      </button>

      {count === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none">
          <span className="launcher-hub-core-brand">scalpel</span>
          <span className="launcher-hub-core-meta">no tools available</span>
        </div>
      )}
    </div>
  )
}
