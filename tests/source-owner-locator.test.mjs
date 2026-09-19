import assert from 'node:assert/strict'
import test from 'node:test'
import { SourceOwners } from '../src/shared/source-owners.ts'

test('cold owner lookup prepares by page, cancels and tolerates concurrent synchronous demand', () => {
  const owners = new SourceOwners(
    Array.from({ length: 100000 }, () => ({ kind: 'paragraph', length: 10 })),
  )
  const canceled = owners.prepareLookup()
  for (let n = 0; n < 10; n++) assert.equal(canceled.next().done, false)
  assert.equal(owners.counters().locator.retainedRows, 0)
  canceled.return()
  assert.equal(owners.counters().locator.retainedRows, 0)
  let steps = 0
  for (const _ of owners.prepareLookup()) steps++
  assert.ok(steps > 100)
  assert.equal(owners.counters().locator.retainedRows, 100000)
  const expected = owners.get(99999)
  owners.counters(true)
  assert.deepEqual(owners.bySlot(expected.owner.slot), expected)
  assert.equal(owners.counters().locator.rowsWritten, 0)
  const fresh = new SourceOwners([{ kind: 'a', length: 3 }])
  const partial = fresh.prepareLookup()
  assert.equal(partial.next().done, false)
  const first = fresh.get(0)
  assert.deepEqual(fresh.bySlot(first.owner.slot), first)
  assert.equal(partial.next().done, true)
  const edited = fresh.splice(0, 0, [{ kind: 'prefix', length: 5 }])
  assert.deepEqual(edited.bySlot(first.owner.slot), edited.get(1))
  assert.deepEqual(fresh.bySlot(first.owner.slot), first)
})

test('owner handles resolve exact current and retained snapshots through edits and removals', () => {
  let seed = 70123
  const random = (max) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed % max
  }
  for (const pageSize of [4, 128]) {
    let index = new SourceOwners(
      Array.from({ length: 1000 }, () => ({
        kind: 'paragraph',
        length: 1 + random(50),
      })),
      { pageSize, fanout: 4 },
    )
    const retained = []
    const removed = new Set()
    assert.deepEqual(index.bySlot(index.get(500).owner.slot), index.get(500))
    for (let step = 0; step < 300; step++) {
      if (step % 50 === 0) retained.push(index)
      const from = random(index.count + 1),
        to = Math.min(index.count, from + random(6))
      for (const row of index.records(from, to)) removed.add(row.owner.slot)
      index = index.splice(
        from,
        to,
        Array.from({ length: random(6) }, () => ({
          kind: 'edited',
          length: 1 + random(70),
        })),
      )
      if (index.count && step % 3 === 0) {
        const position = random(index.count),
          before = index.get(position)
        index = index.update(position, {
          kind: 'updated',
          length: 1 + random(90),
        })
        const after = index.bySlot(before.owner.slot)
        assert.equal(after.owner.revision, before.owner.revision + 1)
        assert.equal(after.owner.generation, before.owner.generation)
      }
      for (let n = 0; n < 8 && index.count; n++) {
        const expected = index.get(random(index.count))
        assert.deepEqual(index.bySlot(expected.owner.slot), expected)
      }
      assert.equal(index.counters().locator.retainedRows, index.count)
    }
    for (const slot of removed) assert.equal(index.bySlot(slot), null)
    for (const snapshot of retained) {
      for (const row of snapshot.records())
        assert.deepEqual(snapshot.bySlot(row.owner.slot), row)
      assert.equal(snapshot.counters().locator.retainedRows, snapshot.count)
      const current = index.get(index.count - 1)
      if (current) assert.deepEqual(index.bySlot(current.owner.slot), current)
      assert.equal(index.counters().locator.retainedRows, index.count)
    }
    index = index.splice(0, index.count, [])
    assert.equal(index.counters().locator.retainedRows, 0)
    assert.equal(index.bySlot(1), null)
  }
})

test('100k-owner prefix edits and handle lookup touch only changed pages and ancestor paths', () => {
  let index = new SourceOwners(
    Array.from({ length: 100000 }, () => ({ kind: 'paragraph', length: 50 })),
  )
  const last = index.get(99999).owner
  assert.equal(index.bySlot(last.slot).index, 99999)
  for (let step = 1; step <= 100; step++) {
    index.counters(true)
    index = index.splice(0, 0, [{ kind: 'prefix', length: 2 }])
    const found = index.bySlot(last.slot)
    assert.equal(found.owner, last)
    assert.equal(found.index, 99999 + step)
    assert.equal(found.from, 99999 * 50 + step * 2)
    const work = index.counters().locator
    assert.equal(work.retainedRows, index.count)
    assert.ok(work.rowsWritten < 1024, JSON.stringify(work))
    assert.ok(work.nodesVisited < 1024, JSON.stringify(work))
    assert.ok(work.parentReads < 2048, JSON.stringify(work))
    assert.ok(work.slotsRead < 512, JSON.stringify(work))
  }
})

test('owner lookup preserves wide coordinates and scopes identical slots to their arena', () => {
  const first = new SourceOwners(
    [
      { kind: 'large', length: 2 ** 32 },
      { kind: 'tail', length: 3 },
    ],
    { firstSlot: 2 ** 40 },
  )
  const tail = first.get(1)
  assert.deepEqual(first.bySlot(tail.owner.slot), tail)
  assert.equal(tail.from, 2 ** 32)
  const second = new SourceOwners([{ kind: 'other', length: 7 }], {
    firstSlot: 2 ** 40 + 1,
  })
  assert.notEqual(first.epoch, second.epoch)
  assert.equal(second.bySlot(tail.owner.slot).owner.kind, 'other')
  for (const slot of [-1, 0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(first.bySlot(slot), null)
  assert.equal(first.bySlot(Number.MAX_SAFE_INTEGER), null)
  assert.deepEqual(first.bySlot(tail.owner.slot), tail)
})

test('owner identity deltas match snapshot oracles without treating prefix shifts as changes', () => {
  let current = new SourceOwners(
    Array.from({ length: 100000 }, () => ({ kind: 'body', length: 2 })),
  )
  current.bySlot(current.get(0).owner.slot)
  const before = current
  current = current.splice(0, 0, [{ kind: 'prefix', length: 9 }])
  current.counters(true)
  const delta = current.changesSince(before)
  assert.deepEqual(delta.changed, [current.get(0).owner])
  assert.deepEqual(delta.removed, [])
  assert.ok(current.counters().locator.rowsWritten < 2048)
  assert.deepEqual(current.changesSince(current), { changed: [], removed: [] })

  let seed = 9123
  const random = (max) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed % max
  }
  current = new SourceOwners(
    Array.from({ length: 500 }, () => ({ kind: 'body', length: 2 })),
    { pageSize: 8, fanout: 4 },
  )
  for (let run = 0; run < 200; run++) {
    const previous = current
    const from = random(current.count + 1),
      to = Math.min(current.count, from + random(8))
    current = current.splice(
      from,
      to,
      Array.from({ length: random(8) }, () => ({
        kind: 'changed',
        length: 1 + random(40),
      })),
    )
    if (current.count)
      current = current.update(random(current.count), {
        kind: 'revision',
        length: 7,
      })
    const old = new Map(
      [...previous.records()].map((row) => [row.owner.slot, row.owner]),
    )
    const next = new Map(
      [...current.records()].map((row) => [row.owner.slot, row.owner]),
    )
    const result = current.changesSince(previous)
    assert.deepEqual(
      result.changed,
      [...next.values()].filter((owner) => old.get(owner.slot) !== owner),
    )
    assert.deepEqual(
      result.removed,
      [...old.values()].filter((owner) => !next.has(owner.slot)),
    )
    assert.ok(
      Object.isFrozen(result) &&
        Object.isFrozen(result.changed) &&
        Object.isFrozen(result.removed),
    )
  }
  assert.throws(
    () => current.changesSince(new SourceOwners([])),
    /different arenas/,
  )
})
