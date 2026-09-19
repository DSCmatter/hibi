import assert from 'node:assert/strict'
import test from 'node:test'
import { DocumentWorkerClient } from '../src/renderer/src/document-worker-client.ts'
import { DocumentSession } from '../src/shared/document-session.ts'
import { DocumentWorkerService } from '../src/shared/document-worker-service.ts'

const wait = async (predicate) => {
  const end = Date.now() + 3000
  while (!predicate()) {
    if (Date.now() > end) throw new Error('Worker condition did not settle')
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}
class TestWorker {
  messages = []
  terminated = false
  blocked = false
  onmessage = null
  onerror = null
  onmessageerror = null
  service = new DocumentWorkerService((reply) =>
    queueMicrotask(() => {
      if (!this.terminated) this.onmessage?.({ data: structuredClone(reply) })
    }),
  )
  postMessage(message) {
    const copy = structuredClone(message)
    this.messages.push(copy)
    if (!this.blocked)
      queueMicrotask(() => {
        if (!this.terminated) this.service.receive(copy)
      })
  }
  terminate() {
    this.terminated = true
    this.service.dispose()
  }
}
function fixture(t, source = 'one two one', extra = {}) {
  const workers = [],
    results = [],
    errors = []
  const session = new DocumentSession(source, { tabId: 'a', revision: 0 }, 0, {
    enqueue: () => {},
    onError: (error) => errors.push(error),
  })
  let query = 'one',
    from = 0,
    to = 0
  const client = new DocumentWorkerClient(session, {
    changed: () => client.find(query, from, to),
    pending: () => {},
    result: (location, action) => results.push({ location, action }),
    error: (error) => errors.push(error),
    worker: () => {
      const worker = new TestWorker()
      workers.push(worker)
      return worker
    },
    ...extra,
  })
  t.after(() => {
    client.dispose()
    session.dispose()
  })
  const find = (text, start = 0, end = 0, action = null) => {
    query = text
    from = start
    to = end
    client.find(query, from, to, action)
  }
  const append = (text) => {
    const length = session.snapshot().utf16Length
    session.edit(
      [{ from: length, to: length, insert: text }],
      'source',
      'typing',
    )
  }
  return { client, session, workers, results, errors, find, append }
}

test('client lazily bootstraps immutable chunks and applies an exact operation suffix without materializing source', async (t) => {
  const f = fixture(t, 'one '.repeat(20000))
  f.session.counters(true)
  assert.equal(f.workers.length, 0)
  f.find('one', 0, 0, 'first')
  f.append('one')
  await wait(() => f.results.length > 0)
  assert.equal(f.results.at(-1).location.total, 20001)
  assert.equal(f.session.counters().materializations, 0)
  const first = f.workers[0].messages[0]
  assert.equal(first.type, 'load')
  assert.ok(first.chunks.every((chunk) => chunk.length <= 65536))
  f.append(' one')
  await wait(() => f.results.at(-1).location.total === 20002)
  assert.equal(f.workers.length, 1)
  assert.ok(f.workers[0].messages.some((message) => message.type === 'edit'))
  assert.deepEqual(f.errors, [])
})

test('client coalesces superseded queries and ignores late replies and errors from terminated generations', async (t) => {
  const f = fixture(t, 'one two '.repeat(10000), { maximumPendingBytes: 700 })
  f.find('one')
  await wait(() => f.results.length > 0)
  const original = f.workers[0],
    epoch = original.messages[0].epoch
  original.blocked = true
  for (let n = 0; n < 100; n++) f.find(`query-${n}`)
  assert.ok(
    original.messages.filter((message) => message.type === 'find').length <= 2,
  )
  assert.equal(
    original.messages.filter((message) => message.type === 'cancel-find')
      .length,
    1,
  )
  f.find('two')
  for (let n = 0; n < 8; n++) f.append('x')
  await wait(
    () => f.workers.length === 2 && f.results.at(-1).location.total === 10000,
  )
  await wait(() =>
    f.workers[1].messages.some((message) => message.type === 'find'),
  )
  assert.equal(original.terminated, true)
  const before = f.results.length
  original.onmessage({
    data: {
      type: 'find',
      epoch,
      id: 999,
      version: 8,
      location: { total: 999, current: 0, previous: null, next: null },
    },
  })
  original.onerror({ preventDefault() {} })
  assert.equal(f.results.length, before)
  assert.equal(f.workers[1].terminated, false)
  assert.equal(f.session.snapshot().version, 8)
  assert.equal(f.workers[1].messages[0].version, 8)
  await wait(() => f.results.at(-1).location.total === 10000)
  assert.deepEqual(f.errors, [])
})

test('worker restarts are finite and disposal cancels bootstrap, listeners and pending jobs', async (t) => {
  const workers = [],
    f = fixture(t, 'one', {
      timeoutMs: 5,
      worker: () => {
        const worker = new TestWorker()
        worker.blocked = true
        workers.push(worker)
        return worker
      },
    })
  f.find('one')
  await wait(() => f.errors.length === 1)
  assert.equal(workers.length, 2)
  assert.ok(workers.every((worker) => worker.terminated))
  f.client.dispose()
  f.append(' two')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(workers.length, 2)
  const immediate = fixture(t)
  immediate.find('one')
  immediate.client.dispose()
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(immediate.workers.length, 0)
})

test('a new document identity gets a fresh worker after a failed generation', async (t) => {
  const workers = []
  let blocked = true
  const f = fixture(t, 'one', {
    timeoutMs: 5,
    worker: () => {
      const worker = new TestWorker()
      worker.blocked = blocked
      workers.push(worker)
      return worker
    },
  })
  f.find('one')
  await wait(() => f.errors.length === 1)
  blocked = false
  f.session.reidentify({ tabId: 'a', revision: 1 })
  await wait(() => f.results.length === 1)
  assert.equal(f.results[0].location.total, 1)
  assert.equal(workers.length, 3)
  assert.equal(workers[2].messages[0].document.revision, 1)
})
