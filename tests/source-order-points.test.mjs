import assert from 'node:assert/strict'
import test from 'node:test'
import { SourceOrderPoints } from '../src/shared/source-order-points.ts'
import { SourceOwners } from '../src/shared/source-owners.ts'

const finish = (work) => {
  for (;;) {
    const step = work.next()
    if (step.done) return step.value
  }
}
const build = (owners, selected) =>
  finish(SourceOrderPoints.build(owners, (owner) => selected.has(owner.slot)))
const check = (points, owners, selected) => {
  const rows = [...owners.records()].filter((row) =>
    selected.has(row.owner.slot),
  )
  const value = (row) => (row ? { owner: row.owner, from: row.from } : null)
  assert.deepEqual(points.bounds(), {
    count: rows.length,
    first: value(rows[0]),
    last: value(rows.at(-1)),
  })
  assert.ok(
    points.counters().height <= 2 * Math.ceil(Math.log2(rows.length + 1)),
  )
}
test('semantic owner order is immutable through randomized edits and membership changes', () => {
  let owners = new SourceOwners(
    Array.from({ length: 1000 }, () => ({ kind: 'paragraph', length: 8 })),
  )
  const selected = new Set(
    [...owners.records()]
      .filter((row) => row.index % 3 === 0)
      .map((row) => row.owner.slot),
  )
  let points = build(owners, selected),
    seed = 19223
  const random = (max) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed % max
  }
  const retained = []
  for (let step = 0; step < 500; step++) {
    if (step % 50 === 0)
      retained.push({ owners, points, selected: new Set(selected) })
    const at = random(owners.count + 1),
      end = Math.min(owners.count, at + random(6))
    for (const row of owners.records(at, end)) selected.delete(row.owner.slot)
    const additions = Array.from({ length: random(6) }, () => ({
      kind: 'edited',
      length: 1 + random(50),
    }))
    owners = owners.splice(at, end, additions)
    points = finish(points.adopt(owners))
    for (const row of owners.records(at, at + additions.length)) {
      const included = random(2) === 0
      points = points.set(row.owner.slot, included)
      if (included) selected.add(row.owner.slot)
    }
    if (owners.count) {
      const row = owners.get(random(owners.count)),
        included = !selected.has(row.owner.slot)
      points = points.set(row.owner.slot, included)
      if (included) selected.add(row.owner.slot)
      else selected.delete(row.owner.slot)
    }
    check(points, owners, selected)
  }
  for (const item of retained) check(item.points, item.owners, item.selected)
})
test('100k-owner prefix changes reuse semantic order without suffix work', () => {
  const owners = new SourceOwners(
    Array.from({ length: 100000 }, () => ({ kind: 'paragraph', length: 16 })),
  )
  const points = finish(SourceOrderPoints.build(owners, () => true))
  const first = owners.get(0).owner.slot,
    last = owners.get(99999).owner.slot
  points.counters(true)
  const after = owners.splice(0, 0, [{ kind: 'prefix', length: 7 }])
  let next = finish(points.adopt(after))
  assert.equal(next.counters().nodesRead, 0)
  assert.equal(next.counters().nodesCreated, 0)
  assert.equal(next.counters().ownersRead, 0)
  assert.equal(next.bounds().first.from, 7)
  assert.equal(next.bounds().last.from, 1599991)
  next.counters(true)
  next = next
    .set(after.get(0).owner.slot, true)
    .set(first, false)
    .set(last, false)
  assert.ok(next.counters().nodesRead < 150)
  assert.ok(next.counters().nodesCreated < 150)
  assert.equal(points.bounds().first.from, 0)
  assert.equal(points.bounds().last.from, 1599984)
})
test('semantic order cancels preparation, rejects foreign arenas and keeps wide coordinates', () => {
  const owners = new SourceOwners(
    Array.from({ length: 8 }, () => ({ kind: 'wide', length: 2 ** 38 })),
    { firstSlot: 2 ** 40 },
  )
  const work = SourceOrderPoints.build(owners, () => true)
  assert.equal(work.next().done, false)
  assert.equal(work.return().done, true)
  const points = finish(SourceOrderPoints.build(owners, () => true)),
    before = points.bounds()
  const after = owners.splice(0, 0, [{ kind: 'prefix', length: 4 }]),
    next = finish(points.adopt(after))
  assert.equal(next.bounds().first.from, 4)
  assert.equal(next.bounds().last.from, before.last.from + 4)
  assert.deepEqual(points.bounds(), before)
  assert.throws(
    () => finish(points.adopt(new SourceOwners([]))),
    /different arenas/,
  )
  assert.throws(() => points.set(-1, true), /Unknown/)
  assert.throws(
    () =>
      finish(
        SourceOrderPoints.build(
          new SourceOwners([{ kind: 'unknown', length: 2, parsed: false }]),
          () => true,
        ),
      ),
    /complete/,
  )
  assert.deepEqual(
    finish(SourceOrderPoints.build(new SourceOwners([]), () => false)).bounds(),
    { count: 0, first: null, last: null },
  )
})

test('semantic order balances monotone membership updates and cancels adoption atomically', () => {
  const owners = new SourceOwners(
    Array.from({ length: 4096 }, () => ({ kind: 'paragraph', length: 10 })),
  )
  let points = finish(SourceOrderPoints.build(owners, () => false))
  for (const row of owners.records()) points = points.set(row.owner.slot, true)
  const before = points,
    selected = new Set([...owners.records()].map((row) => row.owner.slot))
  check(points, owners, selected)
  for (const row of owners.records()) {
    if (row.index % 2) continue
    points = points.set(row.owner.slot, false)
    selected.delete(row.owner.slot)
  }
  check(points, owners, selected)
  const after = owners.splice(0, 2048, []),
    pending = points.adopt(after)
  assert.equal(pending.next().done, false)
  pending.return()
  check(points, owners, selected)
  points = finish(points.adopt(after))
  for (const row of owners.records(0, 2048)) selected.delete(row.owner.slot)
  check(points, after, selected)
  for (const row of after.records()) points = points.set(row.owner.slot, false)
  assert.deepEqual(points.bounds(), { count: 0, first: null, last: null })
  assert.equal(before.bounds().count, 4096)
})
