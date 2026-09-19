import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { parseDocumentChange } from '../src/shared/document-journal.ts'
import { parseSourceOperation } from '../src/shared/source-operations.ts'

if (!global.gc)
  throw new Error(
    'Run with node --expose-gc scripts/check-operation-storage.mjs',
  )
const collect = async () => {
  for (let turn = 0; turn < 4; turn++) {
    await setImmediate()
    global.gc()
  }
}
await collect()
const before = process.memoryUsage().heapUsed
const payloads = [
  (insert) =>
    parseSourceOperation({
      document: { tabId: 'atomic', revision: 0 },
      operationId: 'copy',
      baseVersion: 0,
      contentVersion: 1,
      origin: 'source',
      historyGroup: 'copy',
      changes: [{ from: 0, to: 0, insert }],
    }),
  (insert) =>
    parseDocumentChange({
      tabId: 'legacy',
      revision: 0,
      baseVersion: 0,
      contentVersion: 1,
      from: 0,
      to: 0,
      insert,
    }),
].map((create, index) => {
  const parent = 'x'.repeat(8 * 1024 * 1024) + index
  return create(parent.slice(1024, 5120))
})
await collect()
const heapDeltaMiB = (process.memoryUsage().heapUsed - before) / 1024 ** 2
const retainedUnits = payloads.reduce(
  (sum, payload) =>
    sum +
    ('changes' in payload
      ? payload.changes[0].insert.length
      : payload.insert.length),
  0,
)
console.log(JSON.stringify({ retainedUnits, heapDeltaMiB }))
assert.equal(retainedUnits, 8192)
if (process.argv.includes('--assert'))
  assert.ok(
    heapDeltaMiB < 4,
    'Small retained edits must not own their large source-string parents.',
  )
