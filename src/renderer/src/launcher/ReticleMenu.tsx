import { useState } from 'react'
import type { LauncherItem, LauncherSliceMode } from '@shared/launcher'
import appIcon from '../../../../resources/icon.png'
import {
  LauncherIcon,
  chipLauncherLabel,
  isPluginItem,
  orbitPoint,
  shortLauncherLabel,
  useLauncherActions,
  useLauncherEscape,
} from './shared'

const VIEW = 400
const CENTER = VIEW / 2
const RING_R = 142
const TICK_OUTER = 178
const CHIP = 40
const CYAN = '#5ec8d8'

function TickRing(): JSX.Element {
  const ticks: JSX.Element[] = []
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2 - Math.PI / 2
    const major = i % 6 === 0
    const mid = i % 3 === 0
    const len = major ? 14 : mid ? 9 : 5
    const opacity = major ? 0.35 : mid ? 0.22 : 0.12
    const x1 = CENTER + Math.cos(a) * (TICK_OUTER - len)
    const y1 = CENTER + Math.sin(a) * (TICK_OUTER - len)
    const x2 = CENTER + Math.cos(a) * TICK_OUTER
    const y2 = CENTER + Math.sin(a) * TICK_OUTER
    ticks.push(
      <line
        key={i}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={`rgba(180,200,210,${opacity})`}
        strokeWidth={major ? 1.25 : 1}
      />,
    )
  }
  return <g className="pointer-events-none">{ticks}</g>
}

export function ReticleMenu({
  items,
  sliceMode = 'icons',
}: {
  items: LauncherItem[]
  sliceMode?: LauncherSliceMode
}): JSX.Element {
  const [hovered, setHovered] = useState<number | null>(null)
  const { close, run } = useLauncherActions()
  useLauncherEscape(close)

  const count = items.length
  const active = hovered !== null ? items[hovered] : null
  const showNames = sliceMode === 'names' || sliceMode === 'both'
  const showIcons = sliceMode === 'icons' || sliceMode === 'both'

  return (
    <div
      className="launcher-root launcher-reticle-style relative w-full h-full select-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="launcher-reticle-backdrop absolute inset-0 pointer-events-none" aria-hidden />

      <svg
        className="launcher-wheel absolute inset-0 w-full h-full"
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        aria-label="Scalpel tool launcher"
      >
        <TickRing />

        {/* Crosshair */}
        <g className="pointer-events-none" stroke="rgba(220,235,245,0.28)" strokeWidth={1}>
          <line x1={CENTER - 36} y1={CENTER} x2={CENTER + 36} y2={CENTER} />
          <line x1={CENTER} y1={CENTER - 36} x2={CENTER} y2={CENTER + 36} />
          <circle cx={CENTER} cy={CENTER} r={2.5} fill={CYAN} stroke="none" />
        </g>

        {/* Reticle frame */}
        <rect
          x={CENTER - 34}
          y={CENTER - 34}
          width={68}
          height={68}
          fill="rgba(10, 14, 18, 0.92)"
          stroke={CYAN}
          strokeWidth={1.25}
          className="pointer-events-none"
        />
      </svg>

      {count > 0 &&
        items.map((item, i) => {
          const { x, y } = orbitPoint(i, count, CENTER, RING_R)
          const hot = hovered === i
          const preferIcon = showIcons && Boolean(item.icon)
          return (
            <button
              key={item.action}
              type="button"
              title={item.label}
              className={`launcher-reticle-chip absolute flex items-center justify-center border-0 cursor-pointer transition-[color,border-color,background,transform] duration-100 ${
                hot ? 'launcher-reticle-chip--hot' : ''
              }`}
              style={{
                left: x,
                top: y,
                width: CHIP,
                height: CHIP,
                transform: `translate(-50%, -50%)${hot ? ' scale(1.06)' : ''}`,
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => run(item.action)}
            >
              {preferIcon && item.icon ? (
                <LauncherIcon html={item.icon} size={hot ? 20 : 18} />
              ) : (
                <span className="launcher-reticle-chip-text">{chipLauncherLabel(item.label)}</span>
              )}
            </button>
          )
        })}

      <button
        type="button"
        className="launcher-reticle-core absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center gap-0.5 w-[68px] h-[68px] border-0 bg-transparent p-1 text-center"
        onClick={close}
        aria-label="Close launcher"
      >
        <img src={appIcon} alt="" className="w-5 h-5 rounded-[3px] opacity-90" draggable={false} />
        <span className="launcher-reticle-brand">scalpel</span>
      </button>

      {/* Fixed readout line below the dial */}
      <div className="launcher-reticle-readout absolute left-1/2 -translate-x-1/2 bottom-[18px] w-[92%] text-center pointer-events-none">
        <div className="launcher-reticle-readout-line" />
        <div className="launcher-reticle-readout-text">
          {active ? (
            <>
              <span className="launcher-reticle-readout-name">{shortLauncherLabel(active.label)}</span>
              <span className="launcher-reticle-readout-kind">{isPluginItem(active.action) ? 'plugin' : 'tool'}</span>
            </>
          ) : (
            <span className="launcher-reticle-readout-idle">
              {showNames && !showIcons ? 'select tool' : 'esc to close'}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
