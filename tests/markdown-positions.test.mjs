import assert from 'node:assert/strict'
import test from 'node:test'
import { getSchema } from '@tiptap/core'
import { Image } from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import { TaskItem } from '@tiptap/extension-task-item'
import { TaskList } from '@tiptap/extension-task-list'
import { MarkdownManager } from '@tiptap/markdown'
import { Schema } from '@tiptap/pm/model'
import { StarterKit } from '@tiptap/starter-kit'
import { Marked, marked } from 'marked'
import {
  createMarkdownPositionCache,
  markdownPositions,
} from '../src/renderer/src/markdown-positions.ts'
import { markdownSyntax } from '../src/renderer/src/markdown-syntax.ts'
import { sourceText } from '../src/renderer/src/source-text.ts'
import { preserveDisabled } from '../src/renderer/src/syntax-parser.ts'

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph*' },
    paragraph: { content: 'text*' },
    text: {},
  },
})
const document = (...paragraphs) =>
  schema.node(
    'doc',
    null,
    paragraphs.map((text) =>
      schema.node('paragraph', null, text ? schema.text(text) : null),
    ),
  )

// Previous production algorithm: keep its point order and tie behavior as oracle.
function pointOracle(source, document) {
  const original = sourceText(source)
  source = original.text
  let text = ''
  const offsets = []
  function visit(tokens, raw, base) {
    let cursor = 0
    for (const token of tokens) {
      const at = raw.indexOf(token.raw, cursor)
      if (at < 0) continue
      cursor = at + token.raw.length
      const offset = base + at
      if (token.type === 'image' || token.type === 'html') continue
      if (token.type === 'list') visit(token.items, token.raw, offset)
      else if (token.type === 'table') {
        const cells = [...token.header, ...token.rows.flat()]
        visit(
          cells.flatMap((cell) => cell.tokens),
          token.raw,
          offset,
        )
      } else if ('tokens' in token && token.tokens?.length)
        visit(token.tokens, token.raw, offset)
      else if (
        'text' in token &&
        typeof token.text === 'string' &&
        token.text
      ) {
        const start = token.raw.indexOf(token.text)
        if (start < 0) continue
        text += token.text
        for (let index = 0; index < token.text.length; index++)
          offsets.push(offset + start + index)
      }
    }
  }
  const tokens = marked.lexer(source)
  marked.walkTokens(tokens, preserveDisabled)
  visit(tokens, source, 0)
  const points = []
  let cursor = 0
  document.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const start = text.indexOf(node.text, cursor)
    if (start < 0) return
    for (let i = 0; i <= node.text.length; i++) {
      const offset = offsets[start + Math.min(i, node.text.length - 1)]
      if (offset !== undefined)
        points.push({
          source: original.toSource(offset + Number(i === node.text.length)),
          rich: pos + i,
        })
    }
    cursor = start + node.text.length
  })
  if (!source.trim() && document.firstChild?.isTextblock)
    points.push({ source: 0, rich: 1 })
  return (position, from) => {
    const to = from === 'source' ? 'rich' : 'source'
    let low = 0,
      high = points.length - 1
    while (low <= high) {
      const middle = (low + high) >>> 1,
        point = points[middle]
      if (!point) return null
      if (point[from] < position) low = middle + 1
      else high = middle - 1
    }
    const after = points[low],
      before = points[low - 1]
    const nearest = !before
      ? after
      : !after
        ? before
        : position - before[from] <= after[from] - position
          ? before
          : after
    return nearest?.[to] ?? null
  }
}

function compareEveryPosition(source, document) {
  const actual = markdownPositions(source, document),
    expected = pointOracle(source, document)
  for (const from of ['source', 'rich']) {
    const end = from === 'source' ? source.length : document.content.size
    for (let position = -2; position <= end + 2; position += 0.5)
      assert.equal(
        actual(position, from),
        expected(position, from),
        `${from} ${position}: ${JSON.stringify(source)}`,
      )
    for (const position of [NaN, -Infinity, Infinity])
      assert.equal(actual(position, from), expected(position, from))
  }
}

test('compact mapping matches previous point lookup at every source and rich position', () => {
  const extensions = [
    StarterKit.configure({ trailingNode: false }),
    Image,
    TableKit,
    TaskList,
    TaskItem,
  ]
  const richSchema = getSchema(extensions)
  const manager = new MarkdownManager({
    marked: new Marked({ gfm: true }),
    extensions,
  })
  const cases = [
    '',
    ' \r\n\r\n',
    'hello',
    'one\ntwo\r\nthree\rfour',
    '**bold**plain*italic*end',
    'word **word** word',
    '# heading\n\nparagraph\n\n## next',
    '**bold**\r\n\r\n*italic*\r\nlast',
    '> quote\n> nested **word**\n\nlast',
    '- one\n- two\n  - nested\n\nlast',
    '1. numbered\n2. next\n\n- [ ] task',
    '| a | a |\n|---|---|\n| **a** | b |',
    '[same](https://same.test) and ![same](same.png) same',
    '[ref]\n\n[ref]: /destination',
    'text <b>html</b> tail\n\nlast',
    'a &amp; b &#13; c \\*literal*',
    '```txt\none\r\ntwo\n```\n\nlast',
    '` code ` and ``a`b``',
    '😀 é 👩🏽‍💻\r\n\r\n🇵🇭',
  ]
  const blocks = [
    'same **same**',
    '# heading *words*',
    '> quote\n> next',
    '- one\n- two',
    '[link](url)',
    '`code` text',
    '    indented',
    'plain\ncontinued',
  ]
  let seed = 78123
  for (let index = 0; index < 60; index++) {
    const chosen = []
    for (let part = 0; part < 1 + (index % 4); part++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      chosen.push(blocks[seed % blocks.length])
    }
    const source = chosen.join('\n\n')
    cases.push(index % 2 ? source.replaceAll('\n', '\r\n') : source)
  }
  for (const source of cases)
    compareEveryPosition(source, richSchema.nodeFromJSON(manager.parse(source)))
  for (const [source, paragraphs] of [
    ['**one**two', ['onetwo']],
    ['**one**two', ['one', 'two']],
    ['before ![hidden](image.png) after', ['unmappable', 'after']],
    ['one\r\ntwo\r\nthree', ['one\ntwo\nthree']],
    ['same **same** same', ['same', 'missing', 'same']],
    ['nothing', ['unmappable']],
  ])
    compareEveryPosition(source, document(...paragraphs))
})

test('mapping allocation follows text runs rather than paragraph character count', (t) => {
  const source = 'ordinary text '.repeat(5000),
    doc = document(source)
  const allocations = (create) => {
    const push = Array.prototype.push
    let points = 0,
      numbers = 0
    Array.prototype.push = function (...values) {
      for (const value of values) {
        if (typeof value === 'number') numbers++
        else if (
          value &&
          typeof value === 'object' &&
          'source' in value &&
          'rich' in value
        )
          points++
      }
      return push.apply(this, values)
    }
    try {
      const lookup = create(source, doc)
      return { lookup, points, numbers }
    } finally {
      Array.prototype.push = push
    }
  }
  const expected = allocations(pointOracle)
  assert.equal(expected.points, source.length + 1)
  assert.ok(expected.numbers >= source.length)
  const actual = allocations(markdownPositions)
  assert.equal(
    actual.points,
    1,
    'one contiguous paragraph needs one mapping span',
  )
  assert.ok(actual.numbers < 32, 'mapping must not append character offsets')
  t.diagnostic(
    `mapping objects ${expected.points} -> ${actual.points}; scalar appends ${expected.numbers} -> ${actual.numbers}`,
  )
  for (const position of [
    0,
    1,
    source.length / 2,
    source.length,
    source.length + 1,
  ]) {
    assert.equal(
      actual.lookup(position, 'source'),
      expected.lookup(position, 'source'),
    )
    assert.equal(
      actual.lookup(position, 'rich'),
      expected.lookup(position, 'rich'),
    )
  }
})

test('disabled literal syntax preserves old nearest points and gap ties', () => {
  const enabled = markdownSyntax.enabled('core.bold')
  try {
    markdownSyntax.setEnabled('core.bold', false)
    compareEveryPosition(
      '**one**two\r\n\r\n**three**',
      document('**one**two', '**three**'),
    )
  } finally {
    markdownSyntax.setEnabled('core.bold', enabled)
  }
})

test('one editor map is reused across consumers and only the latest exact source/document is retained', () => {
  const lookup = createMarkdownPositionCache(),
    doc = document('hello', 'world')
  const source = '**hello**\r\n\r\nworld',
    first = lookup(source, doc)
  assert.equal(lookup(source, doc), first)
  assert.equal(first(1, 'rich'), 2)
  assert.equal(first(2, 'source'), 1)
  assert.equal(first(8, 'rich'), 13)
  const changedSource = lookup(` ${source}`, doc)
  assert.notEqual(changedSource, first)
  const restored = lookup(source, doc)
  assert.notEqual(
    restored,
    first,
    'cache does not keep every historical source',
  )
  assert.equal(restored(8, 'rich'), first(8, 'rich'))
  assert.notEqual(lookup(source, document('hello', 'world')), restored)
  assert.notEqual(
    createMarkdownPositionCache()(source, doc),
    restored,
    'schema generation owns its cache',
  )
})

test('syntax traversal matches Marked without accumulating per-token return values', (t) => {
  const walk = marked.walkTokens
  let walks = 0
  t.mock.method(marked, 'walkTokens', (tokens, callback) => {
    const expected = structuredClone(tokens)
    walk(expected, (token) => {
      preserveDisabled(token)
    })
    const result = walk(tokens, callback)
    assert.deepEqual(structuredClone(tokens), expected)
    assert.deepEqual(
      result,
      [],
      'return arrays must stay empty for wide documents',
    )
    walks++
    return result
  })
  const source = [
    '# heading **bold**',
    '> quote *italic*',
    '- first\n  - second',
    '| a | b |\n| - | - |\n| **c** | d |',
    '![image](image.png)',
    '<b>html</b>',
  ].join('\n\n')
  const clear = markdownSyntax.register('map-test', {
    id: 'list',
    label: 'list',
    group: 'tests',
    description: 'test',
    level: 'block',
    matches: (token) => token.type === 'list',
  })
  t.after(clear)
  markdownSyntax.setEnabled('map-test.list', false)
  t.after(() => markdownSyntax.setEnabled('map-test.list', true))
  markdownPositions(
    source,
    document('heading bold', 'quote italic', '- first\n  - second'),
  )
  markdownPositions('paragraph\n\n'.repeat(5000), document('paragraph'))
  assert.equal(walks, 2)
})
