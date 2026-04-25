import { useLayoutEffect, useRef, useState } from 'react'
import { iconMap } from '../../shared/constants'

const ICON_SIZE = 22
const GAP = 3

/**
 * One-row strip of base-type icons sized to "as many as fully fit". Measures the
 * container synchronously in useLayoutEffect (before paint) so we never render
 * the full list first and then snap down -- the initial value is 0 so the first
 * commit is empty, then the measured count is set before the browser paints.
 */
export function TierIconStrip({ names }: { names: string[] }): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(0)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = (): void => {
      const width = el.getBoundingClientRect().width
      // fit = floor((width + gap) / (iconSize + gap)) -- the +gap accounts for the
      // extra item not needing a trailing gap, so "width=ICON_SIZE" -> 1 icon fits.
      const n = Math.max(0, Math.floor((width + GAP) / (ICON_SIZE + GAP)))
      setVisibleCount(Math.min(n, names.length))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [names.length])

  const urls = names.map((n) => iconMap[n]).filter(Boolean) as string[]

  return (
    <div
      ref={containerRef}
      className="flex flex-nowrap justify-center overflow-hidden w-full"
      style={{ gap: GAP, height: ICON_SIZE }}
    >
      {urls.slice(0, visibleCount).map((url, i) => (
        <img
          key={i}
          src={url}
          alt=""
          className="object-contain shrink-0"
          style={{ width: ICON_SIZE, height: ICON_SIZE }}
        />
      ))}
    </div>
  )
}
