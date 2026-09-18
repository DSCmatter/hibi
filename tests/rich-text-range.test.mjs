import assert from 'node:assert/strict'
import test from 'node:test'
import { getSchema } from '@tiptap/core'
import { TableKit } from '@tiptap/extension-table'
import { MarkdownManager } from '@tiptap/markdown'
import { Transform } from '@tiptap/pm/transform'
import { StarterKit } from '@tiptap/starter-kit'
import { exactRichRange } from '../src/renderer/src/rich-text-range.ts'
import { textProjection } from '../src/renderer/src/text-projection.ts'
import { projectionRange } from '../src/shared/document-projection.ts'

const extensions = [StarterKit.configure({ trailingNode: false }), TableKit]
const manager = new MarkdownManager({
  extensions,
  markedOptions: { gfm: true },
})
const schema = getSchema(extensions)
const parse = (source) => schema.nodeFromJSON(manager.parse(source))

test('rich edit provenance distinguishes repeated text and preserves marks, lists, tables, and Unicode', () => {
  for (const [source, from, to] of [
    ['word word word', 5, 9],
    ['**word** word', 2, 6],
    ['# heading', 2, 9],
    ['- first\n- second', 10, 16],
    ['> quoted word', 9, 13],
    ['[word](https://example.com/word)', 1, 5],
    ['😀 é note', 3, 5],
    ['| a | b |\n|---|---|\n| word | c |', 22, 26],
  ]) {
    const doc = parse(source)
    const range = exactRichRange(doc, manager, source, from, to)
    assert.ok(range, `${source}: ${source.slice(from, to)}`)
    const edited = new Transform(doc).replaceWith(
      range.from,
      range.to,
      schema.text('changed', range.marks),
    ).doc
    assert.ok(
      edited.eq(parse(source.slice(0, from) + 'changed' + source.slice(to))),
      source,
    )
  }
})

test('markup, entities, code, structural ranges, and stale rich state remain unmapped', () => {
  for (const [source, from, to] of [
    ['**word**', 0, 2],
    ['a &amp; b', 2, 7],
    ['a \\* b', 2, 4],
    ['`word`', 1, 5],
    ['```\nword\n```', 4, 8],
    ['one\n\ntwo', 0, 8],
    ['[word](https://example.com)', 7, 12],
  ])
    assert.equal(
      exactRichRange(parse(source), manager, source, from, to),
      null,
      source,
    )
  assert.equal(exactRichRange(parse('different'), manager, 'word', 0, 4), null)
})

test('analysis spans map exact source slices and exclude metadata, code, destinations, and escaped text', () => {
  const source =
    '---\ntitle: hidden\n---\n\nword **word** [word](https://example.com/hidden)\n\n`hidden`\n\n```\nhidden\n```\n\n&amp; escaped'
  const projected = textProjection(source, true)
  assert.equal(projected.text.includes('hidden'), false)
  assert.equal(projected.text.includes('example'), false)
  for (const span of projected.spans) {
    assert.equal(
      projected.text.slice(span.from, span.to),
      source.slice(span.sourceFrom, span.sourceTo),
    )
    assert.deepEqual(projectionRange(projected, span.from, span.to), {
      from: span.sourceFrom,
      to: span.sourceTo,
    })
  }
  assert.equal(projected.text.match(/word/g).length, 3)
  assert.equal(projectionRange(projected, -1, 2), null)
  assert.equal(projectionRange(projected, 0, projected.text.length), null)
})
