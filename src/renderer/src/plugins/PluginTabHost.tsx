import { useEffect, useRef } from 'react'
import { FullScreen } from '@icon-park/react'
import { PluginErrorBoundary } from './boundary'
import type { RegisteredTab } from './PluginHost'

interface Props {
  pluginTabs: RegisteredTab[]
  activeId: string
  onPluginError?: (id: string, error: Error) => void
}

export function PluginTabHost({ pluginTabs, activeId, onPluginError }: Props): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement>(null)
  const tab = pluginTabs.find((t) => t.pluginId === activeId)

  useEffect(() => {
    if (!containerRef.current || !tab) return
    let cleanup: (() => void) | void
    try {
      cleanup = tab.render(containerRef.current)
    } catch (e) {
      onPluginError?.(tab.pluginId, e instanceof Error ? e : new Error(String(e)))
      return
    }
    return () => {
      cleanup?.()
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [tab])

  if (!tab) return null
  return (
    <PluginErrorBoundary pluginId={activeId} onError={onPluginError}>
      <div className="flex flex-col flex-1 min-h-0">
        {tab.overlay && tab.overlay.mode !== 'annotation' && (
          <div className="flex justify-end px-2 py-1 shrink-0">
            <button
              type="button"
              title={`Open ${tab.overlay.title} in a window`}
              onClick={() => {
                void window.api.pluginOpenOverlay(tab.pluginId)
              }}
              className="btn-ghost text-text-dim hover:text-text flex items-center gap-1 text-[11px] px-2 py-1"
            >
              <FullScreen size={13} theme="outline" fill="currentColor" />
              Pop out
            </button>
          </div>
        )}
        <div ref={containerRef} className="flex flex-col flex-1 min-h-0 overflow-auto" />
      </div>
    </PluginErrorBoundary>
  )
}
