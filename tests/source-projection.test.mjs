import assert from 'node:assert/strict'
import test from 'node:test'
import { EditorState } from '@codemirror/state'
import { DocumentSession } from '../src/shared/document-session.ts'
import { SourceStore } from '../src/shared/source-buffer.ts'
import {
  editorChangesFromSource,
  normalizedChunks,
  normalizedSource,
  preferredLineBreak,
  sourceChangesFromEditor,
} from '../src/shared/source-projection.ts'

const commit = (store, changes) => {
  const before = store.snapshot()
  return store.commit(
    store.prepare({
      document: before.document,
      operationId: crypto.randomUUID(),
      historyGroup: 'test',
      origin: 'source',
      baseVersion: before.version,
      contentVersion: before.version + 1,
      changes,
    }),
  )
}
const cmChanges = (transaction) => {
  const changes = []
  transaction.changes.iterChanges((from, to, _newFrom, _newTo, insert) =>
    changes.push({ from, to, insert: insert.toString() }),
  )
  return changes
}

test('accepted CM filters and sequential transforms become exact raw operations', () => {
  const source = 'a\r\nb\nc\r'
  const operations = []
  const session = new DocumentSession(
    source,
    { tabId: 'test', revision: 0 },
    0,
    {
      enqueue: (operation) => operations.push(operation),
      onError(error) {
        throw error
      },
    },
  )
  const state = EditorState.create({
    doc: normalizedSource(source),
    extensions: [
      EditorState.transactionFilter.of((transaction) =>
        transaction.docChanged
          ? [
              transaction,
              {
                changes: { from: transaction.newDoc.length, insert: '!' },
                sequential: true,
              },
            ]
          : transaction,
      ),
    ],
  })
  const accepted = state.update({
    changes: [
      { from: 0, to: 1, insert: 'A' },
      { from: 2, to: 3, insert: 'B\nnew' },
    ],
  })
  const prepared = session.edit(
    sourceChangesFromEditor(session.snapshot(), cmChanges(accepted)),
    'source',
    'typing',
  )
  assert.equal(session.snapshot().materialize(), 'A\r\nB\r\nnew\nc\r!')
  assert.equal(operations.length, 1)
  assert.equal(operations[0].changes.length, 3)
  assert.equal(
    normalizedSource(session.snapshot().materialize()),
    accepted.newDoc.toString(),
  )
  let mirror = EditorState.create({ doc: normalizedSource(source) })
  mirror = mirror.update({
    changes: editorChangesFromSource(
      prepared.before,
      prepared.operation.changes,
    ),
  }).state
  assert.equal(mirror.doc.toString(), accepted.newDoc.toString())
  session.undo((undo) => {
    mirror = mirror.update({
      changes: editorChangesFromSource(undo.before, undo.operation.changes),
    }).state
  })
  assert.equal(session.snapshot().materialize(), source)
  assert.equal(mirror.doc.toString(), normalizedSource(source))
})

test('external raw changes map new CRLF seams without duplicate normalized newlines', () => {
  for (const [source, changes] of [
    ['\n', [{ from: 0, to: 0, insert: '\r' }]],
    ['\r', [{ from: 1, to: 1, insert: '\n' }]],
    ['\rX\n', [{ from: 1, to: 2, insert: '' }]],
    [
      '\rX\n\rY\n',
      [
        { from: 1, to: 2, insert: '' },
        { from: 4, to: 5, insert: '' },
      ],
    ],
    [
      'a\r\nb\nc',
      [
        { from: 1, to: 3, insert: '\n' },
        { from: 4, to: 5, insert: '\r\n' },
      ],
    ],
  ]) {
    const store = new SourceStore(source, { tabId: 'test', revision: 0 }, 0, {
      chunkUnits: 4,
    })
    const projected = editorChangesFromSource(store.snapshot(), changes)
    const state = EditorState.create({ doc: normalizedSource(source) }).update({
      changes: projected,
    }).state
    assert.equal(
      state.doc.toString(),
      normalizedSource(commit(store, changes).materialize()),
    )
  }
})

test('mixed-EOL projections preserve source and CM replicas across random local edits', () => {
  let seed = 3141
  const random = (max) => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return (seed >>> 0) % max
  }
  const store = new SourceStore(
    'a\r\nb\nc\r😀\r\n',
    { tabId: 'test', revision: 0 },
    0,
    { fanout: 4, leafCapacity: 4, chunkUnits: 4 },
  )
  const lineBreak = preferredLineBreak(store.snapshot())
  let state = EditorState.create({
    doc: normalizedSource(store.snapshot().materialize()),
  })
  for (let iteration = 0; iteration < 1000; iteration++) {
    const before = store.snapshot()
    const legal = Array.from(
      { length: state.doc.length + 1 },
      (_, at) => at,
    ).filter((at) => before.isEditBoundary(before.editorToRaw(at)))
    const a = random(legal.length),
      b = a + random(legal.length - a + 1)
    const from = legal[a],
      to = legal[Math.min(b, legal.length - 1)]
    const insert = ['x', '\n', '中', '😀'][random(4)]
    const transaction = state.update({ changes: { from, to, insert } })
    const changes = sourceChangesFromEditor(
      before,
      cmChanges(transaction),
      lineBreak,
    )
    if (
      changes.every(
        (edit) => before.sliceRaw(edit.from, edit.to) === edit.insert,
      )
    )
      continue
    const after = commit(store, changes)
    const mirror = state.update({
      changes: editorChangesFromSource(before, changes),
    }).state
    state = transaction.state
    assert.equal(state.doc.toString(), normalizedSource(after.materialize()))
    assert.equal(mirror.doc.toString(), state.doc.toString())
    assert.equal([...normalizedChunks(after)].join(''), state.doc.toString())
  }
})
