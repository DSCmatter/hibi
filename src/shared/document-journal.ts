import type { DocumentState } from './desktop'
import { exceedsUtf8Limit } from './text-size.ts'

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
>

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
const key = (change: DocumentChange) =>
  `${change.tabId}:${change.revision}:${change.contentVersion}`
const samePayload = (a: DocumentChange, b: DocumentChange) =>
  a.from === b.from && a.to === b.to && a.insert === b.insert

/** Accepted changes are immediately folded into the main-process recovery snapshot. */
export function createJournalReceiver(
  read: () => Pick<
    DocumentState,
    'tabId' | 'revision' | 'contentVersion' | 'markdown'
  >,
  write: (source: string) => void,
  maximumBytes: number,
) {
  const receipts = new Map<
    string,
    { change: DocumentChange; ack: DocumentAcknowledgment }
  >()
  let receiptSize = 0
  return (value: unknown): DocumentAcknowledgment => {
    const change = parseDocumentChange(value)
    const previous = receipts.get(key(change))
    if (previous) {
      if (!samePayload(previous.change, change))
        throw new Error(
          'This change sequence was already used for different content.',
        )
      return previous.ack
    }
    const current = read()
    if (
      current.tabId !== change.tabId ||
      current.revision !== change.revision ||
      current.contentVersion !== change.baseVersion
    )
      throw new Error(
        'The document changed before these edits could be kept. Copy your unsaved text before reloading.',
      )
    if (
      change.to > current.markdown.length ||
      splitsSurrogate(current.markdown, change.from) ||
      splitsSurrogate(current.markdown, change.to)
    )
      throw new Error(
        'The document change is outside the text or splits a Unicode character.',
      )
    const source =
      current.markdown.slice(0, change.from) +
      change.insert +
      current.markdown.slice(change.to)
    if (source === current.markdown || exceedsUtf8Limit(source, maximumBytes))
      throw new Error('The document change is empty or exceeds the size limit.')
    write(source)
    const ack = {
      tabId: change.tabId,
      revision: change.revision,
      contentVersion: change.contentVersion,
    }
    receipts.set(key(change), { change, ack })
    receiptSize += change.insert.length + 128
    while (receipts.size > 128 || receiptSize > 4 * 1024 * 1024) {
      const first = receipts.keys().next().value!
      receiptSize -= receipts.get(first)!.change.insert.length + 128
      receipts.delete(first)
    }
    return ack
  }
}

/** Send immediately for crash recovery. Barriers retry unacknowledged changes in order. */
export function createDocumentJournal(
  send: (change: DocumentChange) => Promise<DocumentAcknowledgment>,
) {
  const pending = new Map<
    string,
    {
      change: DocumentChange
      promise: Promise<DocumentAcknowledgment>
      failed: boolean
    }
  >()
  const append = (value: DocumentChange) => {
    const change = parseDocumentChange(value)
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
    }
    entry.promise = send(change)
      .then((ack) => {
        if (
          ack.tabId !== change.tabId ||
          ack.revision !== change.revision ||
          ack.contentVersion !== change.contentVersion
        )
          throw new Error('Could not confirm the latest document changes.')
        pending.delete(key(change))
        return ack
      })
      .catch((error) => {
        entry.failed = true
        throw error
      })
    pending.set(key(change), entry)
    void entry.promise.catch(() => {})
    return entry.promise
  }
  let flushing: Promise<void> | undefined
  return {
    append,
    hasPending: () => pending.size > 0,
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
              pending.delete(id)
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
