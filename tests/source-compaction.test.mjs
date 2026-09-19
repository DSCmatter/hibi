import assert from 'node:assert/strict'
import test from 'node:test'
import {
  acceptedStorageChange,
  SourceStore,
} from '../src/shared/source-buffer.ts'

const edit = (store, from, to, insert) =>
  store.commit(
    store.prepare({
      document: store.snapshot().document,
      operationId: `op-${store.snapshot().version}`,
      baseVersion: store.snapshot().version,
      contentVersion: store.snapshot().version + 1,
      historyGroup: 'edit',
      origin: 'source',
      changes: [{ from, to, insert }],
    }),
  )
const finish = (work) => {
  let steps = 0
  for (;;) {
    const next = work.next()
    if (next.done) return { change: next.value, steps }
    steps++
  }
}

test('ENG23: prepared compaction yields bounded work and changes storage without changing source identity/version', () => {
  const source = 'ab\r\n😀e\u0301\r'.repeat(20000)
  const store = new SourceStore(source, { tabId: 'compact', revision: 7 })
  for (let n = 0; n < 100; n++) edit(store, 0, 0, 'x')
  const before = store.snapshot(),
    expected = before.materialize()
  const work = store.prepareCompaction()
  store.counters(true)
  let maximumScanned = 0,
    previous = 0,
    result
  for (;;) {
    result = work.next()
    const scanned = store.counters().unitsScanned
    maximumScanned = Math.max(maximumScanned, scanned - previous)
    previous = scanned
    assert.equal(store.snapshot(), before)
    if (result.done) break
  }
  assert.ok(maximumScanned <= 8192)
  assert.equal(store.counters().materializations, 0)
  const change = result.value
  assert.equal(acceptedStorageChange(change), false)
  const after = store.commitCompaction(change)
  assert.equal(acceptedStorageChange(change), true)
  assert.equal(after.version, before.version)
  assert.equal(after.storageEpoch, before.storageEpoch + 1)
  assert.deepEqual(after.document, before.document)
  assert.equal(after.materialize(), expected)
  assert.equal(before.materialize(), expected)
  assert.deepEqual(store.inspect().problems, [])
  assert.throws(() => store.commitCompaction(change), /consumed|stale/)
  assert.equal(acceptedStorageChange({ ...change }), false)
})

test('compaction cancellation, concurrent edits, foreign capabilities and reidentification cannot replace newer source', () => {
  const store = new SourceStore('x'.repeat(100000), {
    tabId: 'compact',
    revision: 0,
  })
  const canceled = store.prepareCompaction()
  canceled.next()
  canceled.return()
  assert.equal(canceled.next().value, undefined)
  const staleWork = store.prepareCompaction()
  staleWork.next()
  edit(store, 0, 1, 'y')
  assert.throws(() => staleWork.next(), /stale/)
  const prepared = finish(store.prepareCompaction()).change
  const foreign = new SourceStore('', { tabId: 'other', revision: 0 })
  assert.throws(() => foreign.commitCompaction(prepared), /forged|stale/)
  assert.throws(() => store.commitCompaction({ ...prepared }), /forged|stale/)
  store.reidentify({ tabId: 'compact', revision: 1 })
  assert.throws(() => store.commitCompaction(prepared), /stale/)
  assert.equal(store.snapshot().sliceRaw(0, 2), 'yx')
  const aborted = finish(store.prepareCompaction()).change
  store.abortCompaction(aborted)
  assert.throws(() => store.commitCompaction(aborted), /forged|consumed/)
})

test('small pieces and empty source compact without unbounded directory assembly', () => {
  for (const source of ['', 'x'.repeat(30000)]) {
    const store = new SourceStore(
      source,
      { tabId: 'compact', revision: 0 },
      0,
      { chunkUnits: 16, leafCapacity: 8, fanout: 4 },
    )
    const { change, steps } = finish(store.prepareCompaction())
    store.commitCompaction(change)
    assert.equal(store.snapshot().materialize(), source)
    assert.ok(steps >= Math.floor(source.length / 16))
    assert.deepEqual(store.inspect().problems, [])
  }
})

test('storage inspection counts unique chunk capacity and rejected writer storage without reading source', () => {
  const store = new SourceStore('a'.repeat(4096), {
    tabId: 'storage',
    revision: 0,
  })
  edit(store, 2000, 2000, 'x')
  edit(store, 1000, 1000, 'y')
  store.counters(true)
  const usage = finish(store.inspectStorage()).change
  assert.equal(usage.chunks, 2)
  assert.equal(usage.allocatedUnits, 8192)
  assert.equal(usage.pieces, 5)
  assert.ok(usage.indexBytes > 0)
  assert.equal(store.counters().unitsScanned, 0)
  assert.equal(store.counters().sourceUnitsRead, 0)
  assert.equal(store.counters().storagePiecesVisited, 5)
  const pending = store.inspectStorage()
  pending.next()
  edit(store, 0, 1, 'z')
  assert.throws(() => pending.next(), /stale/)

  const rejected = new SourceStore('', { tabId: 'rejected', revision: 0 })
  const prepared = rejected.prepare({
    document: rejected.snapshot().document,
    operationId: 'rejected',
    baseVersion: 0,
    contentVersion: 1,
    historyGroup: 'edit',
    origin: 'source',
    changes: [{ from: 0, to: 0, insert: 'x' }],
  })
  rejected.abort(prepared)
  const writer = finish(rejected.inspectStorage()).change
  assert.equal(writer.pieces, 0)
  assert.equal(writer.chunks, 1)
  assert.equal(writer.allocatedUnits, 4096)
})

test('only accepted snapshots of this exact source generation survive a storage swap', () => {
  const store = new SourceStore('original', { tabId: 'own', revision: 0 })
  const before = store.snapshot()
  const change = finish(store.prepareCompaction()).change
  assert.equal(store.ownsCurrentSnapshot(change.after), false)
  store.commitCompaction(change)
  assert.equal(store.ownsCurrentSnapshot(before), true)
  assert.equal(store.ownsCurrentSnapshot(change.after), true)
  const forged = new SourceStore('original', before.document).snapshot()
  assert.equal(store.ownsCurrentSnapshot(forged), false)
  edit(store, 0, 1, 'O')
  assert.equal(store.ownsCurrentSnapshot(before), false)
})
