import { journalMessageBytes } from '../../shared/document-journal.ts'
import type { DocumentSession } from '../../shared/document-session.ts'
import type {
  DocumentWorkerReply,
  DocumentWorkerRequest,
} from '../../shared/document-worker-protocol.ts'
import type { SourceSnapshot } from '../../shared/source-buffer.ts'
import type { SourceOperation } from '../../shared/source-operations.ts'
import type { SearchLocation } from '../../shared/source-search-index.ts'

type Transport = Pick<
  Worker,
  'postMessage' | 'terminate' | 'onmessage' | 'onerror' | 'onmessageerror'
>
export type FindAction = 'first' | 'next' | 'previous' | null
type Request = Extract<DocumentWorkerRequest, { type: 'find' }> & {
  action: FindAction
}
type ClientOptions = {
  changed: () => void
  pending: () => void
  result: (location: SearchLocation, action: FindAction) => void
  error: (message: string) => void
  worker?: () => Transport
  maximumPendingBytes?: number
  timeoutMs?: number
}

/** One cancelable derived replica, with bounded bootstrap/operation/query ownership. */
export class DocumentWorkerClient {
  readonly #session: DocumentSession
  readonly #options: ClientOptions
  readonly #detach: (() => void)[]
  #worker: Transport | null = null
  #epoch = ''
  #document: SourceSnapshot['document']
  #bootstrap: SourceSnapshot | null = null
  #loaded = false
  #ack = -1
  #sent = -1
  readonly #pending = new Map<number, number>()
  #bytes = 0
  #queued: SourceOperation[] = []
  #latest: Request | null = null
  #requestId = 0
  #sentRequest = 0
  #flight: number | null = null
  #canceling: number | null = null
  #startTimer: ReturnType<typeof setTimeout> | undefined
  #deadline: ReturnType<typeof setTimeout> | undefined
  #disposed = false
  #failed = false
  #restarts = 0
  constructor(session: DocumentSession, options: ClientOptions) {
    this.#session = session
    this.#options = options
    this.#document = session.snapshot().document
    this.#detach = [
      session.subscribeOperations((prepared) => {
        if (this.#disposed || this.#failed) return
        const operation = prepared.operation
        if (this.#bootstrap || this.#loaded) {
          const bytes = journalMessageBytes(operation)
          if (
            this.#bytes + bytes >
            (options.maximumPendingBytes ?? 8 * 1024 * 1024)
          ) {
            // Only the derived replica is replaced; canonical recovery never drops edits.
            this.#restart()
          } else {
            this.#pending.set(operation.contentVersion, bytes)
            this.#bytes += bytes
            this.#flight = this.#canceling = null
            if (this.#loaded) this.#sendOperation(operation)
            else this.#queued.push(operation)
          }
        }
        options.changed()
      }),
      session.subscribe(() => {
        if (this.#disposed) return
        const document = session.snapshot().document
        if (
          document.tabId !== this.#document.tabId ||
          document.revision !== this.#document.revision
        ) {
          this.#document = document
          this.#failed = false
          this.#restarts = 0
          this.#latest = null
          this.#restart()
          options.changed()
        }
      }),
    ]
  }
  find(query: string, from: number, to: number, action: FindAction = null) {
    if (this.#disposed || this.#failed) return
    if (!this.#worker && !this.#startTimer && !this.#bootstrap) this.#restart()
    this.#latest = {
      type: 'find',
      epoch: this.#epoch,
      id: ++this.#requestId,
      version: this.#session.snapshot().version,
      query,
      from,
      to,
      action,
    }
    this.#options.pending()
    this.#flushQuery()
  }
  #post(message: DocumentWorkerRequest) {
    if (!this.#worker) return false
    try {
      this.#worker.postMessage(message)
      return true
    } catch (error) {
      this.#fail(error)
      return false
    }
  }
  #sendOperation(operation: SourceOperation) {
    this.#sent = operation.contentVersion
    this.#post({ type: 'edit', epoch: this.#epoch, operation })
    this.#watch()
  }
  #flushQuery() {
    const request = this.#latest
    if (
      !request ||
      !this.#loaded ||
      this.#ack !== this.#session.snapshot().version ||
      this.#canceling !== null
    )
      return
    if (this.#flight !== null) {
      if (this.#flight !== request.id) {
        this.#canceling = this.#flight
        this.#post({
          type: 'cancel-find',
          epoch: this.#epoch,
          id: this.#flight,
        })
      }
      return
    }
    if (request.id === this.#sentRequest || request.version !== this.#ack)
      return
    this.#flight = this.#sentRequest = request.id
    this.#post({
      type: 'find',
      epoch: this.#epoch,
      id: request.id,
      version: request.version,
      query: request.query,
      from: request.from,
      to: request.to,
    })
    this.#watch()
  }
  #watch() {
    if (this.#deadline || !this.#worker) return
    if (
      !this.#bootstrap &&
      !this.#pending.size &&
      this.#flight === null &&
      this.#canceling === null
    )
      return
    this.#deadline = setTimeout(
      () => this.#fail(new Error('Find worker stopped responding.')),
      this.#options.timeoutMs ?? 5000,
    )
  }
  #reply(reply: DocumentWorkerReply) {
    if (this.#disposed || reply.epoch !== this.#epoch) return
    if (reply.type === 'ack') {
      if (!Number.isSafeInteger(reply.version) || reply.version > this.#sent) {
        this.#fail(
          new Error('Document worker acknowledged an unknown version.'),
        )
        return
      }
      if (reply.version <= this.#ack) return
      this.#ack = reply.version
      if (this.#bootstrap && reply.version >= this.#bootstrap.version)
        this.#bootstrap = null
      for (const [version, bytes] of this.#pending)
        if (version <= reply.version) {
          this.#pending.delete(version)
          this.#bytes -= bytes
        }
    } else if (reply.type === 'canceled') {
      if (reply.id !== this.#canceling) return
      this.#flight = this.#canceling = null
    } else if (reply.type === 'find') {
      if (reply.id === this.#flight) this.#flight = null
      const request = this.#latest
      if (
        request?.id === reply.id &&
        request.version === reply.version &&
        reply.version === this.#session.snapshot().version
      )
        this.#options.result(reply.location, request.action)
    } else if (reply.stage === 'replica') {
      this.#fail(new Error(reply.message))
      return
    } else {
      if (reply.id === this.#flight) this.#flight = null
      if (reply.id === this.#latest?.id) this.#options.error(reply.message)
    }
    clearTimeout(this.#deadline)
    this.#deadline = undefined
    this.#flushQuery()
    this.#watch()
  }
  #stop() {
    clearTimeout(this.#startTimer)
    clearTimeout(this.#deadline)
    this.#startTimer = this.#deadline = undefined
    this.#worker?.terminate()
    this.#worker = null
    this.#bootstrap = null
    this.#queued = []
    this.#pending.clear()
    this.#bytes = 0
    this.#loaded = false
    this.#flight = this.#canceling = null
    this.#ack = this.#sent = -1
    this.#sentRequest = 0
  }
  #restart() {
    this.#stop()
    this.#epoch = crypto.randomUUID()
    this.#requestId = 0
    if (this.#latest)
      this.#latest = {
        ...this.#latest,
        epoch: this.#epoch,
        id: ++this.#requestId,
        version: this.#session.snapshot().version,
        action:
          this.#latest.version === this.#session.snapshot().version
            ? this.#latest.action
            : null,
      }
    const epoch = this.#epoch
    this.#startTimer = setTimeout(() => {
      this.#startTimer = undefined
      void this.#start(epoch).catch((error) => {
        if (epoch === this.#epoch) this.#fail(error)
      })
    }, 0)
  }
  async #start(epoch: string) {
    if (this.#disposed || epoch !== this.#epoch) return
    const snapshot = this.#session.snapshot()
    this.#bootstrap = snapshot
    const chunks: string[] = []
    let pending = '',
      started = performance.now()
    for (const chunk of snapshot.chunks()) {
      pending += chunk
      while (pending.length >= 65536) {
        chunks.push(pending.slice(0, 65536))
        pending = pending.slice(65536)
      }
      if (performance.now() - started >= 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
        if (this.#disposed || epoch !== this.#epoch) return
        started = performance.now()
      }
    }
    if (pending) chunks.push(pending)
    const worker =
      this.#options.worker?.() ??
      new Worker(new URL('./document.worker.ts', import.meta.url), {
        type: 'module',
      })
    this.#worker = worker
    worker.onmessage = (event: MessageEvent<DocumentWorkerReply>) =>
      this.#reply(event.data)
    worker.onerror = (event) => {
      event.preventDefault()
      if (epoch === this.#epoch && this.#worker === worker)
        this.#fail(new Error('Could not start document find.'))
    }
    worker.onmessageerror = () => {
      if (epoch === this.#epoch && this.#worker === worker)
        this.#fail(new Error('Could not read a document worker reply.'))
    }
    this.#sent = snapshot.version
    this.#loaded = true
    if (
      !this.#post({
        type: 'load',
        epoch,
        document: snapshot.document,
        version: snapshot.version,
        chunks,
      })
    )
      return
    for (const operation of this.#queued) this.#sendOperation(operation)
    this.#queued = []
    this.#watch()
  }
  #fail(error: unknown) {
    this.#stop()
    if (this.#disposed) return
    if (this.#restarts++ < 1) {
      this.#restart()
      return
    }
    this.#failed = true
    this.#options.error(error instanceof Error ? error.message : String(error))
  }
  dispose() {
    this.#disposed = true
    this.#stop()
    for (const detach of this.#detach) detach()
    this.#latest = null
  }
}
