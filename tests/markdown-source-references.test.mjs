import assert from 'node:assert/strict'
import test from 'node:test'
import { GFM, parser } from '@lezer/markdown'
import { MarkdownSourceModel } from '../src/shared/markdown-source-model.ts'
import { MarkdownSourceReferences } from '../src/shared/markdown-source-references.ts'
import { SourceStore } from '../src/shared/source-buffer.ts'

test('built-in reference reader keeps prefix edits local without materializing source', () => {
  const store = new SourceStore(
    '[ref]: /first\n\n' + '[ref]: /duplicate\n\n'.repeat(5000),
    { tabId: 'reader', revision: 0 },
  )
  const model = new MarkdownSourceModel(
    store.snapshot(),
    parser.configure(GFM),
    'gfm',
  )
  const references = new MarkdownSourceReferences({
    gfm: true,
    alerts: true,
    textExtras: true,
  })
  const finish = () => {
    let state
    do {
      state = model.advance()
    } while (!state.complete)
    for (const _ of references.update(state.source, state.owners)) {
      /* Complete the cooperative read. */
    }
  }
  finish()
  assert.equal(references.lookup('ref').href, '/first')
  references.counters(true)
  store.counters(true)
  const before = store.snapshot()
  const change = store.prepare({
    document: before.document,
    operationId: 'prefix',
    baseVersion: 0,
    contentVersion: 1,
    origin: 'source',
    historyGroup: 'typing',
    changes: [{ from: 0, to: 0, insert: '# prefix\n\n' }],
  })
  store.commit(change)
  model.apply(change)
  finish()
  assert.equal(references.lookup('ref').href, '/first')
  assert.ok(
    references.counters().ownersRead < 8,
    JSON.stringify(references.counters()),
  )
  // The new separator changes the first definition's leading input context.
  assert.equal(references.counters().definitionsRead, 1)
  assert.equal(store.counters().materializations, 0)
  references.dispose()
  model.dispose()
})
