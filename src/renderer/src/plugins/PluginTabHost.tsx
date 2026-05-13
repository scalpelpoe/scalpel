import { useEffect, useRef } from 'react'
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
      <div ref={containerRef} className="flex flex-col flex-1 min-h-0 overflow-auto" />
    </PluginErrorBoundary>
  )
}
