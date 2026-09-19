import assert from 'node:assert/strict'
import test from 'node:test'
import { SourceStore } from '../src/shared/source-buffer.ts'
import { SourceSearchIndex } from '../src/shared/source-search-index.ts'

const finish = (work) => {
  let yields = 0
  for (;;) {
    const result = work.next()
    if (result.done) return { result: result.value, yields }
    yields++
  }
}
test('sparse find checkpoints bound retained matches and seek near the selected occurrence', () => {
  const store = new SourceStore('x '.repeat(100000), {
    tabId: 'find',
    revision: 0,
  })
  const index = new SourceSearchIndex(store.snapshot(), 'x')
  assert.throws(() => index.locate(0, 1).next(), /incomplete/)
  finish(index.build())
  assert.equal(index.state().checkpoints, 97)
  assert.equal(index.state().total, 100000)
  for (const rank of [1, 1024, 1025, 50001, 100000]) {
    const from = (rank - 1) * 2
    const found = finish(index.locate(from, from + 1))
    assert.equal(found.result.current, rank)
    assert.equal(found.result.previous.rank, rank === 1 ? 100000 : rank - 1)
    assert.equal(found.result.next.rank, rank === 100000 ? 1 : rank + 1)
    assert.ok(found.yields <= 9)
  }
  const caret = finish(index.locate(8191, 8191)).result
  assert.equal(caret.current, 0)
  assert.equal(caret.previous.rank, 4096)
  assert.equal(caret.next.rank, 4097)
  assert.equal(store.counters().materializations, 0)
})

test('checkpoint resume preserves expanded characters and normalized line endings', () => {
  const store = new SourceStore('é\r\n'.repeat(3000), {
    tabId: 'find',
    revision: 0,
  })
  const index = new SourceSearchIndex(store.snapshot(), 'e')
  finish(index.build())
  for (const rank of [1024, 1025, 2048, 3000]) {
    const found = finish(
      index.locate((rank - 1) * 2, (rank - 1) * 2 + 1),
    ).result
    assert.equal(found.current, rank)
    assert.equal(found.next.rank, rank === 3000 ? 1 : rank + 1)
    assert.equal(found.next.match.precise, false)
  }
})

test('canceled scans never publish complete coverage and empty queries have no locations', () => {
  const store = new SourceStore('x '.repeat(100000), {
    tabId: 'find',
    revision: 0,
  })
  const index = new SourceSearchIndex(store.snapshot(), 'x')
  const work = index.build()
  work.next()
  work.return()
  assert.equal(index.state().complete, false)
  assert.throws(() => index.locate(0, 0).next(), /incomplete/)
  finish(index.build())
  assert.equal(index.state().total, 100000)
  const empty = new SourceSearchIndex(store.snapshot(), '')
  finish(empty.build())
  assert.deepEqual(finish(empty.locate(0, 0)).result, {
    current: 0,
    total: 0,
    next: null,
    previous: null,
  })
})
