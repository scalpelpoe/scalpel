import { useEffect, useRef, useState } from 'react'
import type { CheatSheetCategory, RuntimeSettings } from '../../../shared/types'
import { useStickyZone } from '../shared/use-current-zone'

export function App(): JSX.Element | null {
  const [categories, setCategories] = useState<CheatSheetCategory[]>([])
  const currentZone = useStickyZone()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.api.getSettings().then((s: RuntimeSettings) => {
      setCategories(s.activeProfile?.cheatSheets.categories ?? [])
    })
    return window.api.onSettingUpdated((key, value) => {
      if (key === 'activeProfile') {
        setCategories((value as RuntimeSettings['activeProfile'])?.cheatSheets.categories ?? [])
      }
    })
  }, [])

  // Compute matches across all categories.
  const matches = !currentZone
    ? []
    : categories.flatMap((cat) =>
        cat.sheets
          .filter((s) => s.areaCodes?.includes(currentZone.areaCode))
          .map((s) => ({ categoryId: cat.id, sheet: s })),
      )
  // Stable key for effect deps. Joining ids works because the order is
  // deterministic per zone (driven by categories + sheet ordering).
  const matchKey = matches.map((m) => `${m.categoryId}/${m.sheet.id}`).join(',')

  // Report visibility to main: true when we have at least one match.
  useEffect(() => {
    window.api.pinnedZoneSetVisible(matches.length > 0)
  }, [matches.length])

  // Report content height to main whenever the rendered content changes
  // size - including indirect changes from a drag-resize that widened the
  // window and made the aspect-ratio'd images taller. Using a ResizeObserver
  // (rather than just firing on matchKey changes) is what keeps the window
  // bounds in sync with the actual image height. Without this, the
  // BrowserWindow stays at the last-reported height while the images grow
  // past it, producing the "scaling separately" / clipping behavior.
  // matchKey is in the deps so the observer attaches after the (currently
  // null) ref becomes the rendered div when matches go from empty to non-
  // empty for the first time. rootRef is intentionally not a dep - refs
  // are stable across renders, and the `if (!el) return` guard handles
  // the transient frame where matches went non-empty but the JSX-attached
  // ref hasn't committed yet.
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const height = el.scrollHeight
      if (height > 0) window.api.pinnedZoneSetContentHeight(height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [matchKey])

  if (matches.length === 0) return null

  return (
    <div ref={rootRef} className="flex flex-col" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {matches.map((m) => (
        <img
          key={`${m.categoryId}/${m.sheet.id}`}
          src={`cheatsheet://${m.categoryId}/${m.sheet.id}.${m.sheet.ext}`}
          alt=""
          draggable={false}
          className="block w-full h-auto"
        />
      ))}
    </div>
  )
}
