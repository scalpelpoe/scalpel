import { useEffect, useRef } from 'react'
import { Chrome } from '../secondary-overlay/Chrome'
import { useActivatePlugin } from '../plugins/use-activate-plugin'
import { divCardArtMap, iconMap, initIconMap, initPoeVersion, mergeIconCache } from '../shared/constants'

/** Shape published to globalThis.__scalpel so getItemIcon works in this window. */
interface ScalpelGlobal {
  iconMap: Record<string, string>
  divCardArtMap: Map<string, string>
}

export function App({ pluginId }: { pluginId: string }): JSX.Element {
  const { captured, error } = useActivatePlugin(pluginId)
  const bodyRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | void>(undefined)

  // Plugin overlays are a separate BrowserWindow from the main overlay, so they
  // never inherit the __scalpel.iconMap publish that overlay/App.tsx does.
  // Without this, economy (and any plugin using getItemIcon) shows empty placeholders.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const state = await window.api.getOverlayState().catch(() => null)
      if (cancelled) return
      const poeVersion: 1 | 2 = (state?.poeVersion as 1 | 2) ?? 1
      initPoeVersion(poeVersion)
      initIconMap(poeVersion)
      ;(globalThis as unknown as { __scalpel?: ScalpelGlobal }).__scalpel = {
        iconMap,
        divCardArtMap,
      }
      const cache = await window.api.getIconCache().catch(() => ({}))
      if (!cancelled) mergeIconCache(cache)
    })()
    const unsub = window.api.onIconCacheUpdated(mergeIconCache)
    return () => {
      cancelled = true
      unsub()
    }
  }, [])

  // Mount the captured render into the body once both exist.
  useEffect(() => {
    if (!captured || !bodyRef.current) return
    cleanupRef.current = captured.render(bodyRef.current)
    return () => {
      if (typeof cleanupRef.current === 'function') cleanupRef.current()
      cleanupRef.current = undefined
    }
  }, [captured])

  return (
    <Chrome
      headerContent={<span className="text-text text-sm font-medium">{captured?.opts.title ?? ''}</span>}
      onClose={() => {
        void window.api.pluginCloseOverlay(pluginId)
      }}
    >
      {error ? (
        <div className="p-3 text-[12px] text-text-dim">Plugin error: {error}</div>
      ) : (
        <div ref={bodyRef} className="flex-1 overflow-auto" />
      )}
    </Chrome>
  )
}
