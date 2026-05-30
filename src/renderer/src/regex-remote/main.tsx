import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RegexRemote } from './RegexRemote'
import '../styles.css'
import { bootstrapTheme } from '../shared/apply-theme'
import { DiagnosticErrorBoundary, installRendererDiagnostics } from '../shared/diagnostics'

void bootstrapTheme()
installRendererDiagnostics('regex-remote')

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <DiagnosticErrorBoundary source="regex-remote">
      <RegexRemote />
    </DiagnosticErrorBoundary>
  </StrictMode>,
)
