import { Component, type ErrorInfo, type ReactNode } from 'react'
import type { DiagnosticSource, RendererDiagnosticPayload } from '@shared/diagnostics'
import { serializeDiagnosticError } from '@shared/diagnostics'

let installed = false
let toastTimer: ReturnType<typeof setTimeout> | null = null

function devToast(message: string): void {
  if (!import.meta.env.DEV) return
  let el = document.getElementById('scalpel-dev-error-toast')
  if (!el) {
    el = document.createElement('button')
    el.id = 'scalpel-dev-error-toast'
    ;(el as HTMLButtonElement).type = 'button'
    el.style.cssText = [
      'position:fixed',
      'right:12px',
      'top:12px',
      'z-index:2147483647',
      'max-width:360px',
      'padding:10px 12px',
      'border:1px solid #ef4444',
      'background:#2a1010',
      'color:white',
      'font:12px/1.35 system-ui,sans-serif',
      'text-align:left',
      'box-shadow:0 10px 24px rgba(0,0,0,.35)',
      'cursor:pointer',
    ].join(';')
    el.onclick = () => window.api.openDevTools()
    document.body.appendChild(el)
  }
  el.textContent = `Action failed. DevTools opened. ${message}`
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    el?.remove()
    toastTimer = null
  }, 8000)
}

export function reportDiagnosticError(
  source: DiagnosticSource,
  kind: RendererDiagnosticPayload['kind'],
  error: unknown,
  context?: string,
): void {
  const serialized = serializeDiagnosticError(error)
  devToast(serialized.message)
  window.api.reportRendererError({
    source,
    kind,
    error: serialized,
    url: window.location.href,
    timestamp: new Date().toISOString(),
    context,
  })
}

export function installRendererDiagnostics(source: DiagnosticSource): void {
  if (installed) return
  installed = true
  window.addEventListener('error', (event) => {
    reportDiagnosticError(source, 'window-error', event.error ?? event.message)
  })
  window.addEventListener('unhandledrejection', (event) => {
    reportDiagnosticError(source, 'unhandled-rejection', event.reason)
  })
}

interface BoundaryProps {
  source: DiagnosticSource
  children: ReactNode
}

interface BoundaryState {
  error: Error | null
}

export class DiagnosticErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportDiagnosticError(this.props.source, 'react-boundary', error, info.componentStack ?? undefined)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-bg-solid p-6 text-center text-text">
          <div className="flex max-w-sm flex-col gap-2">
            <div className="text-sm font-semibold text-red-400">Something crashed</div>
            <div className="text-xs text-text-dim">{this.state.error.message}</div>
            <button className="mx-auto mt-2 px-3 py-1 text-xs text-text-dim" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
