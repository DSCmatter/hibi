import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { DocumentSession } from '../src/shared/document-session.ts'

if (!global.gc)
  throw new Error(
    'Run with node --expose-gc scripts/check-source-retention.mjs',
  )
const session = new DocumentSession(
  '',
  { tabId: 'retention', revision: 0 },
  0,
  {
    enqueue: () => {},
    onError: (error) => {
      throw error
    },
  },
)
const roots = []
for (let edit = 0; edit < 40; edit++) {
  session.edit(
    [{ from: edit, to: edit, insert: 'x' }],
    'source',
    `edit-${edit}`,
  )
  roots.push(new WeakRef(session.snapshot()))
}
await session.settled()
for (let turn = 0; turn < 4; turn++) {
  await setImmediate()
  global.gc()
}
const retained = roots.filter((root) => root.deref()).length
assert.equal(
  retained,
  1,
  'Only the current root should be held; history stores exact changes and lengths.',
)
for (let edit = 0; edit < 40; edit++) session.undo()
assert.equal(session.snapshot().materialize(), '')
assert.equal(session.state().dirty, false)
for (let edit = 0; edit < 40; edit++) session.redo()
assert.equal(session.snapshot().materialize(), 'x'.repeat(40))
console.log(
  JSON.stringify({
    retainedEditedRoots: retained,
    history: session.historySize(),
    undoRedo: 'exact',
  }),
)
session.dispose()
