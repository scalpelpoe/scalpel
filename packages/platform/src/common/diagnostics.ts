/** Recoverable failures inside the platform package are reported through this
 *  hook. The app registers its own reporter during wiring, so no OS backend
 *  needs to import application code. Until then only debug builds warn. */
export type DiagnosticReporter = (kind: string, error: unknown) => void
/** High-level, non-error trace lines (portal lifecycle, focus gates, ...). */
export type BreadcrumbReporter = (message: string, level?: 'info' | 'debug') => void

let reporter: DiagnosticReporter | null = null
let breadcrumb: BreadcrumbReporter | null = null

export function setDiagnosticReporter(next: DiagnosticReporter | null): void {
  reporter = next
}

export function setBreadcrumbReporter(next: BreadcrumbReporter | null): void {
  breadcrumb = next
}

export function reportDiagnostic(kind: string, error: unknown): void {
  if (reporter) {
    reporter(kind, error)
  } else if (process.env.SCALPEL_DEBUG_LOG) {
    const failure = error instanceof Error ? error : new Error(String(error))
    process.emitWarning(`[${kind}] ${failure.message}`)
  }
}

/** Records a recoverable trace line, without pulling app logging into a backend. */
export function reportBreadcrumb(message: string, level: 'info' | 'debug' = 'info'): void {
  breadcrumb?.(message, level)
}

/** @internal Test-only reset. */
export function __resetDiagnosticReporterForTests(): void {
  reporter = null
  breadcrumb = null
}
