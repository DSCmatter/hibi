import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDocumentJournal,
  createJournalReceiver,
  sourceChange,
} from '../src/shared/document-journal.ts'

function fixture() {
  const state = { tabId: 'a', revision: 0, contentVersion: 0, markdown: '' }
  const receive = createJournalReceiver(
    () => state,
    (source) => {
      state.markdown = source
      state.contentVersion++
    },
    1024,
  )
  const change = (before, after, version) => ({
    ...sourceChange(before, after),
    tabId: 'a',
    revision: 0,
    baseVersion: version,
    contentVersion: version + 1,
  })
  return { state, receive, change }
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
