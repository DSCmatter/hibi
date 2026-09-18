import assert from 'node:assert/strict'
import test from 'node:test'
import {
  editedSource,
  parseSourceEditRequest,
  sourceEditMatches,
} from '../src/shared/document-edits.ts'

const request = (changes) => ({
  requestId: 'review:1',
  tabId: 'tab',
  revision: 1,
  contentVersion: 2,
  changes,
})
const edit = (from, to, insert, expectedText = '') => ({
  from,
  to,
  insert,
  expectedText,
})
test('source edits validate exact ranges, order, Unicode boundaries, and UTF-8 limits', () => {
  const normalized = parseSourceEditRequest(
    request([edit(6, 11, 'there', 'world'), edit(0, 5, 'hi', 'hello')]),
  )
  assert.equal(editedSource('hello world', normalized.changes, 100), 'hi there')
  assert.ok(
    sourceEditMatches(normalized, {
      tabId: 'tab',
      revision: 1,
      contentVersion: 2,
    }),
  )
  assert.equal(
    sourceEditMatches(normalized, {
      tabId: 'other',
      revision: 1,
      contentVersion: 2,
    }),
    false,
  )
  assert.equal(
    sourceEditMatches(normalized, {
      tabId: 'tab',
      revision: 1,
      contentVersion: 3,
    }),
    false,
  )
  for (const changes of [
    [edit(-1, 0, '')],
    [edit(0.5, 1, '')],
    [edit(0, Infinity, '')],
    [edit(0, 0, '\ud800')],
    Array.from({ length: 257 }, () => edit(0, 0, 'x')),
  ])
    assert.throws(() => parseSourceEditRequest(request(changes)))
  for (const changes of [
    [edit(1, 2, 'x', '\ude00')],
    [edit(0, 1, 'x', '\ud83d')],
    [edit(0, 3, '')],
    [edit(0, 2, 'x', 'different')],
    [edit(0, 2, 'a', '😀'), edit(1, 2, 'b', '\ude00')],
    [edit(0, 0, 'a'), edit(0, 0, 'b')],
    [edit(0, 2, 'a', '😀'), edit(2, 2, 'b')],
  ])
    assert.throws(() =>
      editedSource('😀', parseSourceEditRequest(request(changes)).changes, 100),
    )
  assert.equal(editedSource('😀', [edit(0, 2, 'é', '😀')], 2), 'é')
  assert.throws(() => editedSource('', [edit(0, 0, '😀')], 3), /size limit/)
  assert.equal(
    editedSource('ab', [edit(0, 1, 'x', 'a'), edit(1, 2, 'y', 'b')], 2),
    'xy',
  )
})
