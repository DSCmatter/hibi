import { randomUUID } from 'node:crypto'
import type { EventEmitter } from 'node:events'
import {
  type DiagnosticCode,
  processReasons,
  type SafeDiagnostic,
} from '../../shared/local-diagnostics.ts'

type Role = 'typst' | 'format'
type Service = {
  role: Role
  expected: boolean
  worker?: WeakRef<EventEmitter>
  exited?: (code: number) => void
}
const services = new Map<string, Service>()
const instances = new WeakMap<object, Service>()
let reporter:
  | ((
      code: DiagnosticCode,
      error: unknown,
      metadata: Pick<SafeDiagnostic, 'role' | 'reason' | 'exitCode'>,
    ) => void)
  | null = null

// Metadata only: no spawn, kill, restart, timing or worker-protocol authority.
export function diagnosticServiceName(role: Role): string {
  try {
    const name = `hibi-diagnostic-${randomUUID()}`
    if (services.size >= 64) {
      const oldest = services.keys().next().value
      if (oldest) consumeDiagnosticService(oldest)
    }
    services.set(name, { role, expected: false })
    return name
  } catch {
    return 'hibi-diagnostic-untracked'
  }
}

export function attachDiagnosticService(
  worker: EventEmitter,
  name: string,
): void {
  try {
    const service = services.get(name)
    if (service) {
      service.worker = new WeakRef(worker)
      instances.set(worker, service)
      service.exited = (code) => {
        if (code !== 0) return
        const ended = consumeDiagnosticService(name)
        if (ended && ended !== 'untracked' && !ended.expected) {
          try {
            reporter?.('COMPILER_PROCESS_FAILED', undefined, {
              role: ended.role,
              reason: 'unknown',
              exitCode: 0,
            })
          } catch {
            /* Expected stops and failure handling retain their policy. */
          }
        }
      }
      worker.once('exit', service.exited)
    }
  } catch {
    /* Diagnostic registration cannot block a compiler. */
  }
}

export function expectDiagnosticStop(worker: object): void {
  try {
    const service = instances.get(worker)
    if (service) service.expected = true
  } catch {
    /* Keep the owner's original termination path. */
  }
}

export function consumeDiagnosticService(
  name: unknown,
): Pick<Service, 'role' | 'expected'> | 'untracked' | null {
  if (name === 'hibi-diagnostic-untracked') return 'untracked'
  if (typeof name !== 'string' || !/^hibi-diagnostic-[a-f0-9-]{36}$/.test(name))
    return null
  const service = services.get(name)
  services.delete(name)
  const worker = service?.worker?.deref()
  if (worker) {
    instances.delete(worker)
    if (service?.exited) worker.removeListener('exit', service.exited)
  }
  return service
    ? { role: service.role, expected: service.expected }
    : 'untracked'
}

export function installOwnedFailureReporter(value: typeof reporter): void {
  reporter = value
}

export function reportOwnedFailure(
  code: DiagnosticCode,
  role: NonNullable<SafeDiagnostic['role']>,
  error?: unknown,
): void {
  try {
    reporter?.(code, error, { role })
  } catch {
    /* Never replace the owner's failure. */
  }
}

export function reportAnalysisProcessFailure(
  reason: unknown,
  exitCode: unknown,
): void {
  try {
    if (
      typeof reason !== 'string' ||
      !processReasons.includes(reason as (typeof processReasons)[number]) ||
      typeof exitCode !== 'number' ||
      !Number.isInteger(exitCode)
    )
      return
    reporter?.('ANALYSIS_PROCESS_FAILED', undefined, {
      role: 'analysis',
      reason: reason as (typeof processReasons)[number],
      exitCode,
    })
  } catch {
    /* No change to the analyzer's stop/recovery path. */
  }
}
