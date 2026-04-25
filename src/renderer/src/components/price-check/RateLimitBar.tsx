import { useEffect, useState } from 'react'
import { ErrorBanner } from '../ErrorBanner'

interface Tier {
  used: number
  max: number
  window: number
  penalty: number
  /** Epoch ms when this tier was last pushed from the main process. */
  lastUpdate?: number
}

// Thresholds shared between bar color, height animation, and warning trigger.
const WARN_PCT = 0.5 // yellow bar
const DANGER_PCT = 0.8 // red bar + warning banner
const HEIGHT_FLOOR_PCT = 0.2 // bar stays at min height until usage exceeds this
const MIN_BAR_HEIGHT = 3 // px
const MAX_BAR_HEIGHT = 10 // px

/** Tier's current decayed "used" count, clamped to [0, max]. Windows slide, so used drops
 *  linearly toward 0 as the window elapses from when we last heard a real value. */
function decayedUsed(t: Tier, now: number): number {
  if (!t.lastUpdate || !t.window) return t.used
  const elapsedMs = now - t.lastUpdate
  const windowMs = t.window * 1000
  const remaining = Math.max(0, 1 - elapsedMs / windowMs)
  return Math.max(0, Math.ceil(t.used * remaining))
}

/** Bar track height in px. Stays at the floor until usage crosses HEIGHT_FLOOR_PCT, then
 *  grows linearly to MAX_BAR_HEIGHT at 100%. */
function barHeight(pct: number): number {
  const clamped = Math.min(1, pct)
  const growth = Math.max(0, clamped - HEIGHT_FLOOR_PCT) / (1 - HEIGHT_FLOOR_PCT)
  return MIN_BAR_HEIGHT + (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT) * growth
}

export function RateLimitBar({ rateLimitTiers }: { rateLimitTiers: Tier[] }): JSX.Element | null {
  // Tick so the bar continues to decay between API responses even when the user isn't
  // searching. 500ms is responsive enough for the eye without being expensive.
  const [, tick] = useState(0)
  useEffect(() => {
    if (rateLimitTiers.length === 0) return
    const id = setInterval(() => tick((n) => n + 1), 500)
    return () => clearInterval(id)
  }, [rateLimitTiers.length])

  if (rateLimitTiers.length === 0) return null

  const now = Date.now()
  const decayed = rateLimitTiers.map((t) => ({ ...t, used: decayedUsed(t, now) }))
  // Blended risk = the tier closest to its cap. Hitting any one cap means a timeout.
  const worstPct = decayed.reduce((max, t) => Math.max(max, t.max > 0 ? t.used / t.max : 0), 0)
  const hasPenalty = rateLimitTiers.some((t) => t.penalty > 0)
  const atRisk = hasPenalty || worstPct >= DANGER_PCT
  const barColor = atRisk
    ? '#c44'
    : worstPct > WARN_PCT
      ? '#b8943a'
      : worstPct > 0
        ? '#3a7a3a'
        : 'rgba(255,255,255,0.06)'

  return (
    <div className="rate-limit-bar flex flex-col border-t border-border relative">
      <ErrorBanner inline message={atRisk ? 'Warning: you are dangerously close to a Trade API timeout' : null} />
      <div
        className="flex items-center gap-2"
        onMouseMove={(e) => {
          const tip = e.currentTarget.querySelector('.rate-limit-tooltip') as HTMLElement
          if (tip) {
            const rect = e.currentTarget.getBoundingClientRect()
            const tipWidth = tip.offsetWidth
            const x = e.clientX - rect.left
            const minX = tipWidth / 2
            const maxX = rect.width - tipWidth / 2
            tip.style.left = `${Math.max(minX, Math.min(x, maxX))}px`
          }
        }}
      >
        <div
          className="flex-1 bg-white/[0.08] overflow-hidden transition-[height] duration-[300ms] ease-[ease]"
          style={{ height: `${barHeight(worstPct)}px` }}
        >
          <div
            className="h-full transition-[width] duration-[400ms] ease-[ease]"
            style={{
              width: `${Math.min(100, worstPct * 100)}%`,
              background: barColor,
              ...(hasPenalty ? { animation: 'pulse-red 1s ease-in-out infinite' } : {}),
            }}
          />
        </div>
        {hasPenalty && (
          <span className="text-[9px] text-[#ef5350] font-semibold px-[6px]">
            {rateLimitTiers.find((t) => t.penalty > 0)!.penalty}s
          </span>
        )}
        <div className="rate-limit-tooltip absolute bottom-full mb-[6px] -translate-x-1/2 px-[10px] py-[6px] bg-bg-card border border-border rounded text-[10px] text-text-dim whitespace-nowrap pointer-events-none opacity-0 transition-opacity duration-150 flex flex-col gap-[2px]">
          <div className="font-semibold text-text mb-[2px]">Trade API Rate Limit</div>
          {decayed.map((t, i) => (
            <div key={i} className="flex justify-between gap-3">
              <span>
                {t.used}/{t.max}
              </span>
              <span className="text-text-dim">per {t.window}s</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
