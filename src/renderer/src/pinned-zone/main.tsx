import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PoeVersionRoot } from '../shared/PoeVersionRoot'
import { App } from './App'
import '../styles.css'
import { bootstrapTheme } from '../shared/apply-theme'
import { DiagnosticErrorBoundary, installRendererDiagnostics } from '../shared/diagnostics'

void bootstrapTheme()
installRendererDiagnostics('pinned-zone')

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <DiagnosticErrorBoundary source="pinned-zone">
      <PoeVersionRoot>
        <App />
      </PoeVersionRoot>
    </DiagnosticErrorBoundary>
  </StrictMode>,
)
