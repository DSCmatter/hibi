import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeSource, sourceText } from '../src/renderer/src/source-text.ts'

test('source offsets preserve CRLF and reject the middle of a line-ending pair', () => {
  const model = sourceText('a\r\n😀b\r\nlast')
  assert.equal(model.text, 'a\n😀b\nlast')
  for (let index = 0; index <= model.text.length; index++)
    assert.equal(model.toEditor(model.toSource(index)), index)
  assert.equal(model.toEditor(2), null)
  assert.equal(model.toEditor(7), null)
  assert.equal(
    model.apply([{ from: 2, to: 4, insert: 'é' }]),
    'a\r\néb\r\nlast',
  )
  assert.equal(
    model.apply([
      { from: model.text.length, to: model.text.length, insert: '\nnew' },
    ]),
    'a\r\n😀b\r\nlast\r\nnew',
  )
})

test('edits preserve untouched mixed endings and use the document style for new breaks', () => {
  const source = 'header\r\nbody\nother\rtail'
  const model = sourceText(source)
  assert.equal(
    model.apply([{ from: 7, to: 11, insert: 'changed' }]),
    'header\r\nchanged\nother\rtail',
  )
  assert.equal(
    normalizeSource(model.apply([{ from: 7, to: 11, insert: 'new\nbody' }])),
    'header\nnew\nbody\nother\ntail',
  )
  assert.equal(
    sourceText('plain').apply([{ from: 0, to: 5, insert: 'new' }]),
    'new',
  )
})
