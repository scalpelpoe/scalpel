import { forwardRef } from 'react'

interface SisterShellProps {
  /** CSS px offsets inside the overlay canvas. */
  left: number
  top: number
  width: number
  /** Drag offset applied by the main panel so the sister follows it. */
  dragOffset?: { x: number; y: number }
  /** Multiplier to match the main panel's scale setting. */
  scale?: number
  /** Origin edge for the scale transform -- matches the main panel's mount side. */
  scaleOrigin?: 'top left' | 'top right'
  /** Pre-scale max height in CSS px. Falls back to a viewport-based bound if absent. */
  maxHeight?: number
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
  const slideAnim = scaleOrigin === 'top right' ? 'sister-slide-out-right' : 'sister-slide-out-left'

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
        className="bg-bg border border-border rounded-[28px] overflow-hidden flex flex-col"
        style={{
          maxHeight: maxHeight ?? 'calc(100vh - 32px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          animation: `${slideAnim} 0.25s ease-out both`,
        }}
      >
        {children}
      </div>
    </div>
  )
})
