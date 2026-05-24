import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './overlay'
import './styles.css'
import { bootstrapTheme } from './shared/apply-theme'
import { DiagnosticErrorBoundary, installRendererDiagnostics } from './shared/diagnostics'

void bootstrapTheme()
installRendererDiagnostics('overlay')

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <DiagnosticErrorBoundary source="overlay">
      <App />
    </DiagnosticErrorBoundary>
  </StrictMode>,
)
