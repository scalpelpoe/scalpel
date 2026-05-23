import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PoeVersionRoot } from '../shared/PoeVersionRoot'
import { App } from './App'
import '../styles.css'
import { bootstrapTheme } from '../shared/apply-theme'
import { DiagnosticErrorBoundary, installRendererDiagnostics } from '../shared/diagnostics'

void bootstrapTheme()
installRendererDiagnostics('cheat-sheets')

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <DiagnosticErrorBoundary source="cheat-sheets">
      <PoeVersionRoot>
        <App />
      </PoeVersionRoot>
    </DiagnosticErrorBoundary>
  </StrictMode>,
)
