import assert from 'node:assert/strict'
import test from 'node:test'
import { GFM, parser } from '@lezer/markdown'
import { SourceStore } from '../src/shared/source-buffer.ts'
import {
  SourceParserSession,
  sourceParserInput,
} from '../src/shared/source-parser.ts'
import { normalizedSource } from '../src/shared/source-projection.ts'

const treeShape = (tree) => {
  const result = []
  tree.iterate({
    enter: (node) => {
      result.push([node.name, node.from, node.to])
    },
  })
  return result
}
const finish = (session) => {
  for (let count = 0; count < 1_000_000; count++) {
    const state = session.advance()
    if (state.complete) return state.tree
  }
  throw new Error('Parser did not converge.')
}
const edit = (store, changes) => {
  const before = store.snapshot()
  const prepared = store.prepare({
    document: before.document,
    operationId: crypto.randomUUID(),
    baseVersion: before.version,
    contentVersion: before.version + 1,
    origin: 'source',
    historyGroup: 'test',
    changes,
  })
  store.commit(prepared)
  return prepared
}

test('ENG13: normalized snapshot Input starts chunks exactly at every UTF-16 coordinate', () => {
  const source = '\uFEFFa\r\nb😀\nc\rd\r\n',
    normalized = normalizedSource(source)
  const store = new SourceStore(source, { tabId: 'input', revision: 0 })
  for (const size of [1, 2, 3, 4, 32]) {
    const input = sourceParserInput(store.snapshot(), undefined, size)
    assert.equal(input.lineChunks, false)
    assert.equal(input.length, normalized.length)
    for (let from = 0; from <= input.length; from++) {
      assert.equal(input.chunk(from), normalized.slice(from, from + size))
      for (let to = from; to <= input.length; to++)
        assert.equal(input.read(from, to), normalized.slice(from, to))
    }
    for (const value of [-1, NaN, Infinity, input.length + 1])
      assert.throws(() => input.chunk(value), /outside/)
  }
})

test('ENG14: incremental Markdown trees match full dialect parsers through adversarial source changes', () => {
  let seed = 90411
  const random = (max) => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return (seed >>> 0) % max
  }
  const fragments = [
    '# heading\r\n',
    '```js\n',
    '```\n',
    '<div>\n',
    '</div>\n',
    '- item\n  continuation\n',
    '[id]: /url\n',
    '[link][id]\n',
    '| a | b |\n|---|---|\n| c | d |\n',
    '$math$',
    '😀',
    '\r\n',
    '\n',
    ' ',
  ]
  for (const dialect of [parser, parser.configure(GFM)]) {
    const store = new SourceStore(fragments.join(''), {
      tabId: 'parser',
      revision: 0,
    })
    const session = new SourceParserSession(
      store.snapshot(),
      dialect,
      dialect === parser ? 'commonmark' : 'gfm',
    )
    for (let run = 0; run < 250; run++) {
      assert.deepEqual(
        treeShape(finish(session)),
        treeShape(
          dialect.parse(normalizedSource(store.snapshot().materialize())),
        ),
      )
      const before = store.snapshot()
      let from = random(before.utf16Length + 1),
        to = Math.min(before.utf16Length, from + random(8))
      while (!before.isEditBoundary(from)) from--
      while (!before.isEditBoundary(to)) to++
      const insert = fragments[random(fragments.length)]
      const prepared = edit(store, [{ from, to, insert }])
      session.apply(prepared)
      assert.equal(session.state().complete, false)
      assert.equal(session.state().tree, null)
      if (run % 3 === 0) session.advance()
    }
    assert.deepEqual(
      treeShape(finish(session)),
      treeShape(
        dialect.parse(normalizedSource(store.snapshot().materialize())),
      ),
    )
    session.dispose()
    assert.throws(() => session.advance(), /disposed/)
  }
})

test('parser cancellation retains ordered patches and rejects stale roots and dialect reuse', () => {
  const store = new SourceStore('# start\n\ntext\n'.repeat(1000), {
    tabId: 'parser',
    revision: 0,
  })
  const session = new SourceParserSession(
    store.snapshot(),
    parser,
    'commonmark',
    1,
  )
  finish(session)
  const old = session.state()
  const first = edit(store, [{ from: 0, to: 0, insert: '```\n' }])
  session.apply(first)
  session.advance()
  const second = edit(store, [{ from: 5000, to: 5000, insert: '\n```\n' }])
  session.apply(second)
  assert.throws(() => session.apply(first), /stale/)
  assert.equal(old.source.version, 0)
  assert.equal(old.complete, true)
  assert.ok(session.counters().fragments <= 1)
  const gfm = parser.configure(GFM)
  session.reconfigure(gfm, 'gfm')
  assert.equal(session.counters().fragments, 0)
  assert.deepEqual(
    treeShape(finish(session)),
    treeShape(gfm.parse(normalizedSource(store.snapshot().materialize()))),
  )
})
