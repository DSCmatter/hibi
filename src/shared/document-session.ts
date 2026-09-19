import {
  type PreparedSourceOperation,
  type SourceBufferOptions,
  type SourceSnapshot,
  SourceStore,
} from './source-buffer.ts'
import {
  composeSourceChanges,
  type DocumentKey,
  type RawEdit,
  type SourceOperation,
} from './source-operations.ts'

type HistoryGroup = Readonly<{
  id: string
  origin: SourceOperation['origin']
  forward: readonly RawEdit[]
  inverse: readonly RawEdit[]
  before: SourceSnapshot
  after: SourceSnapshot
  beforeIdentity: object
  afterIdentity: object
  bytes: number
  operations: number
}>
export type SessionState = Readonly<{
  document: DocumentKey
  contentVersion: number
  dirty: boolean
  canUndo: boolean
  canRedo: boolean
}>
type SessionOptions = SourceBufferOptions & {
  historyBytes?: number
  historyGroups?: number
  /** Must synchronously enqueue recovery. It must not wait for acknowledgement. */
  enqueue: (operation: SourceOperation) => void
  onError: (error: unknown) => void
}
const editBytes = (changes: readonly RawEdit[]) =>
  changes.reduce((sum, change) => sum + change.insert.length * 2 + 48, 0)

/** Source authority and history live outside UI frameworks and editing widgets. */
export class DocumentSession {
  readonly #store: SourceStore
  readonly #options: SessionOptions
  readonly #listeners = new Set<() => void>()
  readonly #identities = new WeakMap<SourceSnapshot, object>()
  #undo: HistoryGroup[] = []
  #redo: HistoryGroup[] = []
  #saved: SourceSnapshot
  #contentIdentity: object = {}
  #savedIdentity = this.#contentIdentity
  #state: SessionState
  #dispatching = false
  #disposed = false
  #verification = 0
  #verificationTimer: ReturnType<typeof setTimeout> | undefined
  #cancelVerification: (() => void) | undefined
  #settled: Promise<void> = Promise.resolve()

  constructor(
    source: string,
    document: DocumentKey,
    version: number,
    options: SessionOptions,
  ) {
    this.#options = Object.freeze({ ...options })
    this.#store = new SourceStore(source, document, version, options)
    this.#saved = this.#store.snapshot()
    this.#identities.set(this.#saved, this.#contentIdentity)
    this.#state = Object.freeze({
      document: this.#saved.document,
      contentVersion: version,
      dirty: false,
      canUndo: false,
      canRedo: false,
    })
  }
  snapshot = () => this.#store.snapshot()
  state = () => this.#state
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }
  counters(reset = false) {
    return this.#store.counters(reset)
  }
  historySize() {
    return {
      groups: this.#undo.length + this.#redo.length,
      bytes: [...this.#undo, ...this.#redo].reduce(
        (sum, group) => sum + group.bytes,
        0,
      ),
    }
  }

  #publish(notify = true) {
    const current = this.snapshot()
    const next = {
      document: current.document,
      contentVersion: current.version,
      dirty: this.#contentIdentity !== this.#savedIdentity,
      canUndo: this.#undo.length > 0,
      canRedo: this.#redo.length > 0,
    }
    if (
      Object.keys(next).every(
        (key) =>
          next[key as keyof SessionState] ===
          this.#state[key as keyof SessionState],
      )
    )
      return false
    this.#state = Object.freeze(next)
    if (notify) this.#notify()
    return true
  }
  #notify() {
    for (const listener of [...this.#listeners]) {
      try {
        listener()
      } catch (error) {
        this.#options.onError(error)
      }
    }
  }
  #trim() {
    let bytes = this.historySize().bytes
    const maximumBytes = this.#options.historyBytes ?? 8 * 1024 * 1024
    const maximumGroups = this.#options.historyGroups ?? 128
    while (
      this.#undo.length &&
      (bytes > maximumBytes ||
        this.#undo.length + this.#redo.length > maximumGroups)
    )
      bytes -= this.#undo.shift()!.bytes
    while (
      this.#redo.length &&
      (bytes > maximumBytes || this.#redo.length > maximumGroups)
    )
      bytes -= this.#redo.shift()!.bytes
  }
  #record(prepared: PreparedSourceOperation) {
    const previous = this.#undo.at(-1),
      operation = prepared.operation
    const afterIdentity = {}
    let forward = operation.changes,
      inverse = prepared.inverse
    const merge =
      previous?.id === operation.historyGroup &&
      previous.origin === operation.origin &&
      previous.operations < 256 &&
      previous.bytes + editBytes(forward) + editBytes(inverse) < 128 * 1024
    if (merge) {
      forward = composeSourceChanges(
        previous.forward,
        forward,
        previous.before.utf16Length,
      )
      inverse = composeSourceChanges(
        inverse,
        previous.inverse,
        prepared.after.utf16Length,
      )
      this.#undo.pop()
      if (
        inverse.every(
          (edit) => prepared.after.sliceRaw(edit.from, edit.to) === edit.insert,
        )
      ) {
        this.#contentIdentity = previous.beforeIdentity
        this.#redo = []
        return
      }
    }
    this.#undo.push(
      Object.freeze({
        id: operation.historyGroup,
        origin: operation.origin,
        forward,
        inverse,
        before: merge ? previous.before : prepared.before,
        after: prepared.after,
        beforeIdentity: merge ? previous.beforeIdentity : this.#contentIdentity,
        afterIdentity,
        bytes: editBytes(forward) + editBytes(inverse),
        operations: merge ? previous.operations + 1 : 1,
      }),
    )
    this.#contentIdentity = afterIdentity
    this.#redo = []
    this.#trim()
  }
  #operation(
    changes: readonly RawEdit[],
    origin: SourceOperation['origin'],
    group: string,
  ): SourceOperation {
    const before = this.snapshot()
    return {
      document: before.document,
      operationId: crypto.randomUUID(),
      baseVersion: before.version,
      contentVersion: before.version + 1,
      origin,
      historyGroup: group,
      changes,
    }
  }
  #accept(
    operation: SourceOperation,
    history: (prepared: PreparedSourceOperation) => void,
    reconcile?: (prepared: PreparedSourceOperation) => void,
  ) {
    if (this.#disposed || this.#dispatching)
      throw new Error(
        'Document session is disposed or dispatching another operation.',
      )
    const prepared = this.#store.prepare(operation)
    this.#dispatching = true
    try {
      this.#store.commit(prepared)
      history(prepared)
      this.#identities.set(prepared.after, this.#contentIdentity)
      const changed = this.#publish(false)
      // Source is already savable when enqueue/reconcile or an observer runs.
      // Failures preserve accepted source and are reported, never rolled back.
      try {
        this.#options.enqueue(prepared.operation)
      } catch (error) {
        this.#options.onError(error)
      }
      try {
        reconcile?.(prepared)
      } catch (error) {
        this.#options.onError(error)
      }
      if (changed) this.#notify()
    } finally {
      this.#dispatching = false
    }
    this.#verifySaved()
    return prepared
  }
  edit(
    changes: readonly RawEdit[],
    origin: SourceOperation['origin'],
    historyGroup: string,
    reconcile?: (prepared: PreparedSourceOperation) => void,
  ) {
    if (origin === 'undo' || origin === 'redo')
      throw new Error('Use session history for undo and redo.')
    return this.#accept(
      this.#operation(changes, origin, historyGroup),
      (prepared) => this.#record(prepared),
      reconcile,
    )
  }
  undo(reconcile?: (prepared: PreparedSourceOperation) => void) {
    const group = this.#undo.at(-1)
    if (!group) return null
    return this.#accept(
      this.#operation(group.inverse, 'undo', group.id),
      () => {
        this.#undo.pop()
        this.#redo.push(group)
        this.#contentIdentity = group.beforeIdentity
      },
      reconcile,
    )
  }
  redo(reconcile?: (prepared: PreparedSourceOperation) => void) {
    const group = this.#redo.at(-1)
    if (!group) return null
    return this.#accept(
      this.#operation(group.forward, 'redo', group.id),
      () => {
        this.#redo.pop()
        this.#undo.push(group)
        this.#contentIdentity = group.afterIdentity
      },
      reconcile,
    )
  }
  markSaved(snapshot: SourceSnapshot) {
    const identity = this.#identities.get(snapshot)
    if (!identity)
      throw new Error('Saved snapshot does not belong to this session.')
    this.#saved = snapshot
    this.#savedIdentity = identity
    this.#publish()
    this.#verifySaved()
  }
  // Exact equality is deferred only for a different edit path that may return
  // to saved text. Normal commits never compare or hash the complete source.
  #verifySaved() {
    clearTimeout(this.#verificationTimer)
    this.#cancelVerification?.()
    this.#verificationTimer = undefined
    this.#cancelVerification = undefined
    const generation = ++this.#verification,
      current = this.snapshot(),
      saved = this.#saved
    if (
      this.#contentIdentity === this.#savedIdentity ||
      current.utf16Length !== saved.utf16Length ||
      current.utf8Bytes !== saved.utf8Bytes
    )
      return
    this.#settled = new Promise((resolve) => {
      this.#cancelVerification = resolve
      const comparison = current.compare(saved)
      const step = () => {
        if (this.#disposed || generation !== this.#verification) {
          resolve()
          return
        }
        const start = performance.now()
        do {
          const next = comparison.next()
          if (next.done) {
            if (next.value) {
              this.#contentIdentity = this.#savedIdentity
              this.#identities.set(current, this.#savedIdentity)
              this.#publish()
            }
            resolve()
            return
          }
        } while (performance.now() - start < 1)
        this.#verificationTimer = setTimeout(step, 0)
      }
      this.#verificationTimer = setTimeout(step, 0)
    })
  }
  settled() {
    return this.#settled
  }
  dispose() {
    this.#disposed = true
    this.#verification++
    clearTimeout(this.#verificationTimer)
    this.#cancelVerification?.()
    this.#verificationTimer = undefined
    this.#cancelVerification = undefined
    this.#listeners.clear()
    this.#undo = []
    this.#redo = []
  }
}
