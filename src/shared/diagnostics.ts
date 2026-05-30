export type DiagnosticSource =
  | 'main'
  | 'app'
  | 'overlay'
  | 'whiteboard'
  | 'cheat-sheets'
  | 'cheat-sheet-preview'
  | 'pinned-zone'
  | 'secondary-overlay-canvas'
  | 'renderer'
  | 'plugin'
  | 'plugin-overlay'
  | 'regex-remote'

export interface SerializedDiagnosticError {
  name?: string
  message: string
  stack?: string
}

export interface RendererDiagnosticPayload {
  source: DiagnosticSource
  kind: 'window-error' | 'unhandled-rejection' | 'react-boundary' | 'action'
  error: SerializedDiagnosticError
  url?: string
  timestamp: string
  context?: string
}

export interface BugReportResult {
  reportPath: string
  githubIssueUrl: string
}

export function serializeDiagnosticError(input: unknown): SerializedDiagnosticError {
  if (input instanceof Error) {
    return {
      name: input.name,
      message: input.message || String(input),
      stack: input.stack,
    }
  }
  if (typeof input === 'object' && input !== null) {
    const maybe = input as { name?: unknown; message?: unknown; stack?: unknown; reason?: unknown }
    if (maybe.reason !== undefined) return serializeDiagnosticError(maybe.reason)
    return {
      name: typeof maybe.name === 'string' ? maybe.name : undefined,
      message: typeof maybe.message === 'string' ? maybe.message : safeStringify(input),
      stack: typeof maybe.stack === 'string' ? maybe.stack : undefined,
    }
  }
  return { message: String(input) }
}

function safeStringify(input: object): string {
  try {
    return JSON.stringify(input)
  } catch {
    return String(input)
  }
}
