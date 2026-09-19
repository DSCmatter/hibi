import assert from 'node:assert/strict'
import test from 'node:test'
import { DocumentWorkerService } from '../src/shared/document-worker-service.ts'
import { SourceStore } from '../src/shared/source-buffer.ts'

function fixture(t, source = 'one two one') {
  const messages = [],
    pending = new Set()
  const worker = new DocumentWorkerService((message) => {
    messages.push(message)
    for (const check of pending) check()
  })
  t.after(() => worker.dispose())
  const next = (predicate) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(check)
        reject(new Error('Missing worker reply'))
      }, 2000)
      const check = () => {
        const found = messages.find(predicate)
        if (!found) return
        pending.delete(check)
        clearTimeout(timer)
        resolve(found)
      }
      pending.add(check)
      check()
    })
  const load = (epoch = 'first', body = source) => {
    const chunks = []
    for (let from = 0; from < body.length; from += 65536)
      chunks.push(body.slice(from, from + 65536))
    worker.receive({
      type: 'load',
      epoch,
      document: { tabId: 'a', revision: 0 },
      version: 0,
      chunks,
    })
    assert.equal(messages.at(-1).type, 'ack')
  }
  const find = (id, version = 0, query = 'one', from = 0, to = 0) =>
    worker.receive({
      type: 'find',
      epoch: 'first',
      id,
      version,
      query,
      from,
      to,
    })
  load()
  return { worker, messages, next, load, find }
}

test('worker source replication is ordered, atomic, and query replies name the exact accepted version', async (t) => {
  const f = fixture(t)
  assert.deepEqual(f.messages[0], { type: 'ack', epoch: 'first', version: 0 })
  f.find(1)
  const original = await f.next(
    (reply) => reply.type === 'find' && reply.id === 1,
  )
  assert.equal(original.location.total, 2)
  assert.equal(original.location.next.match.from, 0)
  const operation = {
    document: { tabId: 'a', revision: 0 },
    operationId: 'change',
    baseVersion: 0,
    contentVersion: 1,
    origin: 'source',
    historyGroup: 'typing',
    changes: [{ from: 0, to: 3, insert: 'zero' }],
  }
  f.worker.receive({ type: 'edit', epoch: 'first', operation })
  f.find(2, 1, 'one')
  const edited = await f.next(
    (reply) => reply.type === 'find' && reply.id === 2,
  )
  assert.equal(edited.version, 1)
  assert.equal(edited.location.total, 1)
  assert.equal(edited.location.next.match.from, 9)
  f.find(3, 1, 'one', 9, 12)
  const selected = await f.next(
    (reply) => reply.type === 'find' && reply.id === 3,
  )
  assert.equal(selected.location.current, 1)
  f.worker.receive({ type: 'edit', epoch: 'first', operation })
  assert.equal(f.messages.at(-1).stage, 'replica')
  f.load('second', 'fresh')
  f.worker.receive({ type: 'edit', epoch: 'first', operation })
  assert.deepEqual(f.messages.at(-1), {
    type: 'ack',
    epoch: 'second',
    version: 0,
  })
})

test('worker replaces pending queries, cancels coverage on edits, and releases disposed work', async (t) => {
  const f = fixture(t, 'one two '.repeat(100000))
  f.find(1, 0, 'one')
  f.find(2, 0, 'two')
  const result = await f.next(
    (reply) => reply.type === 'find' && reply.id === 2,
  )
  assert.equal(result.location.total, 100000)
  assert.equal(
    f.messages.some((reply) => reply.type === 'find' && reply.id === 1),
    false,
  )
  f.find(1, 0, 'one')
  f.find(3, 0, 'one')
  f.worker.receive({ type: 'cancel-find', epoch: 'first', id: 3 })
  f.find(4, 0, 'absent')
  f.worker.dispose()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(
    f.messages.some(
      (reply) => reply.type === 'find' && [1, 3, 4].includes(reply.id),
    ),
    false,
  )
})

test('worker validates bootstrap and query limits without executing document content', async (t) => {
  const f = fixture(t, '<script>throw new Error("never execute")</script>')
  f.find(1, 0, 'script')
  assert.equal(
    (await f.next((reply) => reply.type === 'find')).location.total,
    2,
  )
  f.find(2, 0, 'x'.repeat(65537))
  assert.equal(f.messages.at(-1).stage, 'find')
  assert.equal(f.messages.at(-1).id, 2)
  f.find(3, 0, 'script', -1, 0)
  assert.equal(f.messages.at(-1).id, 3)
  f.worker.receive({
    type: 'load',
    epoch: 'bad',
    document: { tabId: 'a', revision: 0 },
    version: 0,
    chunks: [42],
  })
  assert.equal(f.messages.at(-1).stage, 'replica')
})

test('iterable source bootstrap preserves raw seams without joining the document', () => {
  const source = 'a\r\n😀b'.repeat(5000),
    parts = Array.from(source, (character) => character)
  // Explicitly split a surrogate pair, as transport chunk boundaries may do.
  parts.splice(3, 1, '\ud83d', '\ude00')
  const reconstructed = parts.join('')
  const store = new SourceStore(parts, { tabId: 'a', revision: 0 }),
    contiguous = new SourceStore(reconstructed, { tabId: 'a', revision: 0 })
  assert.deepEqual(store.snapshot().metrics, contiguous.snapshot().metrics)
  assert.equal(store.counters().materializations, 0)
  assert.equal(store.snapshot().materialize(), reconstructed)
  assert.throws(
    () => new SourceStore(['a', 42], { tabId: 'a', revision: 0 }),
    /strings/,
  )
})

test('worker maintenance preserves live find results and disposes its previous replica owner', async (t) => {
  const commits = []
  const commit = SourceStore.prototype.commitCompaction
  t.mock.method(SourceStore.prototype, 'commitCompaction', function (change) {
    commits.push(change.after.version)
    return commit.call(this, change)
  })
  const f = fixture(t, 'x'.repeat(80 * 4096))
  f.worker.receive({
    type: 'edit',
    epoch: 'first',
    operation: {
      document: { tabId: 'a', revision: 0 },
      operationId: 'holes',
      baseVersion: 0,
      contentVersion: 1,
      origin: 'source',
      historyGroup: 'holes',
      changes: Array.from({ length: 80 }, (_, n) => ({
        from: n * 4096,
        to: (n + 1) * 4096 - 1,
        insert: '',
      })),
    },
  })
  f.find(1, 1, 'x')
  assert.equal(
    (await f.next((reply) => reply.type === 'find' && reply.id === 1)).location
      .total,
    80,
  )
  const deadline = performance.now() + 2000
  while (!commits.length && performance.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(commits, [1])
  f.find(2, 1, 'x', 40, 41)
  const result = await f.next(
    (reply) => reply.type === 'find' && reply.id === 2,
  )
  assert.equal(result.location.total, 80)
  assert.equal(result.location.current, 41)
  f.load('replacement', 'fresh')
  f.worker.dispose()
  await new Promise((resolve) => setTimeout(resolve, 550))
  assert.deepEqual(commits, [1])
  assert.equal(
    f.messages.some((reply) => reply.type === 'error'),
    false,
  )
})
