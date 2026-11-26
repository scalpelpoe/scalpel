import { reportDiagnostic } from '../../common/diagnostics'

/** Linux mechanisms report through the package's generic reporter so the app
 *  never needs a Linux-only API name. The wrapper keeps Linux call sites honest
 *  about which subsystem emitted the failure. */
export function reportLinuxDiagnostic(kind: string, error: unknown): void {
  reportDiagnostic(kind, error)
}
