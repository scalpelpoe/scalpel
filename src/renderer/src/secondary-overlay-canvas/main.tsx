import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import { App } from './App'
import '../styles.css'
import { bootstrapTheme } from '../shared/apply-theme'
import { DiagnosticErrorBoundary, installRendererDiagnostics } from '../shared/diagnostics'

void bootstrapTheme()
installRendererDiagnostics('secondary-overlay-canvas')

const root = createRoot(document.getElementById('root') as HTMLElement)
root.render(
  <StrictMode>
    <DiagnosticErrorBoundary source="secondary-overlay-canvas">
      <App />
    </DiagnosticErrorBoundary>
  </StrictMode>,
)
