import { useCallback, useEffect, useRef } from 'react'
import { createPanelDragController } from './panel-drag'
import type { GameRect } from '../../../plugin-sdk/src/types'
import { useActivatePlugin } from '../plugins/use-activate-plugin'

export function App({ pluginId }: { pluginId: string }): JSX.Element {
  const panelRef = useRef<ReturnType<typeof createPanelDragController> | null>(null)
  const onRegion = useCallback((rect: GameRect | null) => panelRef.current?.setRegion(rect), [])
  const { captured, error } = useActivatePlugin(pluginId, onRegion)
  const bodyRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | void>(undefined)

  // Mount the captured render into the body once both exist.
  useEffect(() => {
    if (!captured || !bodyRef.current) return
    panelRef.current = createPanelDragController(bodyRef.current, (rect) => {
      window.api.reportPanelRect(rect ? [{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }] : [])
    })
    cleanupRef.current = captured.render(bodyRef.current)
    return () => {
      if (typeof cleanupRef.current === 'function') cleanupRef.current()
      cleanupRef.current = undefined
      panelRef.current?.dispose()
      panelRef.current = null
    }
  }, [captured])

  return error ? (
    <div className="p-3 text-[12px] text-text-dim" style={{ pointerEvents: 'none' }}>
      Plugin error: {error}
    </div>
  ) : (
    // Full game-window-sized, transparent. The plugin owns absolute positioning
    // inside. pointer-events:none keeps the surface click-through at the DOM
    // level (the window is also OS-level click-through); a plugin that wants an
    // interactive element re-enables pointer-events on that element.
    <div ref={bodyRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
  )
}
