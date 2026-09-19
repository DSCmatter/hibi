import type { DocumentState } from './desktop'
import type { SourceStore } from './source-buffer'
import {
  parseSourceOperation,
  type SourceOperation,
} from './source-operations.ts'

/** One ordered UTF-16 replacement. The next content version is its sequence number. */
export type DocumentChange = {
  tabId: string
  revision: number
  baseVersion: number
  contentVersion: number
  from: number
  to: number
  insert: string
}
export type DocumentAcknowledgment = Pick<
  DocumentState,
  'tabId' | 'revision' | 'contentVersion'
> & { operationId?: string }
export type JournalMessage = DocumentChange | SourceOperation

export function sourceChange(before: string, after: string) {
  if (before === after) return null
  let from = 0,
    endBefore = before.length,
    endAfter = after.length
  while (
    from < endBefore &&
    from < endAfter &&
    before.charCodeAt(from) === after.charCodeAt(from)
  )
    from++
  while (
    endBefore > from &&
    endAfter > from &&
    before.charCodeAt(endBefore - 1) === after.charCodeAt(endAfter - 1)
  ) {
    endBefore--
    endAfter--
  }
  if (splitsSurrogate(before, from) || splitsSurrogate(after, from)) from--
  if (splitsSurrogate(before, endBefore) || splitsSurrogate(after, endAfter)) {
    endBefore++
    endAfter++
  }
  return { from, to: endBefore, insert: after.slice(from, endAfter) }
}
function splitsSurrogate(source: string, position: number) {
  return (
    /[\uD800-\uDBFF]/.test(source.charAt(position - 1)) &&
    /[\uDC00-\uDFFF]/.test(source.charAt(position))
  )
}
export function parseDocumentChange(value: unknown): DocumentChange {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid document change.')
  const change = value as DocumentChange
  if (
    typeof change.tabId !== 'string' ||
    !change.tabId ||
    change.tabId.length > 128 ||
    ![
      change.revision,
      change.baseVersion,
      change.contentVersion,
      change.from,
      change.to,
    ].every((value) => Number.isSafeInteger(value) && value >= 0) ||
    change.contentVersion !== change.baseVersion + 1 ||
    change.to < change.from ||
    typeof change.insert !== 'string' ||
    change.insert.length > 2 * 1024 * 1024 ||
    /[\uD800-\uDFFF]/u.test(change.insert)
  )
    throw new Error('Invalid document change.')
  return {
    tabId: change.tabId,
    revision: change.revision,
    baseVersion: change.baseVersion,
    contentVersion: change.contentVersion,
    from: change.from,
    to: change.to,
    insert: change.insert,
  }
}
const parseMessage = (value: unknown): JournalMessage =>
  value && typeof value === 'object' && 'document' in value
    ? parseSourceOperation(value)
    : parseDocumentChange(value)
const identity = (change: JournalMessage) =>
  'document' in change ? change.document : change
const key = (change: JournalMessage) => {
  const document = identity(change)
  return `${document.tabId}:${document.revision}:${change.contentVersion}`
}
const samePayload = (a: JournalMessage, b: JournalMessage) =>
  JSON.stringify(a) === JSON.stringify(b)

/** Both legacy replacements and atomic batches commit to one persistent recovery replica. */
export function createJournalReceiver(read: () => SourceStore) {
  const receipts = new Map<
    string,
    { change: JournalMessage; ack: DocumentAcknowledgment; bytes: number }
  >()
  let receiptSize = 0
  return (value: unknown): DocumentAcknowledgment => {
    const change = parseMessage(value)
    const previous = receipts.get(key(change))
    if (previous) {
      if (!samePayload(previous.change, change))
        throw new Error(
          'This change sequence was already used for different content.',
        )
      return previous.ack
    }
    const store = read(),
      current = store.snapshot(),
      document = identity(change)
    if (
      current.document.tabId !== document.tabId ||
      current.document.revision !== document.revision ||
      current.version !== change.baseVersion
    )
      throw new Error(
        'The document changed before these edits could be kept. Copy your unsaved text before reloading.',
      )
    let operation: SourceOperation
    if ('document' in change) operation = change
    else {
      // The legacy protocol allowed raw CRLF boundaries. Preserve that meaning
      // while giving the exact-operation kernel complete line-ending ownership.
      let { from, to, insert } = change
      if (
        from > 0 &&
        current.sliceRaw(from - 1, Math.min(current.utf16Length, from + 1)) ===
          '\r\n'
      ) {
        from--
        insert = `\r${insert}`
      }
      if (
        to > 0 &&
        to < current.utf16Length &&
        current.sliceRaw(to - 1, to + 1) === '\r\n'
      ) {
        to++
        insert += '\n'
      }
      operation = {
        document: { tabId: change.tabId, revision: change.revision },
        operationId: `legacy:${change.contentVersion}`,
        baseVersion: change.baseVersion,
        contentVersion: change.contentVersion,
        origin: 'source',
        historyGroup: 'legacy',
        changes: [{ from, to, insert }],
      }
    }
    store.commit(store.prepare(operation))
    const ack = {
      tabId: document.tabId,
      revision: document.revision,
      contentVersion: change.contentVersion,
      ...('document' in change ? { operationId: change.operationId } : {}),
    }
    const bytes = JSON.stringify(change).length * 2 + 128
    receipts.set(key(change), { change, ack, bytes })
    receiptSize += bytes
    while (receipts.size > 128 || receiptSize > 8 * 1024 * 1024) {
      const first = receipts.keys().next().value!
      receiptSize -= receipts.get(first)!.bytes
      receipts.delete(first)
    }
    return ack
  }
}

/** Send immediately for crash recovery. Barriers retry unacknowledged changes in order. */
export function createDocumentJournal(
  send: (change: JournalMessage) => Promise<DocumentAcknowledgment>,
) {
  type PendingChange = {
    change: JournalMessage
    promise: Promise<DocumentAcknowledgment>
    failed: boolean
    bytes: number
  }
  const pending = new Map<string, PendingChange>()
  let pendingBytes = 0
  const forget = (id: string, entry: PendingChange) => {
    if (pending.get(id) !== entry) return
    pending.delete(id)
    pendingBytes -= entry.bytes
  }
  const append = (value: JournalMessage) => {
    const change = parseMessage(value),
      document = identity(change)
    const existing = pending.get(key(change))
    if (existing) {
      if (!samePayload(existing.change, change))
        return Promise.reject(
          new Error('Conflicting document change sequence.'),
        )
      return existing.promise
    }
    const entry = {
      change,
      promise: null as unknown as Promise<DocumentAcknowledgment>,
      failed: false,
      bytes: JSON.stringify(change).length * 2 + 128,
    }
    pending.set(key(change), entry)
    pendingBytes += entry.bytes
    let delivery: Promise<DocumentAcknowledgment>
    try {
      delivery = send(change)
    } catch (error) {
      delivery = Promise.reject(error)
    }
    entry.promise = delivery
      .then((ack) => {
        if (
          ack.tabId !== document.tabId ||
          ack.revision !== document.revision ||
          ack.contentVersion !== change.contentVersion ||
          ('document' in change && ack.operationId !== change.operationId)
        )
          throw new Error('Could not confirm the latest document changes.')
        forget(key(change), entry)
        return ack
      })
      .catch((error) => {
        entry.failed = true
        throw error
      })
    void entry.promise.catch(() => {})
    return entry.promise
  }
  let flushing: Promise<void> | undefined
  return {
    append,
    appendOperation: (operation: SourceOperation) => append(operation),
    hasPending: () => pending.size > 0,
    pendingBytes: () => pendingBytes,
    flush() {
      const barrier = (flushing ?? Promise.resolve())
        .catch(() => {})
        .then(async () => {
          while (pending.size) {
            await Promise.allSettled(
              [...pending.values()].map((entry) => entry.promise),
            )
            for (const [id, entry] of pending) {
              if (!entry.failed) continue
              forget(id, entry)
              await append(entry.change)
            }
          }
        })
        .finally(() => {
          if (flushing === barrier) flushing = undefined
        })
      flushing = barrier
      return barrier
    },
  }
}
