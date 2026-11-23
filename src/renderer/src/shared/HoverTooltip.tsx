import { type ReactNode, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { scaledPx } from './font-scale'

// Native `title` tooltips have a fixed ~500ms OS/Chromium delay that can't be
// configured, which reads as sluggish. This renders our own tooltip with a
// snappy delay instead. Tune here if it feels too eager / too slow.
const SHOW_DELAY_MS = 90

interface HoverTooltipProps {
  /** Text shown in the tooltip. */
  text: string
  /** The element the tooltip is anchored to (the price chip). */
  children: ReactNode
  /** Extra classes on the inline-flex wrapper (e.g. `shrink-0` to preserve a
   *  flex child's sizing). The wrapper is `relative inline-flex` by default. */
  className?: string
}

interface TipState {
  x: number
  y: number
  scale: number
}

/** Lightweight hover tooltip for price chips. Portals to document.body and
 *  positions itself viewport-fixed at the cursor with a matching scale
 *  transform, so it escapes the overlay's transformed / overflow:hidden
 *  ancestors (same approach as SparklineOverlay) instead of being clipped by a
 *  scroll container. */
export function HoverTooltip({ text, children, className }: HoverTooltipProps): JSX.Element {
  const [tip, setTip] = useState<TipState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Clear any pending show-timer if the chip unmounts mid-delay (list rows
  // recycle on every search), so the timer can't fire setState after unmount.
  useEffect(() => () => clearTimeout(timer.current), [])

  function track(e: React.MouseEvent<HTMLSpanElement>): TipState {
    const el = e.currentTarget
    const rect = el.getBoundingClientRect()
    const unscaledWidth = el.offsetWidth
    // The overlay applies a CSS scale; rect is in scaled viewport pixels and
    // offsetWidth is unscaled, so their ratio recovers the effective scale.
    const scale = unscaledWidth > 0 ? rect.width / unscaledWidth : 1
    return { x: e.clientX, y: e.clientY, scale }
  }

  return (
    <span
      className={`relative inline-flex ${className ?? ''}`}
      onMouseEnter={(e) => {
        const pos = track(e)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setTip(pos), SHOW_DELAY_MS)
      }}
      onMouseMove={(e) => {
        if (tip) setTip(track(e))
      }}
      onMouseLeave={() => {
        clearTimeout(timer.current)
        setTip(null)
      }}
    >
      {children}
      {tip &&
        createPortal(
          <div
            data-testid="hover-tooltip"
            style={{
              position: 'fixed',
              top: tip.y,
              left: tip.x,
              // Anchor the box's top-left down-and-right of the cursor hotspot so
              // the pointer never sits on top of the text.
              transform: `scale(${tip.scale})`,
              transformOrigin: 'top left',
              marginTop: 18,
              marginLeft: 14,
              pointerEvents: 'none',
              zIndex: 100,
              background: 'var(--bg-card, #1a1a1a)',
              border: '1px solid var(--border, #333)',
              borderRadius: 6,
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.8)',
              padding: '3px 8px',
              fontSize: scaledPx(11),
              fontWeight: 600,
              color: 'var(--text, #fff)',
              // `pre`, not `nowrap`: identical for the single-line price tooltips,
              // but keeps the newlines in multi-line text (a warrant's skill and
              // its supports) instead of collapsing them to spaces.
              whiteSpace: 'pre',
            }}
          >
            {text}
          </div>,
          document.body,
        )}
    </span>
  )
}
