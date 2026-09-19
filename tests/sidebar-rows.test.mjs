import assert from 'node:assert/strict'
import test from 'node:test'
import {
  sidebarBlockTop,
  sidebarParents,
  sidebarRowAt,
  sidebarRows,
  sidebarRowTop,
  sidebarWindow,
} from '../src/ui/sidebar-rows.ts'

test('sidebar rows preserve tree order, parent links, sibling positions and section offsets', () => {
  const items = [
    {
      id: 'a',
      label: 'A',
      section: 'First',
      children: [
        { id: 'b', label: 'B' },
        { id: 'c', label: 'C', children: [{ id: 'd', label: 'D' }] },
      ],
    },
    { id: 'e', label: 'E', section: 'Second' },
  ]
  assert.deepEqual(
    [...sidebarParents(items)],
    [
      ['a', null],
      ['b', 'a'],
      ['c', 'a'],
      ['d', 'c'],
      ['e', null],
    ],
  )
  const closed = sidebarRows(items, new Set(), true)
  assert.deepEqual(
    closed.rows.map((row) => row.item.id),
    ['a', 'e'],
  )
  const expanded = sidebarRows(items, new Set(['a']), true)
  assert.deepEqual(
    expanded.rows.map(({ item, parent, depth, position, size, sections }) => [
      item.id,
      parent,
      depth,
      position,
      size,
      sections,
    ]),
    [
      ['a', null, 0, 1, 2, 1],
      ['b', 'a', 1, 1, 2, 1],
      ['c', 'a', 1, 2, 2, 1],
      ['e', null, 0, 2, 2, 2],
    ],
  )
  assert.equal(expanded.indices.get('e'), 3)
  assert.equal(expanded.sections, 2)
  const all = sidebarRows(items, new Set(), false)
  assert.equal(all.rows.length, 5)
  assert.equal(sidebarRowTop(all.rows, 4, 28, 36), 184)
  assert.equal(sidebarBlockTop(all.rows, 4, 28, 36), 148)
  assert.equal(sidebarRowAt(all.rows, 0, 28, 36), 0)
  assert.equal(sidebarRowAt(all.rows, 147, 28, 36), 3)
  assert.equal(sidebarRowAt(all.rows, 148, 28, 36), 4)
})

test('sidebar windows cover the viewport with a bounded row count through section headings', () => {
  const items = Array.from({ length: 100000 }, (_, index) => ({
    id: String(index),
    label: String(index),
    ...(index % 25 === 0 ? { section: 'Group' } : {}),
  }))
  const { rows } = sidebarRows(items, new Set(), false)
  for (const rowHeight of [28, 44]) {
    const sectionHeight = 36,
      height = 600
    for (const at of [0, 1, 24999, 50000, 99999]) {
      const top = sidebarBlockTop(rows, at, rowHeight, sectionHeight) + 5
      const window = sidebarWindow(rows, top, height, rowHeight, sectionHeight)
      assert.ok(window.from <= at && window.to > at)
      assert.ok(window.to - window.from <= Math.ceil(height / rowHeight) + 18)
      const last = window.to - 1
      assert.ok(
        last === rows.length - 1 ||
          sidebarRowTop(rows, last, rowHeight, sectionHeight) + rowHeight >=
            top + height,
      )
    }
  }
  assert.deepEqual(sidebarWindow([], 0, 600, 28, 36), { from: 0, to: 0 })
  assert.deepEqual(sidebarWindow(rows, 0, 0, 28, 36), { from: 0, to: 0 })
})

test('deep sidebar trees use iterative traversal without overflowing the call stack', () => {
  let item = { id: 'last', label: 'Last' }
  for (let index = 19999; index >= 0; index--)
    item = { id: String(index), label: String(index), children: [item] }
  const parents = sidebarParents([item])
  const { rows } = sidebarRows([item], new Set(), false)
  assert.equal(parents.size, 20001)
  assert.equal(parents.get('last'), '19999')
  assert.equal(rows.at(-1).depth, 20000)
})
