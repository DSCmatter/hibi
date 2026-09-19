import assert from 'node:assert/strict'
import test from 'node:test'
import { outlineHeadingAt } from '../src/renderer/src/outline-position.ts'

test('outline caret lookup matches linear document order with duplicate and wide offsets', () => {
  const headings = Array.from({ length: 100000 }, (_, index) => ({
    id: String(index),
    start: 2 ** 32 + Math.floor(index / 3) * 7,
  }))
  let reads = 0
  const offset = (heading) => {
    reads++
    return heading.start
  }
  let seed = 17
  for (let index = 0; index < 1000; index++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const position = 2 ** 32 - 1 + (seed % 240000)
    reads = 0
    assert.equal(
      outlineHeadingAt(headings, position, offset),
      headings.findLast((heading) => heading.start <= position),
    )
    assert.ok(reads <= 17, `lookup read ${reads} of 100000 headings`)
  }
  assert.equal(outlineHeadingAt([], 0, offset), undefined)
  assert.equal(outlineHeadingAt(headings, 0, offset), undefined)
  assert.equal(
    outlineHeadingAt(headings, Number.MAX_SAFE_INTEGER, offset),
    headings.at(-1),
  )
})
