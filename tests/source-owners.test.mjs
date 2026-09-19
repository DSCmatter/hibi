import assert from 'node:assert/strict'
import test from 'node:test'
import { SourceOwners } from '../src/shared/source-owners.ts'

const check = (index, expected) => {
  assert.equal(index.count, expected.length)
  assert.equal(
    index.length,
    expected.reduce((sum, row) => sum + row.length, 0),
  )
  let offset = 0
  const slots = new Set()
  expected.forEach((row, at) => {
    const entry = index.get(at)
    assert.equal(entry.owner.kind, row.kind)
    assert.equal(entry.owner.length, row.length)
    assert.equal(entry.index, at)
    assert.equal(entry.from, offset)
    assert.equal(entry.to, offset + row.length)
    assert.equal(index.at(offset).owner, entry.owner)
    assert.equal(index.at(offset + row.length, -1).owner, entry.owner)
    assert.equal(slots.has(entry.owner.slot), false)
    slots.add(entry.owner.slot)
    offset += row.length
  })
  assert.deepEqual(index.inspect().problems, [])
}

test('ENG11/ENG12: paged owner edits retain immutable records and relative positions under random splices', () => {
  let seed = 97403
  const random = (max) => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return (seed >>> 0) % max
  }
  for (const pageSize of [4, 8, 128]) {
    const expected = Array.from({ length: 200 }, (_, at) => ({
      kind: `block-${at}`,
      length: 1 + random(30),
    }))
    let index = new SourceOwners(expected, { pageSize, fanout: 4 })
    const retained = []
    for (let run = 0; run < 500; run++) {
      if (run % 100 === 0) retained.push([index, [...expected]])
      const from = random(expected.length + 1),
        to = from + random(expected.length - from + 1)
      const replacements = Array.from({ length: random(10) }, () => ({
        kind: 'changed',
        length: 1 + random(50),
      }))
      index = index.splice(from, to, replacements)
      expected.splice(from, to - from, ...replacements)
      check(index, expected)
    }
    for (const [snapshot, rows] of retained) check(snapshot, rows)
  }
})

test('ENG11/ENG12: prefix insertion in 100k owners copies bounded pages and leaves later identities intact', () => {
  for (const pageSize of [128, 512, 4096]) {
    const records = Array.from({ length: 100_000 }, () => ({
      kind: 'paragraph',
      length: 50,
    }))
    const index = new SourceOwners(records, { pageSize })
    const last = index.get(99_999)
    index.counters(true)
    const edited = index.splice(0, 0, [{ kind: 'heading', length: 3 }])
    assert.equal(edited.get(100_000).owner, last.owner)
    assert.equal(edited.get(100_000).from, last.from + 3)
    const counters = edited.counters()
    assert.ok(
      counters.recordSlotsCopied < pageSize * 5,
      JSON.stringify(counters),
    )
    assert.ok(counters.directorySlotsCopied < 1024, JSON.stringify(counters))
    const next = edited.update(50_000, { kind: 'paragraph', length: 200 })
    assert.equal(next.get(50_000).owner.slot, edited.get(50_000).owner.slot)
    assert.equal(
      next.get(50_000).owner.revision,
      edited.get(50_000).owner.revision + 1,
    )
    assert.equal(edited.get(50_000).owner.length, 50)
    assert.deepEqual(next.inspect().problems, [])
  }
})

test('ENG06/ENG10: owner positions and handles preserve numeric domains without bitwise truncation or aliases', () => {
  const input = [
    { kind: 'long', length: 2 ** 32 + 9 },
    { kind: 'tail', length: 8 },
  ]
  const index = new SourceOwners(input, { firstSlot: 2 ** 32 + 7 })
  input[0].length = 1
  const last = index.get(1)
  assert.equal(last.from, 2 ** 32 + 9)
  assert.equal(last.owner.slot, 2 ** 32 + 8)
  assert.equal(index.at(2 ** 32 + 10).owner, last.owner)
  assert.throws(() => {
    last.owner.length = 0
  }, TypeError)
  for (const position of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(index.at(position), null)
    assert.throws(() => index.splice(position, position, []), /outside/)
  }
  assert.throws(
    () =>
      new SourceOwners([
        { kind: 'overflow', length: Number.MAX_SAFE_INTEGER },
        { kind: 'one', length: 1 },
      ]),
    /overflow/,
  )
  assert.throws(
    () => new SourceOwners([], {}, { pages: {}, root: {} }),
    /capability/,
  )
  const empty = index.splice(0, index.count, [])
  assert.equal(empty.at(0), null)
  assert.equal(empty.length, 0)
})
