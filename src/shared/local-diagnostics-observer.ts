import type { DiagnosticCode } from './local-diagnostics.ts'

type Reporter = (code: DiagnosticCode, error?: unknown, owner?: object) => void
let reporter: Reporter | null = null

// The desktop host installs this optional boundary. Exported sites do not.
// No framework, bridge, document subscription, queue or retained failure here.
export function installDiagnosticReporter(next: Reporter): () => void {
  reporter = next
  return () => {
    if (reporter === next) reporter = null
  }
}

export function reportDiagnosticFailure(
  code: DiagnosticCode,
  error?: unknown,
  owner?: object,
): void {
  try {
    reporter?.(code, error, owner)
  } catch {
    /* Never replace the original failure. */
  }
}
