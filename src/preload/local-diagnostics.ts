import {
  type DiagnosticSession,
  decodeDiagnostic,
  decodeDiagnosticSession,
  diagnosticLimits,
} from '../shared/local-diagnostics.ts'
import {
  DiagnosticAdmission,
  DiagnosticQueue,
} from '../shared/local-diagnostics-budget.ts'

// This request callback must be Electron's raw transport, never Hibi's journal
// wrapper. Renderer code has no queue: this is the generation's only backlog.
export class DiagnosticProducer {
  private readonly request: (
    operation: 'hello' | 'batch',
    token?: string,
    body?: string,
  ) => Promise<unknown>
  private session: DiagnosticSession | null = null
  private queue = new DiagnosticQueue('release', 'producer')
  private admission = new DiagnosticAdmission('release')
  private timer: ReturnType<typeof setTimeout> | undefined
  private alive = true
  private inFlight = true
  private inFlightBytes = 0
  private dropped = 0
  private readonly unload = () => this.dispose()
  readonly configuration: Promise<string | null>

  constructor(
    request: (
      operation: 'hello' | 'batch',
      token?: string,
      body?: string,
    ) => Promise<unknown>,
  ) {
    this.request = request
    this.configuration = this.connect()
    try {
      this.host.addEventListener?.('unload', this.unload, { once: true })
    } catch {
      this.dispose()
    }
  }

  private get host() {
    return globalThis as typeof globalThis & {
      addEventListener?: (
        event: 'unload',
        listener: () => void,
        options: { once: true },
      ) => void
      removeEventListener?: (event: 'unload', listener: () => void) => void
    }
  }

  private async connect(): Promise<string | null> {
    try {
      const config = decodeDiagnosticSession(await this.request('hello'))
      if (!this.alive || !config) {
        this.dispose()
        return null
      }
      const previous = this.queue
      this.session = config
      this.queue = new DiagnosticQueue(config.profile, 'producer')
      this.admission = new DiagnosticAdmission(config.profile)
      while (previous.size.records)
        for (const wire of previous.take()) this.queue.push(wire)
      this.inFlight = false
      this.schedule()
      return JSON.stringify(config)
    } catch {
      this.dispose()
      return null
    }
  }

  record(wire: unknown): boolean {
    if (!this.alive) return false
    const record = decodeDiagnostic(
      wire,
      this.session?.profile ?? 'release',
      true,
    )
    if (!record || !this.admission.admit(record.code, Date.now())) return false
    const accepted = this.queue.push(JSON.stringify(record))
    this.schedule()
    return accepted
  }

  private schedule() {
    if (
      !this.alive ||
      this.inFlight ||
      !this.session ||
      !this.queue.size.records
    )
      return
    if (
      this.queue.size.records >= diagnosticLimits.batchRecords ||
      this.queue.size.bytes >= (diagnosticLimits.batchBytes - 64) / 2
    ) {
      this.flush()
      return
    }
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.flush()
    }, diagnosticLimits.flushMs)
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    if (
      !this.alive ||
      this.inFlight ||
      !this.session ||
      !this.queue.size.records
    )
      return
    this.summarizeDrops()
    // JSON quoting can double each input byte, plus array separators.
    const batch = this.queue.take((diagnosticLimits.batchBytes - 64) / 2)
    const body = JSON.stringify(batch)
    if (body.length > diagnosticLimits.batchBytes) {
      this.dispose()
      return
    }
    this.inFlight = true
    this.inFlightBytes = body.length
    try {
      void this.request('batch', this.session.token, body).then(
        (accepted) => {
          if (!this.alive) return
          this.inFlight = false
          this.inFlightBytes = 0
          if (accepted !== true) {
            this.dispose()
            return
          }
          this.summarizeDrops()
          this.schedule()
        },
        () => this.dispose(),
      )
    } catch {
      this.dispose()
    }
  }

  private summarizeDrops() {
    this.dropped = Math.min(
      diagnosticLimits.counter,
      this.dropped + this.admission.takeDropped() + this.queue.takeDropped(),
    )
    if (
      this.dropped &&
      this.queue.push(
        JSON.stringify({
          code: 'DIAGNOSTICS_DROPPED',
          stackStatus: 'unavailable',
          count: this.dropped,
        }),
      )
    )
      this.dropped = 0
  }

  dispose(): void {
    this.alive = false
    try {
      this.host.removeEventListener?.('unload', this.unload)
    } catch {
      /* The frame may already be gone. */
    }
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    this.queue.clear()
    this.dropped = 0
    this.session = null
    this.inFlightBytes = 0
  }

  get status() {
    return {
      active: this.alive,
      pending: this.queue.size,
      inFlight: this.inFlight,
      inFlightBytes: this.inFlightBytes,
      timer: !!this.timer,
    }
  }
}
