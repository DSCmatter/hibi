import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDocumentJournal,
  createJournalReceiver,
  sourceChange,
} from '../src/shared/document-journal.ts'
import { SourceStore } from '../src/shared/source-buffer.ts'

function fixture() {
  const store = new SourceStore('', { tabId: 'a', revision: 0 }, 0, {
    maximumBytes: 1024,
  })
  const state = {
    tabId: 'a',
    revision: 0,
    get contentVersion() {
      return store.snapshot().version
    },
    get markdown() {
      return store.snapshot().materialize()
    },
  }
  const receive = createJournalReceiver(() => {
    store.reidentify(state)
    return store
  })
  const change = (before, after, version) => ({
    ...sourceChange(before, after),
    tabId: 'a',
    revision: 0,
    baseVersion: version,
    contentVersion: version + 1,
  })
  return { state, receive, change, store }
}

test('source deltas round trip Unicode boundaries, insertions, replacements, and deletions', () => {
  const values = [
    '',
    'a',
    '😀',
    '😎',
    '😀😀',
    'a😀b',
    'a😎b',
    'é',
    '## note\n\ntext',
    '[]()*&<>',
  ]
  for (const before of values)
    for (const after of values) {
      const edit = sourceChange(before, after)
      if (before === after) {
        assert.equal(edit, null)
        continue
      }
      assert.equal(
        before.slice(0, edit.from) + edit.insert + before.slice(edit.to),
        after,
      )
      assert.equal(/[\uD800-\uDFFF]/u.test(edit.insert), false)
    }
})

test('receiver enforces order and identity and deduplicates accepted retries', () => {
  const { state, receive, change } = fixture()
  const first = change('', 'hello', 0)
  assert.throws(() => receive(change('hello', 'hello!', 1)), /document changed/)
  const ack = receive(first)
  assert.deepEqual(receive(first), ack)
  assert.equal(state.contentVersion, 1)
  assert.throws(() => receive({ ...first, insert: 'other' }), /sequence/)
  for (const input of [
    { ...change('hello', 'hi', 1), tabId: 'b' },
    { ...change('hello', 'hi', 1), revision: 1 },
    { ...change('hello', 'hi', 1), from: -1 },
    { ...change('hello', 'hi', 1), to: 100 },
    { ...change('hello', 'hi', 1), insert: 'x'.repeat(1025) },
  ])
    assert.throws(() => receive(input))
  assert.equal(state.markdown, 'hello')
  receive(change('hello', '😀', 1))
  assert.throws(() => receive({ ...change('😀', 'x', 2), from: 1 }), /Unicode/)
  state.tabId = 'b'
  assert.deepEqual(receive(first), ack)
  assert.equal(state.markdown, '😀')
})

test('barriers recover lost acknowledgments and failed sends without duplicating edits', async () => {
  const { state, receive, change } = fixture()
  let sends = 0
  const journal = createDocumentJournal(async (request) => {
    sends++
    if (sends === 1) {
      receive(request)
      throw new Error('lost acknowledgment')
    }
    if (sends === 2) throw new Error('not delivered')
    return receive(request)
  })
  await assert.rejects(journal.append(change('', 'a', 0)))
  await assert.rejects(journal.append(change('a', 'ab', 1)))
  await journal.flush()
  assert.equal(state.markdown, 'ab')
  assert.equal(state.contentVersion, 2)
  assert.equal(journal.hasPending(), false)
  const previous = journal.flush()
  void journal.append(change('ab', 'abc', 2))
  await journal.flush()
  await previous
  assert.equal(state.markdown, 'abc')
})

test('a failed barrier blocks dependent actions and retains its pending edit for retry', async () => {
  const { state, receive, change } = fixture()
  let failed = true
  const journal = createDocumentJournal(async (request) => {
    if (failed) throw new Error('unavailable')
    return receive(request)
  })
  await assert.rejects(journal.append(change('', 'kept', 0)))
  let saved = false
  await assert.rejects(
    journal.flush().then(() => {
      saved = true
    }),
    /unavailable/,
  )
  assert.equal(saved, false)
  assert.equal(journal.hasPending(), true)
  failed = false
  await journal.flush()
  assert.equal(state.markdown, 'kept')
})

test('atomic operations share legacy ordering and reject partial batches and conflicting receipts', async () => {
  const { state, receive, change, store } = fixture()
  const journal = createDocumentJournal(async (message) => receive(message))
  await journal.append(change('', 'abcdef', 0))
  const operation = {
    document: { tabId: 'a', revision: 0 },
    operationId: 'batch',
    baseVersion: 1,
    contentVersion: 2,
    origin: 'visual',
    historyGroup: 'format',
    changes: [
      { from: 0, to: 1, insert: 'A' },
      { from: 5, to: 6, insert: 'F' },
    ],
  }
  assert.throws(() =>
    receive({
      ...operation,
      changes: [operation.changes[0], { from: 99, to: 99, insert: 'invalid' }],
    }),
  )
  assert.equal(state.markdown, 'abcdef')
  const ack = await journal.appendOperation(operation)
  assert.equal(ack.operationId, 'batch')
  assert.equal(state.markdown, 'AbcdeF')
  assert.deepEqual(receive(operation), ack)
  assert.throws(
    () => receive({ ...operation, operationId: 'conflict' }),
    /sequence/,
  )
  assert.equal(store.snapshot().version, 2)
  await journal.append(change('AbcdeF', 'AbcdeF!', 2))
  assert.equal(state.markdown, 'AbcdeF!')
  assert.equal(journal.pendingBytes(), 0)
})

test('synchronous transport failure retains an operation and pending-byte accounting until retry', async () => {
  const { receive, change } = fixture()
  let fail = true
  const journal = createDocumentJournal((message) => {
    if (fail) throw new Error('transport stopped')
    return Promise.resolve(receive(message))
  })
  await assert.rejects(
    journal.append(change('', 'kept', 0)),
    /transport stopped/,
  )
  assert.ok(journal.pendingBytes() > 0)
  assert.equal(journal.hasPending(), true)
  fail = false
  await journal.flush()
  assert.equal(journal.pendingBytes(), 0)
})

test('legacy raw line-ending changes preserve meaning without native whole-source reconstruction', () => {
  const store = new SourceStore('a\r\nb'.repeat(100_000), {
    tabId: 'a',
    revision: 0,
  })
  const receive = createJournalReceiver(() => store)
  store.counters(true)
  receive({
    tabId: 'a',
    revision: 0,
    baseVersion: 0,
    contentVersion: 1,
    from: 1,
    to: 2,
    insert: '',
  })
  assert.equal(store.counters().materializations, 0)
  assert.equal(store.snapshot().sliceRaw(0, 6), 'a\nba\r\n')
})
