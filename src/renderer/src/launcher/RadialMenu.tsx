import { useCallback, useEffect, useId, useState } from 'react'
import type { LauncherItem, LauncherSliceMode } from '@shared/launcher'
import appIcon from '../../../../resources/icon.png'

const VIEW = 400
const CENTER = VIEW / 2
const OUTER = 182
const INNER = 54
const LABEL_R = 128
const ICON_R = 118

function slicePath(index: number, total: number, inner: number, outer: number): string {
  if (total <= 0) return ''
  const start = (index / total) * Math.PI * 2 - Math.PI / 2
  const end = ((index + 1) / total) * Math.PI * 2 - Math.PI / 2
  const x1 = CENTER + Math.cos(start) * inner
  const y1 = CENTER + Math.sin(start) * inner
  const x2 = CENTER + Math.cos(end) * inner
  const y2 = CENTER + Math.sin(end) * inner
  const x3 = CENTER + Math.cos(end) * outer
  const y3 = CENTER + Math.sin(end) * outer
  const x4 = CENTER + Math.cos(start) * outer
  const y4 = CENTER + Math.sin(start) * outer
  const large = end - start > Math.PI ? 1 : 0
  return [
    `M ${x1} ${y1}`,
    `A ${inner} ${inner} 0 ${large} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${outer} ${outer} 0 ${large} 0 ${x4} ${y4}`,
    'Z',
  ].join(' ')
}

function sliceMidAngle(index: number, total: number): number {
  return ((index + 0.5) / total) * Math.PI * 2 - Math.PI / 2
}

function contentPosition(index: number, total: number, radius: number): { x: number; y: number; rotate: number } {
  const mid = sliceMidAngle(index, total)
  const deg = (mid * 180) / Math.PI
  const flip = deg > 90 || deg < -90
  return {
    x: CENTER + Math.cos(mid) * radius,
    y: CENTER + Math.sin(mid) * radius,
    rotate: flip ? deg + 180 : deg,
  }
}

function isPluginItem(action: string): boolean {
  return action.startsWith('plugin-overlay:')
}

/** Primary line on the slice; full string stays in title + center on hover. */
function sliceLabel(label: string): string {
  const parts = label.split(' — ')
  const primary = parts[0]?.trim() ?? label
  const secondary = parts[1]?.trim()
  if (secondary && primary.length <= 11) return `${primary}\n${secondary.slice(0, 10)}`
  if (primary.length <= 14) return primary
  return `${primary.slice(0, 13)}…`
}

function SliceIcon({ html, size }: { html: string; size: number }): JSX.Element {
  return (
    <span
      className="launcher-slice-icon inline-flex items-center justify-center shrink-0 [&_svg]:block"
      style={{ width: size, height: size }}
      // Plugin / built-in icons are trusted host markup (same as title-bar tabs).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function RadialMenu({
  items,
  sliceMode = 'names',
}: {
  items: LauncherItem[]
  sliceMode?: LauncherSliceMode
}): JSX.Element {
  const [hovered, setHovered] = useState<number | null>(null)
  const gradId = useId().replace(/:/g, '')

  const close = useCallback(() => {
    window.api.launcherClose()
  }, [])

  const run = useCallback((action: string) => {
    window.api.launcherRun(action)
  }, [])

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
  const contentR = sliceMode === 'icons' ? ICON_R : LABEL_R

  return (
    <div
      className="launcher-root relative w-full h-full select-none"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="launcher-backdrop absolute inset-0 rounded-full pointer-events-none" aria-hidden />

      <svg
        className="launcher-wheel absolute inset-0 w-full h-full"
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        aria-label="Scalpel tool launcher"
      >
        <defs>
          <radialGradient id={`${gradId}-disc`} cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="rgba(44, 44, 58, 0.98)" />
            <stop offset="100%" stopColor="rgba(14, 15, 22, 0.96)" />
          </radialGradient>
          <radialGradient id={`${gradId}-glow`} cx="50%" cy="50%" r="50%">
            <stop offset="70%" stopColor="rgba(200, 169, 110, 0)" />
            <stop offset="100%" stopColor="rgba(200, 169, 110, 0.22)" />
          </radialGradient>
          <linearGradient id={`${gradId}-gold`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e0bd7b" />
            <stop offset="100%" stopColor="#a8844f" />
          </linearGradient>
          <filter id={`${gradId}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="6" stdDeviation="10" floodColor="#000" floodOpacity="0.55" />
            <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#c8a96e" floodOpacity="0.15" />
          </filter>
        </defs>

        <circle cx={CENTER} cy={CENTER} r={OUTER + 10} fill={`url(#${gradId}-glow)`} className="pointer-events-none" />

        <g filter={`url(#${gradId}-shadow)`}>
          <circle
            cx={CENTER}
            cy={CENTER}
            r={OUTER + 4}
            fill="none"
            stroke={`url(#${gradId}-gold)`}
            strokeWidth={1.5}
            opacity={0.55}
          />
          <circle
            cx={CENTER}
            cy={CENTER}
            r={OUTER}
            fill={`url(#${gradId}-disc)`}
            stroke="rgba(200,169,110,0.35)"
            strokeWidth={1}
          />

          {count > 0 &&
            items.map((item, i) => {
              const plugin = isPluginItem(item.action)
              const hot = hovered === i
              return (
                <path
                  key={item.action}
                  d={slicePath(i, count, INNER, OUTER)}
                  fill={
                    hot
                      ? plugin
                        ? 'rgba(126, 87, 194, 0.42)'
                        : 'rgba(200, 169, 110, 0.38)'
                      : i % 2 === 0
                        ? 'rgba(255,255,255,0.045)'
                        : 'rgba(255,255,255,0.025)'
                  }
                  stroke={
                    hot
                      ? plugin
                        ? 'rgba(167, 139, 250, 0.65)'
                        : 'rgba(224, 189, 123, 0.75)'
                      : 'rgba(200,169,110,0.12)'
                  }
                  strokeWidth={hot ? 1.25 : 0.75}
                  className="cursor-pointer transition-[fill,stroke,stroke-width] duration-100"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => run(item.action)}
                />
              )
            })}

          {count > 1 &&
            Array.from({ length: count }, (_, i) => {
              const a = sliceMidAngle(i, count)
              const x1 = CENTER + Math.cos(a) * (INNER + 2)
              const y1 = CENTER + Math.sin(a) * (INNER + 2)
              const x2 = CENTER + Math.cos(a) * (OUTER - 2)
              const y2 = CENTER + Math.sin(a) * (OUTER - 2)
              return (
                <line
                  key={`tick-${i}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="rgba(200,169,110,0.14)"
                  strokeWidth={0.75}
                  className="pointer-events-none"
                />
              )
            })}

          <circle
            cx={CENTER}
            cy={CENTER}
            r={INNER - 2}
            fill="rgba(8, 9, 14, 0.92)"
            stroke="rgba(200,169,110,0.45)"
            strokeWidth={1.25}
          />
          <circle cx={CENTER} cy={CENTER} r={INNER - 8} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
        </g>
      </svg>

      {count > 0 &&
        items.map((item, i) => {
          const { x, y, rotate } = contentPosition(i, count, contentR)
          const hot = hovered === i
          const iconSize = sliceMode === 'icons' ? (hot ? 28 : 24) : hot ? 16 : 14
          return (
            <div
              key={`label-${item.action}`}
              title={item.label}
              className={`launcher-slice-content absolute pointer-events-none flex flex-col items-center justify-center gap-0.5 text-center leading-[1.15] transition-[color,opacity,transform] duration-100 ${
                hot ? 'text-[var(--accent-hover)] opacity-100 scale-105' : 'text-[var(--text)] opacity-85'
              } ${isPluginItem(item.action) ? 'launcher-slice-content--plugin' : ''}`}
              style={{
                left: x,
                top: y,
                transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
                maxWidth: sliceMode === 'icons' ? 56 : hot ? 96 : 78,
                fontSize: sliceMode === 'both' ? (hot ? 9 : 8) : hot ? 11 : 10,
              }}
            >
              {showIcons && item.icon ? <SliceIcon html={item.icon} size={iconSize} /> : null}
              {showNames ? (
                <span className="launcher-slice-label whitespace-pre-line font-semibold">{sliceLabel(item.label)}</span>
              ) : null}
            </div>
          )
        })}

      <button
        type="button"
        className="launcher-hub absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center gap-0.5 w-[88px] h-[88px] rounded-full border-0 bg-transparent p-1 text-center transition-colors hover:bg-white/[0.04]"
        onClick={close}
        aria-label="Close launcher"
      >
        {active ? (
          <>
            <span className="launcher-hub-title font-[var(--font-poe)] text-[13px] leading-tight text-[var(--accent-hover)] px-1 line-clamp-3">
              {active.label}
            </span>
            <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--text-dim)]">
              {isPluginItem(active.action) ? 'Plugin' : 'Tool'}
            </span>
          </>
        ) : (
          <>
            <img
              src={appIcon}
              alt=""
              className="w-7 h-7 rounded-[6px] shadow-[0_2px_8px_rgba(0,0,0,0.45)]"
              draggable={false}
            />
            <span className="font-[var(--font-poe)] text-[11px] text-[var(--accent)] tracking-wide">Scalpel</span>
            <span className="text-[9px] uppercase tracking-[0.16em] text-[var(--text-dim)]">Esc · close</span>
          </>
        )}
      </button>

      {count === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[12px] text-[var(--text-dim)] pointer-events-none">
          <span className="font-[var(--font-poe)] text-[var(--accent)]">Scalpel</span>
          <span>No tools available</span>
        </div>
      )}
    </div>
  )
}
