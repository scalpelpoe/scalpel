import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ExchangePoint } from '@shared/contracts/exchange'
import { CurrencyIcon } from './CurrencyIcon'
import { formatRate, formatVolume } from './utils'
import { chartDirection, nearestIndex, projectChart, VIEW_H, VIEW_W } from './rate-chart-geometry'
import { TREND_DOWN_COLOR, TREND_UP_COLOR } from './price-trend'
import { scaledPx } from './font-scale'

interface Props {
  /** Oldest-first daily samples. Fewer than two still renders (early league). */
  points: ExchangePoint[]
  /** Currency on the other side of the pair, for the readout icon. */
  currency: string
  /** Rendered height in CSS px. Width always fills the container. */
  height?: number
  /** Tooltip label for the bar series. Exchange data is traded volume per hour
   *  (the default); the unique Price Tracker feeds daily listing counts. */
  volumeLabel?: { prefix: string; suffix: string }
}

const EXCHANGE_VOLUME_LABEL = { prefix: 'vol', suffix: '/hr' }

/** Gap between the cursor and the tooltip's nearest corner. */
const TIP_OFFSET_X = 14
const TIP_OFFSET_Y = 18
/** Minimum breathing room between the tooltip and the viewport edge. */
const TIP_MARGIN = 8
/** Hover marker size in real pixels. Rendered as HTML rather than an SVG circle
 *  -- see the marker's own comment. */
const MARKER_D = 10

function formatDay(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface Cursor {
  /** Viewport coords of the pointer. */
  x: number
  y: number
  /** The chart's effective CSS scale, so the portaled tooltip matches the
   *  surrounding (scaled) overlay UI. */
  scale: number
}

/** League-length exchange-rate chart: rate line over ghosted hourly-volume bars.
 *  Hovering reads out the day under the cursor in a tooltip. Hand-rolled SVG --
 *  the app ships no chart library and one chart doesn't justify adding one. */
export function RateChart({
  points,
  currency,
  height = 120,
  volumeLabel = EXCHANGE_VOLUME_LABEL,
}: Props): JSX.Element | null {
  const geometry = projectChart(points)
  const [hover, setHover] = useState<number | null>(null)
  const [cursor, setCursor] = useState<Cursor>({ x: 0, y: 0, scale: 1 })
  // Rendered tooltip size, measured after mount so the clamp below can keep the
  // whole box on screen. Width and height are position-independent, so measuring
  // them can't feed back into the position that depends on them.
  const [tipSize, setTipSize] = useState<{ w: number; h: number } | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const reactId = useId()
  const gradientId = `rate-fill-${reactId.replace(/:/g, '')}`
  const wipeId = `rate-wipe-${reactId.replace(/:/g, '')}`

  const hoverIdx = hover !== null && points.length > 0 ? Math.min(hover, points.length - 1) : null

  useLayoutEffect(() => {
    const el = tipRef.current
    if (!el) return
    // offsetWidth/Height are pre-transform; multiply by the scale we render with
    // to get the on-screen box the clamp has to fit.
    setTipSize({ w: el.offsetWidth * cursor.scale, h: el.offsetHeight * cursor.scale })
  }, [hoverIdx, cursor.scale, currency])

  if (!geometry) return null

  const direction = chartDirection(points)
  const stroke = direction === 'up' ? TREND_UP_COLOR : direction === 'down' ? TREND_DOWN_COLOR : '#888'
  const active = hoverIdx !== null ? points[hoverIdx] : null
  const activePt = hoverIdx !== null ? geometry.line[hoverIdx] : null
  // Remounts the animated nodes whenever the series itself changes -- a pair
  // switch feeds a different dataset to the same mounted chart, and CSS
  // keyframes only replay on a fresh element. Hovering must NOT be part of this
  // or the chart would redraw on every mouse move.
  const animKey = `${currency}|${points.length}|${points[0].t}|${points[points.length - 1].rate}`

  /** Mouse handlers live on the wrapping div, not the SVG: SVGElement has no
   *  offsetWidth, and that ratio is how the shared tooltip idiom recovers the
   *  overlay's CSS scale (same trick as HoverTooltip / SparklineOverlay). */
  function handleMove(e: React.MouseEvent<HTMLDivElement>): void {
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    const scale = el.offsetWidth > 0 ? rect.width / el.offsetWidth : 1
    setHover(nearestIndex(points, e.clientX - rect.left, rect.width))
    setCursor({ x: e.clientX, y: e.clientY, scale })
  }

  // Prefer down-and-right of the cursor, then clamp both axes into the viewport.
  // SparklineOverlay centers on the cursor and does not clamp, so a chart near
  // the screen edge can spill; this keeps the same portal/fixed/scale idiom but
  // actually stays on screen.
  const tipLeft =
    tipSize == null
      ? cursor.x + TIP_OFFSET_X
      : Math.max(TIP_MARGIN, Math.min(cursor.x + TIP_OFFSET_X, window.innerWidth - tipSize.w - TIP_MARGIN))
  const tipTop =
    tipSize == null
      ? cursor.y + TIP_OFFSET_Y
      : Math.max(TIP_MARGIN, Math.min(cursor.y + TIP_OFFSET_Y, window.innerHeight - tipSize.h - TIP_MARGIN))

  return (
    <div
      className="relative w-full select-none"
      onMouseMove={handleMove}
      onMouseLeave={() => setHover(null)}
      data-testid="rate-chart-surface"
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height, display: 'block', overflow: 'visible' }}
        data-testid="rate-chart"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.3" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
          {/* Left-to-right wipe that draws the line in. A stroke-dash animation
           *  cannot be used here: pathLength normalises the dash pattern against
           *  the path's USER-space length, while vectorEffect="non-scaling-stroke"
           *  resolves the stroke in SCREEN space -- and preserveAspectRatio="none"
           *  makes those two spaces differ per axis, so the dash never lines up
           *  with the path and the line draws from the wrong offset. Clipping is
           *  immune to the distortion because the rect scales with the viewBox. */}
          <clipPath id={wipeId} key={`wipe-${animKey}`}>
            <rect
              x={0}
              y={0}
              width={VIEW_W}
              height={VIEW_H}
              style={{
                transformOrigin: '0px 0px',
                animation: 'rate-chart-wipe 620ms cubic-bezier(0.4, 0, 0.2, 1) both',
              }}
            />
          </clipPath>
        </defs>
        {/* Volume first so the rate line always sits on top of it. The group is
         *  scaled from the baseline so the bars grow upward as they appear. */}
        <g
          key={`bars-${animKey}`}
          style={{
            transformOrigin: `0px ${VIEW_H}px`,
            animation: 'rate-chart-rise 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
          }}
        >
          {geometry.bars.map((b, i) => (
            <rect
              key={`v${i}`}
              data-testid="rate-chart-bar"
              // preserveAspectRatio="none" scales the 300-unit viewBox to whatever
              // width the card is, so every bar lands on a fractional device pixel.
              // Left to antialias, each edge softens by a different amount and the
              // gutters read as uneven. crispEdges snaps them all the same way.
              shapeRendering="crispEdges"
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              fill="var(--text-dim, #888)"
              opacity={hoverIdx === i ? 0.35 : 0.15}
            />
          ))}
        </g>
        <polygon
          key={`area-${animKey}`}
          points={geometry.area}
          fill={`url(#${gradientId})`}
          style={{ animation: 'rate-chart-fade 420ms ease-out 220ms both' }}
        />
        <polyline
          key={`line-${animKey}`}
          data-testid="rate-chart-line"
          points={geometry.line.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          // preserveAspectRatio="none" stretches the viewBox non-uniformly, which
          // would smear the stroke width with it. This pins it to real pixels.
          vectorEffect="non-scaling-stroke"
          strokeLinecap="round"
          strokeLinejoin="round"
          clipPath={`url(#${wipeId})`}
        />
        {activePt && (
          <line
            data-testid="rate-chart-crosshair"
            x1={activePt.x}
            x2={activePt.x}
            y1={0}
            y2={VIEW_H}
            stroke="var(--text-dim, #888)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            opacity={0.5}
          />
        )}
      </svg>

      {/* The marker is HTML, not an SVG <circle>. preserveAspectRatio="none"
       *  stretches the viewBox by different factors on each axis (roughly 1.4x
       *  wide and 0.92x tall at card size), so any circle drawn in viewBox units
       *  renders as an ellipse -- vectorEffect pins the stroke but not the
       *  geometry. Positioning it in percentages over the chart keeps it a true
       *  circle at any container size. */}
      {activePt && (
        <div
          data-testid="rate-chart-marker"
          style={{
            position: 'absolute',
            left: `${(activePt.x / VIEW_W) * 100}%`,
            top: `${(activePt.y / VIEW_H) * 100}%`,
            transform: 'translate(-50%, -50%)',
            width: MARKER_D,
            height: MARKER_D,
            borderRadius: '50%',
            background: '#3a3a44',
            border: '2px solid #fff',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.6)',
            pointerEvents: 'none',
          }}
        />
      )}

      {active &&
        createPortal(
          <div
            ref={tipRef}
            data-testid="rate-chart-tooltip"
            style={{
              position: 'fixed',
              top: tipTop,
              left: tipLeft,
              transform: `scale(${cursor.scale})`,
              transformOrigin: 'top left',
              // Hidden for the single frame before the size measurement lands,
              // so it can't flash at an unclamped position near a screen edge.
              visibility: tipSize == null ? 'hidden' : 'visible',
              pointerEvents: 'none',
              zIndex: 100,
              background: 'var(--bg-card, #1a1a1a)',
              border: '1px solid var(--border, #333)',
              borderRadius: 6,
              // Drop shadow lifts it off the panel; the inset highlight along the
              // top edge is the same chrome treatment SparklineOverlay uses.
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
              padding: '6px 9px',
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{ fontSize: scaledPx(10), fontWeight: 600, color: 'var(--text-dim, #888)', lineHeight: 1 }}>
              {formatDay(active.t)}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, lineHeight: 1 }}>
              <span style={{ fontSize: scaledPx(14), fontWeight: 700, color: 'var(--text, #fff)' }}>
                {formatRate(active.rate)}
              </span>
              <CurrencyIcon name={currency} style={{ width: 12, height: 12 }} />
            </div>
            {geometry.volumeMax > 0 && (
              <div style={{ fontSize: scaledPx(10), color: 'var(--text-dim, #888)', lineHeight: 1 }}>
                {volumeLabel.prefix && `${volumeLabel.prefix} `}
                <span style={{ fontWeight: 700, color: 'var(--text, #fff)' }}>{formatVolume(active.volume)}</span>
                {volumeLabel.suffix}
              </div>
            )}
          </div>,
          document.body,
        )}

      {/* Entry animation. Bars rise from the baseline first, the line draws
       *  left to right over them, and the gradient fades in behind once the
       *  line is underway. Declared inline (as SparklineOverlay does) so the
       *  component stays self-contained -- only one chart is mounted at a time. */}
      <style>{`
        @keyframes rate-chart-rise {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
        }
        @keyframes rate-chart-wipe {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        @keyframes rate-chart-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
