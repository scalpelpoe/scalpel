import { useEffect, useState } from 'react'
import gregPortrait from '../../assets/other/greg.png'

/** Fraction-lerped color between two hex strings; lightweight enough to live
 *  inline. Used to fade the countdown ring from red (just-timed-out) through
 *  yellow to green (almost free) so the banner reads as "good news is coming"
 *  the longer it's on screen. */
function lerpColor(from: [number, number, number], to: [number, number, number], t: number): string {
  const clamp = Math.max(0, Math.min(1, t))
  const r = Math.round(from[0] + (to[0] - from[0]) * clamp)
  const g = Math.round(from[1] + (to[1] - from[1]) * clamp)
  const b = Math.round(from[2] + (to[2] - from[2]) * clamp)
  return `rgb(${r}, ${g}, ${b})`
}

// Colors borrowed from the PoE1 map-tab tier pips: red for "bad" (low / stuck),
// yellow for mid, green for "all clear". Used across the ring stroke so the
// banner matches something users already associate with "time to wait".
const RED: [number, number, number] = [196, 68, 68]
const YELLOW: [number, number, number] = [184, 148, 58]
const GREEN: [number, number, number] = [58, 122, 58]

/** Interpolate red -> yellow at the first half of the wait and yellow -> green
 *  at the second half. `remaining` = fraction of the original penalty still
 *  left (1 at the start, 0 at the end). */
function ringColor(remaining: number): string {
  // Banner lifetime runs from 1 (just locked out) to 0 (about to unlock). Red
  // at the top, green at the bottom: hue crosses yellow at 50%.
  if (remaining > 0.5) {
    return lerpColor(YELLOW, RED, (remaining - 0.5) * 2)
  }
  return lerpColor(GREEN, YELLOW, remaining * 2)
}

function formatMMSS(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Surfaced when the trade API has rate-limited the user for a notable span.
 *  Replaces the usual search-results area with Greg's accusation and a
 *  countdown ring so the user knows exactly when they can retry instead of
 *  staring at a stuck shimmer. */
export function TradeTimeoutBanner({ until }: { until: number }): JSX.Element | null {
  const [now, setNow] = useState(Date.now())
  // Remember the starting gap so the ring fraction stays anchored to the
  // original penalty length (not whatever's currently remaining as the user
  // watches it tick). Captured once per banner instance via a one-shot state.
  const [totalMs] = useState(() => Math.max(1000, until - Date.now()))

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])

  const remainingMs = until - now
  if (remainingMs <= 0) return null

  const remainingFraction = Math.max(0, Math.min(1, remainingMs / totalMs))
  const color = ringColor(remainingFraction)

  // Circular countdown: stroke-dasharray = full circumference, dashoffset
  // grows as time elapses, so the visible arc shrinks clockwise.
  const size = 43
  const stroke = 4
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - remainingFraction)

  return (
    <div className="relative flex items-stretch gap-3 my-2 rounded-lg overflow-visible bg-bg-card">
      <div className="shrink-0 w-[60px] flex items-center justify-center">
        <img src={gregPortrait} alt="" className="w-[38px] pointer-events-none select-none" />
      </div>
      <div className="flex-1 py-3 flex flex-col justify-center">
        <div className="text-[11px] text-[#ef5350] font-semibold">
          Looks like the trade API has given you a {formatMMSS(remainingMs)} minute timeout.
        </div>
        <div className="text-[10px] text-text-dim">Blame Greg.</div>
      </div>
      <div className="flex items-center justify-center pr-4 shrink-0">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 500ms linear, stroke 500ms linear' }}
            />
          </svg>
          <div
            className="absolute inset-0 flex items-center justify-center text-[9px] font-mono font-semibold"
            style={{ color }}
          >
            {formatMMSS(remainingMs)}
          </div>
        </div>
      </div>
    </div>
  )
}
