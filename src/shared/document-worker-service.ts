import type {
  DocumentWorkerReply,
  DocumentWorkerRequest,
} from './document-worker-protocol.ts'
import { SourceStore } from './source-buffer.ts'
import { SourceMaintenance } from './source-maintenance.ts'
import { SourceSearchIndex } from './source-search-index.ts'

type FindRequest = Extract<DocumentWorkerRequest, { type: 'find' }>

/** Trusted derived replica. The renderer/native journal remain the source authority. */
export class DocumentWorkerService {
  readonly #post: (reply: DocumentWorkerReply) => void
  #store: SourceStore | null = null
  #maintenance: SourceMaintenance | null = null
  #epoch = ''
  #index: SourceSearchIndex | null = null
  #query = ''
  #findId = 0
  #request: FindRequest | null = null
  #work: Generator<unknown, unknown> | null = null
  #stage: 'build' | 'locate' = 'build'
  #timer: ReturnType<typeof setTimeout> | undefined
  #disposed = false
  constructor(post: (reply: DocumentWorkerReply) => void) {
    this.#post = post
  }
  #cancel() {
    clearTimeout(this.#timer)
    this.#timer = undefined
    this.#work?.return(undefined)
    this.#work = null
    this.#request = null
  }
  #fail(stage: 'replica' | 'find', error: unknown, id = this.#request?.id) {
    this.#cancel()
    this.#index = null
    if (stage === 'replica') {
      this.#maintenance?.dispose()
      this.#maintenance = null
      this.#store = null
    }
    this.#post({
      type: 'error',
      epoch: this.#epoch,
      stage,
      ...(id === undefined ? {} : { id }),
      message: error instanceof Error ? error.message : String(error),
    })
  }
  receive(message: DocumentWorkerRequest) {
    if (this.#disposed) return
    try {
      if (
        !message ||
        typeof message.epoch !== 'string' ||
        !/^[\w.:-]{1,128}$/.test(message.epoch)
      )
        throw new Error('Invalid document worker identity.')
      if (message.type === 'load') {
        this.#cancel()
        this.#maintenance?.dispose()
        this.#maintenance = null
        this.#index = null
        this.#store = null
        this.#epoch = message.epoch
        this.#findId = 0
        if (
          !Array.isArray(message.chunks) ||
          message.chunks.length > 8192 ||
          message.chunks.some(
            (chunk) => typeof chunk !== 'string' || chunk.length > 65536,
          ) ||
          message.chunks.reduce((sum, chunk) => sum + chunk.length, 0) >
            32 * 1024 * 1024
        )
          throw new Error('Document worker bootstrap exceeds its limit.')
        this.#store = new SourceStore(
          message.chunks,
          message.document,
          message.version,
          { maximumBytes: 32 * 1024 * 1024 },
        )
        const store = this.#store
        this.#maintenance = new SourceMaintenance(
          store,
          (change) => {
            store.commitCompaction(change)
            this.#index?.adoptStorage(change)
          },
          (error) => this.#fail('replica', error),
        )
        this.#post({
          type: 'ack',
          epoch: this.#epoch,
          version: this.#store.snapshot().version,
        })
        return
      }
      if (message.epoch !== this.#epoch) return
      if (!this.#store) throw new Error('Document worker is not initialized.')
      if (message.type === 'edit') {
        const prepared = this.#store.prepare(message.operation)
        this.#cancel()
        this.#index = null
        this.#store.commit(prepared)
        this.#maintenance!.changed(
          prepared.operation.changes.reduce(
            (sum, edit) => sum + edit.to - edit.from + edit.insert.length,
            0,
          ),
        )
        this.#post({
          type: 'ack',
          epoch: this.#epoch,
          version: prepared.after.version,
        })
      } else if (message.type === 'cancel-find') {
        if (this.#request?.id === message.id) {
          this.#cancel()
          if (!this.#index?.state().complete) this.#index = null
        }
        this.#post({ type: 'canceled', epoch: this.#epoch, id: message.id })
      } else if (message.type === 'find') {
        if (
          !Number.isSafeInteger(message.id) ||
          message.id < 1 ||
          message.version !== this.#store.snapshot().version
        )
          throw new Error('Find request is stale.')
        if (message.id <= this.#findId) return
        this.#findId = message.id
        if (
          !Number.isSafeInteger(message.from) ||
          !Number.isSafeInteger(message.to) ||
          message.from < 0 ||
          message.to < message.from ||
          message.to > this.#store.snapshot().normalizedLength
        )
          throw new Error('Find selection is outside its source snapshot.')
        if (typeof message.query !== 'string' || message.query.length > 65536)
          throw new Error('Find text is too long.')
        if (!this.#index || message.query !== this.#query) {
          this.#cancel()
          this.#index = new SourceSearchIndex(
            this.#store.snapshot(),
            message.query,
          )
          this.#query = message.query
          this.#stage = 'build'
          this.#work = this.#index.build()
        } else if (this.#stage !== 'build' || !this.#work) {
          this.#cancel()
          this.#stage = 'locate'
          this.#work = this.#index.locate(message.from, message.to)
        }
        this.#request = { ...message }
        this.#schedule()
      } else throw new Error('Unknown document worker request.')
    } catch (error) {
      this.#fail(
        message?.type === 'find' ? 'find' : 'replica',
        error,
        message?.type === 'find' ? message.id : undefined,
      )
    }
  }
  #schedule() {
    if (this.#timer || !this.#work) return
    this.#timer = setTimeout(() => {
      this.#timer = undefined
      const started = performance.now()
      try {
        while (this.#work && performance.now() - started < 2) {
          const step = this.#work.next()
          if (!step.done) continue
          const request = this.#request!
          if (this.#stage === 'build') {
            this.#stage = 'locate'
            this.#work = this.#index!.locate(request.from, request.to)
          } else {
            this.#work = null
            this.#post({
              type: 'find',
              epoch: this.#epoch,
              id: request.id,
              version: request.version,
              location: step.value as Extract<
                DocumentWorkerReply,
                { type: 'find' }
              >['location'],
            })
          }
        }
        this.#schedule()
      } catch (error) {
        this.#fail('find', error)
      }
    }, 0)
  }
  dispose() {
    this.#disposed = true
    this.#cancel()
    this.#maintenance?.dispose()
    this.#maintenance = null
    this.#index = null
    this.#store = null
  }
}
