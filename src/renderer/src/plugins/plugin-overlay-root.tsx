import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { DiagnosticSource } from '@shared/diagnostics'
import { bootstrapTheme } from '../shared/apply-theme'
import { DiagnosticErrorBoundary, installRendererDiagnostics } from '../shared/diagnostics'
import { bootstrapLocale, bootstrapLocaleSync, LocaleProvider } from '../shared/locale'

export function mountPluginOverlayRoot(
  sourceName: DiagnosticSource,
  AppComponent: (props: { pluginId: string }) => JSX.Element,
): void {
  bootstrapLocaleSync()
  void bootstrapLocale()
  void bootstrapTheme()
  installRendererDiagnostics(sourceName)

  // Subscribe at module load (synchronously, before React mounts) so we never
  // miss the one-shot init IPC: main sends 'plugin-overlay:init' during the
  // window's first show, which can arrive before a useEffect-registered listener.
  let initialPluginId: string | null = null
  const idListeners = new Set<(id: string) => void>()
  window.api.onPluginOverlayInit((id) => {
    initialPluginId = id
    for (const listener of idListeners) listener(id)
  })

  function Root(): JSX.Element | null {
    const [pluginId, setPluginId] = useState<string | null>(initialPluginId)
    useEffect(() => {
      if (pluginId) return
      idListeners.add(setPluginId)
      return () => {
        idListeners.delete(setPluginId)
      }
    }, [pluginId])
    if (!pluginId) return null
    return <AppComponent pluginId={pluginId} />
  }

  const root = document.getElementById('root')!
  createRoot(root).render(
    <StrictMode>
      <DiagnosticErrorBoundary source={sourceName}>
        <LocaleProvider>
          <Root />
        </LocaleProvider>
      </DiagnosticErrorBoundary>
    </StrictMode>,
  )
}
