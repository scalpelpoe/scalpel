import { useState } from 'react'
import type { LauncherItem, LauncherSliceMode } from '@shared/launcher'
import { LauncherIcon, chipLauncherLabel, orbitPoint, useLauncherActions, useLauncherEscape } from './shared'

const VIEW = 400
const CENTER = VIEW / 2
const RING_R = 138
const CORAL = '#e8907a'

export function MinimalMenu({
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
  const showNames = sliceMode === 'names' || sliceMode === 'both'
  const showIcons = sliceMode === 'icons' || sliceMode === 'both'

  return (
    <div
      className="launcher-root launcher-minimal-style relative w-full h-full select-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
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
              className={`launcher-minimal-item absolute flex flex-col items-center justify-center gap-1 border-0 bg-transparent cursor-pointer transition-[color,opacity,transform] duration-100 ${
                hot ? 'launcher-minimal-item--hot' : ''
              }`}
              style={{
                left: x,
                top: y,
                transform: `translate(-50%, -50%)${hot ? ' scale(1.08)' : ''}`,
                minWidth: 44,
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => run(item.action)}
            >
              {preferIcon && item.icon ? (
                <LauncherIcon html={item.icon} size={hot ? 22 : 20} />
              ) : (
                <span className="launcher-minimal-text">{chipLauncherLabel(item.label)}</span>
              )}
              {showNames && preferIcon ? (
                <span className="launcher-minimal-caption">{chipLauncherLabel(item.label)}</span>
              ) : null}
              <span className="launcher-minimal-dot" style={{ opacity: hot ? 1 : 0, background: CORAL }} aria-hidden />
            </button>
          )
        })}

      <button
        type="button"
        className="launcher-minimal-core absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center gap-0.5 border-0 bg-transparent p-2 text-center"
        onClick={close}
        aria-label="Close launcher"
      >
        <span className="launcher-minimal-brand">scalpel</span>
        <span className="launcher-minimal-meta">esc</span>
      </button>

      {count === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none">
          <span className="launcher-minimal-brand">scalpel</span>
          <span className="launcher-minimal-meta">no tools</span>
        </div>
      )}
    </div>
  )
}
