import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
import { TimelessTreeApp } from './App'
import '../styles.css'
import { bootstrapTheme } from '../shared/apply-theme'
import { DiagnosticErrorBoundary, installRendererDiagnostics } from '../shared/diagnostics'
import { bootstrapLocale, bootstrapLocaleSync, LocaleProvider } from '../shared/locale'

bootstrapLocaleSync()
void bootstrapLocale()
void bootstrapTheme()
installRendererDiagnostics('timeless-tree')

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <DiagnosticErrorBoundary source="timeless-tree">
      <LocaleProvider>
        <TimelessTreeApp />
      </LocaleProvider>
    </DiagnosticErrorBoundary>
  </StrictMode>,
)
