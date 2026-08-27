import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LauncherApp } from './App'
import './launcher.css'
import '../styles.css'
import { bootstrapTheme } from '../shared/apply-theme'
import { DiagnosticErrorBoundary, installRendererDiagnostics } from '../shared/diagnostics'
import { bootstrapLocale, bootstrapLocaleSync, LocaleProvider } from '../shared/locale'

bootstrapLocaleSync()
void bootstrapLocale()
void bootstrapTheme()
installRendererDiagnostics('launcher')

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <DiagnosticErrorBoundary source="launcher">
      <LocaleProvider>
        <LauncherApp />
      </LocaleProvider>
    </DiagnosticErrorBoundary>
  </StrictMode>,
)
