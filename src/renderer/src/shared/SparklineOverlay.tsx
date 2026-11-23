import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { CurrencyIcon } from './CurrencyIcon'
import { usePoeVersion } from './poe-version-context'
import { getTrendDirection, TREND_DOWN_COLOR, TREND_UP_COLOR } from './price-trend'
import { promoteChaos } from './utils'
import { scaledPx } from './font-scale'

interface CurrentPrice {
  chaosValue: number
  divineValue?: number | null
  chaosPerDivine?: number
}

interface Props {
  graph: (number | null)[]
  visible: boolean
  /** Viewport-space cursor coords + the chip's effective scale, so the portaled
   *  overlay can position itself in real screen pixels and match parent UI scale.
   *  We portal to document.body to escape the chip's transformed ancestor (which
   *  would otherwise clip a position:fixed child). */
  cursor: { viewportX: number; viewportY: number; scale: number }
  /** Current item price. When provided, peak and valley render as small price
   *  chips with the historical price on that day; without it they fall back to
   *  percent-change text labels. */
  currentPrice?: CurrentPrice
  /** Pin all price displays (footer, peak/valley chips) to the baseline
   *  currency. Used by the pair-currency display where promoting Divine's
   *  own price back to "1 div" would be a tautology. */
  noPromote?: boolean
}

const CLAMP = 200
const VIEW_W = 120
const VIEW_H = 40
// Per-side data insets so the leftmost / rightmost / topmost / bottommost
// data points have room for their full dot to render before the overlay's
// overflow:hidden clip path would cut them off. Dot outer radius is 5
// (r=4 + 1px half-stroke); 4-5px insets leave the dot fully visible.
// Adjust each side independently as needed.
const LEFT_INSET = 0
const RIGHT_INSET = 2
const TOP_INSET = 7
const BOTTOM_INSET = 4
// Approximate chip half-width used to clamp horizontal position so a chip
// at the edge of the data range stays inside the chart container. 22px
// covers a 4-character price + the 8px currency icon + the chip's padding.
const CHIP_HALF_W = 22

interface YAxis {
  yMin: number
  yMax: number
  yRange: number
  step: number
}

function computeYAxis(graph: (number | null)[]): YAxis | null {
  const nonNull = graph.filter((v): v is number => v != null)
  if (nonNull.length === 0) return null
  const rawMin = Math.min(...nonNull)
  const rawMax = Math.max(...nonNull)
  const yMin = Math.max(rawMin, -CLAMP)
  const yMax = Math.min(rawMax, CLAMP)
  const yRange = yMax - yMin || 1
  const step = (VIEW_W - LEFT_INSET - RIGHT_INSET) / Math.max(graph.length - 1, 1)
  return { yMin, yMax, yRange, step }
}

function projectY(value: number, axis: YAxis): number {
  const clamped = Math.max(-CLAMP, Math.min(CLAMP, value))
  // Data spans [yMin, yMax]; map into the SVG's
  // [TOP_INSET, VIEW_H - BOTTOM_INSET] band so peak / valley dots have a
  // fixed pixel buffer from the top / bottom edges.
  return VIEW_H - BOTTOM_INSET - ((clamped - axis.yMin) / axis.yRange) * (VIEW_H - TOP_INSET - BOTTOM_INSET)
}

/** Split a graph into contiguous runs of non-null values projected to SVG coords. */
function toSegments(graph: (number | null)[], axis: YAxis): Array<Array<{ x: number; y: number }>> {
  const segments: Array<Array<{ x: number; y: number }>> = []
  let current: Array<{ x: number; y: number }> = []
  for (let i = 0; i < graph.length; i++) {
    const v = graph[i]
    if (v == null) {
      if (current.length > 0) {
        segments.push(current)
        current = []
      }
      continue
    }
    current.push({ x: LEFT_INSET + i * axis.step, y: projectY(v, axis) })
  }
  if (current.length > 0) segments.push(current)
  return segments
}

interface ExtremaPoint {
  x: number
  y: number
  value: number
}

/** Locate the peak and valley non-null entries projected to SVG coords. Returns
 *  valley=null when peak===valley (flat line) so we don't double-mark the same spot. */
function findExtrema(
  graph: (number | null)[],
  axis: YAxis,
): { peak: ExtremaPoint | null; valley: ExtremaPoint | null } {
  let peakIdx = -1
  let valleyIdx = -1
  let peakVal = -Infinity
  let valleyVal = Infinity
  for (let i = 0; i < graph.length; i++) {
    const v = graph[i]
    if (v == null) continue
    if (v > peakVal) {
      peakVal = v
      peakIdx = i
    }
    if (v < valleyVal) {
      valleyVal = v
      valleyIdx = i
    }
  }
  if (peakIdx < 0) return { peak: null, valley: null }
  const peak = { x: LEFT_INSET + peakIdx * axis.step, y: projectY(peakVal, axis), value: peakVal }
  if (peakVal === valleyVal) return { peak, valley: null }
  return { peak, valley: { x: LEFT_INSET + valleyIdx * axis.step, y: projectY(valleyVal, axis), value: valleyVal } }
}

function formatPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

/** chaosPerDivine is sometimes passed explicitly, sometimes only derivable from
 *  the divine/chaos pair. Returns undefined when neither is available. */
function effectiveChaosPerDivine(p: CurrentPrice): number | undefined {
  if (p.chaosPerDivine != null && p.chaosPerDivine > 0) return p.chaosPerDivine
  if (p.divineValue != null && p.divineValue > 0) return p.chaosValue / p.divineValue
  return undefined
}

/** Project a percent-change entry back to a chaos value. The graph holds
 *  percent change vs some upstream baseline; we anchor the math to today's
 *  known price by computing baseline = today / (1 + todayPct/100), then
 *  scaling by (1 + pointPct/100). The (-99, ...) clamp keeps the divisor
 *  away from zero in pathological data. */
function historicalChaos(currentChaos: number, todayPct: number | null | undefined, pointPct: number): number {
  const safeToday = Math.max(-99, todayPct ?? 0)
  const baseline = currentChaos / (1 + safeToday / 100)
  return baseline * (1 + pointPct / 100)
}

/** Mini chip used at the peak / valley markers when a current price is known.
 *  Smaller and more translucent than InfoChip (75% opaque background, fontSize
 *  9, tighter padding, 8px currency icon). Auto-promotes to divine using the
 *  same threshold logic as PriceChip. */
function MiniPriceChip({
  chaosValue,
  chaosPerDivine,
  noPromote,
  testId,
}: {
  chaosValue: number
  chaosPerDivine?: number
  noPromote?: boolean
  testId: string
}): JSX.Element {
  const version = usePoeVersion()
  const { text: display, currencyKey } = promoteChaos(chaosValue, chaosPerDivine, version, undefined, noPromote)
  return (
    <div
      data-testid={testId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        padding: '1px 4px',
        borderRadius: 999,
        background: 'rgba(0, 0, 0, 0.75)',
        fontSize: scaledPx(9),
        fontWeight: 700,
        color: '#fff',
        whiteSpace: 'nowrap',
        lineHeight: 1,
      }}
    >
      <span>{display}</span>
      <CurrencyIcon name={currencyKey} style={{ width: 8, height: 8 }} />
    </div>
  )
}

/** Sparkline overlay portaled to document.body so it escapes any transformed /
 *  overflow:hidden ancestor of the chip. Position is viewport-fixed at the
 *  cursor with a small offset; the matching scale transform keeps the overlay
 *  visually consistent with the rest of the (scaled) UI. Animation timeline:
 *  0-600ms line traces left-to-right, 600-750ms peak/valley dots pop in,
 *  700-900ms peak/valley markers fade. */
export function SparklineOverlay({ graph, visible, cursor, currentPrice, noPromote }: Props): JSX.Element {
  const version = usePoeVersion()
  const direction = getTrendDirection(graph)
  const strokeColor = direction === 'up' ? TREND_UP_COLOR : direction === 'down' ? TREND_DOWN_COLOR : '#888'
  const totalChange = graph[graph.length - 1]
  const totalLabel = totalChange == null ? '0.0%' : formatPct(totalChange)
  const labelColor = strokeColor

  const axis = computeYAxis(graph)
  const segments = axis ? toSegments(graph, axis) : []
  const { peak, valley } = axis ? findExtrema(graph, axis) : { peak: null, valley: null }

  const [animating, setAnimating] = useState(false)
  // Reset on hide so the next show flips the state and replays the
  // keyframes - without this `animating` is a one-way latch and a second
  // hover renders the final frame instantly.
  useEffect(() => {
    setAnimating(visible)
  }, [visible])

  // useId gives this overlay's gradient a stable, unique id so multiple
  // SparklineOverlays in the same DOM (Storybook docs view, future SSR) don't
  // collide on `url(#...)` references.
  const reactId = useId()
  const gradientId = `spark-fill-${reactId.replace(/:/g, '')}`

  const peakColor = TREND_UP_COLOR
  const valleyColor = TREND_DOWN_COLOR

  const cpd = currentPrice ? effectiveChaosPerDivine(currentPrice) : undefined
  // Current price shown in the footer bar. Pass the raw currentPrice fields (not
  // the derived cpd) so it formats identically to the PriceChip the user hovered.
  const currentDisplay = currentPrice
    ? promoteChaos(currentPrice.chaosValue, currentPrice.chaosPerDivine, version, currentPrice.divineValue, noPromote)
    : null
  const todayPct = totalChange ?? null
  const peakChaos = currentPrice && peak ? historicalChaos(currentPrice.chaosValue, todayPct, peak.value) : null
  const valleyChaos = currentPrice && valley ? historicalChaos(currentPrice.chaosValue, todayPct, valley.value) : null

  const fadeStyle = animating
    ? { opacity: 1, animation: 'sparkline-label-fade 200ms ease-out 700ms backwards' as const }
    : { opacity: 0 }

  const clampChipLeft = (x: number): number => Math.max(CHIP_HALF_W, Math.min(x, VIEW_W - CHIP_HALF_W))

  const overlay = (
    <div
      data-testid="sparkline-overlay"
      style={{
        position: 'fixed',
        top: cursor.viewportY,
        left: cursor.viewportX,
        transform: `translate(-50%, 0) scale(${cursor.scale})`,
        transformOrigin: 'top center',
        marginTop: 12,
        opacity: visible ? 1 : 0,
        transition: 'opacity 150ms ease',
        pointerEvents: 'none',
        zIndex: 100,
        // Width matches VIEW_W so the chart fills the overlay edge-to-edge.
        // overflow: hidden clips any stroke / dot half-pixels that would
        // otherwise bleed past the rounded border at the leftmost / rightmost
        // data points. Chips inside use horizontal clamping (clampChipLeft)
        // to stay inside, so they never reach this clip path.
        width: VIEW_W,
        background: 'var(--bg-card, #1a1a1a)',
        border: '1px solid var(--border, #333)',
        borderRadius: 6,
        overflow: 'hidden',
        // Drop shadow lifts the overlay off the parent UI; the inset top
        // shadow gives the header a subtle "chrome" gradient. Negative spread
        // on the inset keeps the dark band confined to the top edge.
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.8), inset 0 18px 18px -16px rgba(0, 0, 0, 0.6)',
        padding: '2px 0 6px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          padding: '0 8px',
          fontSize: scaledPx(10),
        }}
      >
        <span style={{ color: 'var(--text-dim, #888)', fontWeight: 600 }}>7-day trend</span>
        <span data-testid="sparkline-total" style={{ fontWeight: 700, color: labelColor }}>
          {totalLabel}
        </span>
      </div>
      {/* Vertical padding gives the peak/valley chips room to sit above/below
       *  the SVG without colliding with the header. The SVG itself is VIEW_W
       *  wide and now sits flush against the overlay's left/right borders so
       *  the line traces edge-to-edge. */}
      <div style={{ position: 'relative', width: VIEW_W, paddingTop: 14, paddingBottom: 14 }}>
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          width={VIEW_W}
          height={VIEW_H}
          style={{ overflow: 'visible', display: 'block' }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.35" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Area fill rendered before the line so the line sits on top.
           *  Single-point segments have no area; skip them. */}
          {segments.map((seg, si) => {
            if (seg.length < 2) return null
            const polyPoints = [
              `${seg[0].x},${VIEW_H}`,
              ...seg.map((p) => `${p.x},${p.y}`),
              `${seg[seg.length - 1].x},${VIEW_H}`,
            ].join(' ')
            return (
              <polygon
                key={`fill-${si}`}
                data-testid="sparkline-fill"
                points={polyPoints}
                fill={`url(#${gradientId})`}
                style={
                  animating ? { opacity: 1, animation: 'sparkline-fill-fade 600ms ease-out forwards' } : { opacity: 0 }
                }
              />
            )
          })}
          {segments.map((seg, si) => {
            const points = seg.map((p) => `${p.x},${p.y}`).join(' ')
            return (
              <polyline
                key={si}
                data-testid="sparkline-segment"
                points={points}
                fill="none"
                stroke={strokeColor}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                // pathLength=1 normalizes any segment's path to length 1 so the
                // dasharray/offset math stays proportional regardless of actual
                // geometry. Keyframe animation (rather than a transition)
                // guarantees a fresh playback whenever `animating` flips on -
                // transitions skip when React batches the mount + state flip
                // into the same paint frame.
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1}
                style={animating ? { animation: 'sparkline-draw 600ms ease-out forwards' } : undefined}
              />
            )
          })}
          {peak && (
            <circle
              data-testid="sparkline-peak-dot"
              cx={peak.x}
              cy={peak.y}
              r={animating ? 4 : 0}
              fill={peakColor}
              stroke="#fff"
              strokeWidth={2}
              style={animating ? { animation: 'sparkline-dot-pop 150ms ease-out 600ms backwards' } : undefined}
            />
          )}
          {valley && (
            <circle
              data-testid="sparkline-valley-dot"
              cx={valley.x}
              cy={valley.y}
              r={animating ? 4 : 0}
              fill={valleyColor}
              stroke="#fff"
              strokeWidth={2}
              style={animating ? { animation: 'sparkline-dot-pop 150ms ease-out 600ms backwards' } : undefined}
            />
          )}
        </svg>
        {peak && peakChaos != null && (
          <div
            data-testid="sparkline-peak-chip"
            // Chip's bottom edge sits ~4px above the peak dot. The chart
            // container's paddingTop is 14 so SVG local y=0 lands at
            // container y=14; we subtract dot radius (4) and the gap (4) to
            // anchor the chip's bottom right above the dot. translateY(-100%)
            // pulls the chip's height up so the anchored coordinate is the
            // chip's bottom edge. lineHeight: 0 collapses the wrapper's line
            // box - without it the inherited 13px font-size adds 6-8px of
            // asymmetric empty space above the chip, breaking the gap.
            style={{
              position: 'absolute',
              left: clampChipLeft(peak.x),
              top: 6 + peak.y,
              transform: 'translate(-50%, -100%)',
              lineHeight: 0,
              ...fadeStyle,
            }}
          >
            <MiniPriceChip
              chaosValue={peakChaos}
              chaosPerDivine={cpd}
              noPromote={noPromote}
              testId="sparkline-peak-chip-inner"
            />
          </div>
        )}
        {valley && valleyChaos != null && (
          <div
            data-testid="sparkline-valley-chip"
            // Top edge sits ~4px below the valley dot: paddingTop (14) +
            // dot radius (4) + gap (4) = 22, plus the SVG's local y.
            // lineHeight: 0 collapses the wrapper's line box so the chip
            // starts at the wrapper's top edge instead of after the
            // inherited line-height padding.
            style={{
              position: 'absolute',
              left: clampChipLeft(valley.x),
              top: 22 + valley.y,
              transform: 'translateX(-50%)',
              lineHeight: 0,
              ...fadeStyle,
            }}
          >
            <MiniPriceChip
              chaosValue={valleyChaos}
              chaosPerDivine={cpd}
              noPromote={noPromote}
              testId="sparkline-valley-chip-inner"
            />
          </div>
        )}
      </div>
      {currentDisplay && (
        // Current price footer. Sits a touch darker than the card background and
        // runs flush to the overlay's rounded bottom edge (negative bottom margin
        // eats the overlay's 6px bottom padding; overflow:hidden rounds the
        // corners). Side padding is 0 on the overlay, so this spans edge-to-edge.
        <div
          data-testid="sparkline-current-price"
          style={{
            marginBottom: -6,
            padding: '1px 8px',
            background: 'rgba(0, 0, 0, 0.25)',
            textAlign: 'center',
            fontSize: scaledPx(11),
            fontWeight: 700,
            lineHeight: 1.5,
            color: 'var(--text, #fff)',
          }}
        >
          {currentDisplay.text} {currentDisplay.currencyKey}
        </div>
      )}
      <style>{`
        @keyframes sparkline-draw {
          from { stroke-dashoffset: 1; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes sparkline-dot-pop {
          from { r: 0; }
          to { r: 4; }
        }
        @keyframes sparkline-label-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes sparkline-fill-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  )

  return createPortal(overlay, document.body)
}
