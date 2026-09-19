import assert from 'node:assert/strict'
import test from 'node:test'
import { DocumentRuntime } from '../src/renderer/src/document-runtime.ts'

const document = (text, overrides = {}) => ({
  tabId: 'one',
  tabs: [{ id: 'one', name: 'one.md', dirty: false }],
  tabsEnabled: true,
  id: 'file-one',
  ephemeral: false,
  markdown: text,
  savedMarkdown: text,
  name: 'one.md',
  dirty: false,
  revision: 1,
  contentVersion: 0,
  canAutosave: true,
  ...overrides,
})
const fixture = () => {
  const operations = [],
    errors = []
  const runtime = new DocumentRuntime({
    enqueue: (op) => operations.push(op),
    onError: (error) => errors.push(error),
  })
  return { runtime, operations, errors }
}

test('runtime facades capture immutable full snapshots and do not flatten on publication', () => {
  const { runtime, operations } = fixture()
  const original = runtime.activate(document('old source'))
  const session = runtime.session()
  const notices = []
  runtime.subscribe((next, changes) => notices.push({ next, changes }))
  session.counters(true)
  session.edit([{ from: 0, to: 3, insert: 'new' }], 'source', 'typing', () => {
    assert.equal(runtime.get().contentVersion, 1)
    assert.equal(operations.length, 1)
  })
  assert.equal(session.counters().materializations, 0)
  const current = runtime.get()
  assert.equal(runtime.get(), current)
  assert.equal(notices[0].next, current)
  assert.equal(notices[0].changes[0].insert, 'new')
  assert.equal(runtime.sourceFor(current).sliceRaw(0, 3), 'new')
  assert.equal(current.markdown, 'new source')
  assert.equal(original.markdown, 'old source')
  assert.equal(original.contentVersion, 0)
  assert.equal(current.savedMarkdown, 'old source')
  assert.throws(() => {
    current.markdown = 'bad'
  }, TypeError)
  runtime.dispose()
})

test('runtime imports saved V while V+1 remains dirty and preserves history across tab revisions', async () => {
  const { runtime, operations, errors } = fixture()
  runtime.activate(document('a'))
  runtime.replace('ab')
  const saving = { ...runtime.get(), savedMarkdown: 'ab', dirty: false }
  runtime.replace('abc')
  runtime.acknowledgeSave(saving)
  assert.equal(runtime.get().dirty, true)
  assert.equal(runtime.get().savedMarkdown, 'ab')
  const first = { ...runtime.get() },
    firstSession = runtime.session()
  const tabs = [
    { id: 'one', name: 'one.md', dirty: true },
    { id: 'two', name: 'two.md', dirty: false },
  ]
  runtime.activate(
    document('other', { tabId: 'two', id: 'file-two', revision: 2, tabs }),
  )
  runtime.activate({ ...first, revision: 3, tabs })
  assert.equal(runtime.session(), firstSession)
  firstSession.undo()
  await firstSession.settled()
  assert.equal(runtime.get().markdown, 'ab')
  assert.equal(runtime.get().dirty, false)
  assert.equal(operations.at(-1).document.revision, 3)
  assert.deepEqual(errors, [])
  runtime.dispose()
})

test('runtime treats whole-source line-ending transforms as explicit atomic compatibility edits', () => {
  const { runtime, operations } = fixture()
  runtime.activate(document('a\r\nb\n'))
  runtime.replace('a\nb\n')
  assert.equal(runtime.get().markdown, 'a\nb\n')
  assert.equal(operations.length, 1)
  runtime.session().undo()
  assert.equal(runtime.get().markdown, 'a\r\nb\n')
  runtime.dispose()
})
