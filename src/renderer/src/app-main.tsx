import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppWindow } from './AppWindow'
import './styles.css'
import { bootstrapTheme } from './shared/apply-theme'
import { DiagnosticErrorBoundary, installRendererDiagnostics } from './shared/diagnostics'

void bootstrapTheme()
installRendererDiagnostics('app')

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <DiagnosticErrorBoundary source="app">
      <AppWindow />
    </DiagnosticErrorBoundary>
  </StrictMode>,
)
