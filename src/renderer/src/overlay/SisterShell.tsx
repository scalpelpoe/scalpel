import { forwardRef, useLayoutEffect, useRef } from 'react'

interface SisterShellProps {
  /** CSS offsets inside the overlay canvas. Strings let the regular window
   *  use viewport-relative CSS instead of reporting geometry back to main. */
  left: number | string
  top: number | string
  width: number | string
  /** Drag offset applied by the main panel so the sister follows it. */
  dragOffset?: { x: number; y: number }
  /** Multiplier to match the main panel's scale setting. */
  scale?: number
  /** Origin edge for the scale transform -- matches the main panel's mount side. */
  scaleOrigin?: 'top left' | 'top right'
  /** Pre-scale max height. Falls back to a viewport-based bound if absent. */
  maxHeight?: number | string
  /** React key for the inner animated element -- changing this re-triggers the slide. */
  animKey?: string
  children: React.ReactNode
}

/** Shared positioning + slide-animation shell for sister overlays on the filter and
 *  price-check pages. Both inherit the same rounded container, drop shadow, slide
 *  direction (opposite of the main panel's mount side), and drag/scale behavior. */
export const SisterShell = forwardRef<HTMLDivElement, SisterShellProps>(function SisterShell(
  { left, top, width, dragOffset, scale, scaleOrigin, maxHeight, animKey, children },
  ref,
): JSX.Element {
  const dx = dragOffset?.x ?? 0
  const dy = dragOffset?.y ?? 0
  const scalePart = scale && scale !== 1 ? ` scale(${scale})` : ''

  // Set the slide animation imperatively rather than via React's inline style
  // diffing. React re-creates the style object on every render, and even when
  // the resulting `animation` string is identical to the previous one some
  // browsers (and React style application paths) treat that as a fresh assign
  // and replay the keyframes. Writing it once on mount + animKey change keeps
  // the keyframes fired exactly when we want -- and never on intra-key
  // re-renders triggered by scaleOrigin/cursorSide flips during a click.
  const innerRef = useRef<HTMLDivElement>(null)
  // scaleOrigin is intentionally read fresh inside the effect rather than
  // tracked as a dep -- a mid-life flip should not replay the slide; the next
  // genuine re-mount (animKey change) picks up whatever scaleOrigin is current.
  const scaleOriginRef = useRef(scaleOrigin)
  scaleOriginRef.current = scaleOrigin
  useLayoutEffect(() => {
    if (!innerRef.current) return
    const dir = scaleOriginRef.current === 'top right' ? 'sister-slide-out-right' : 'sister-slide-out-left'
    innerRef.current.style.animation = `${dir} 0.25s ease-out both`
  }, [animKey])

  return (
    <div
      ref={ref}
      className="absolute"
      style={{
        top,
        left,
        width,
        transform: `translate(${dx}px, ${dy}px)${scalePart}`,
        transformOrigin: scaleOrigin,
      }}
    >
      <div
        key={animKey}
        ref={innerRef}
        className="bg-bg border border-border rounded-[28px] overflow-hidden flex flex-col"
        style={{
          maxHeight: maxHeight ?? 'calc(100vh - 32px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
        }}
      >
        {children}
      </div>
    </div>
  )
})
