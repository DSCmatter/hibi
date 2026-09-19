import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { SourceStore } from '../src/shared/source-buffer.ts'
import { SourceMaintenance } from '../src/shared/source-maintenance.ts'
import { SourceChunk } from '../src/shared/source-metrics.ts'

if (!global.gc)
  throw new Error(
    'Run with node --expose-gc scripts/check-source-compaction.mjs',
  )
const chunks = [],
  roots = [],
  seen = new WeakSet()
const metrics = SourceChunk.prototype.metrics
SourceChunk.prototype.metrics = function (...args) {
  if (!seen.has(this)) {
    seen.add(this)
    chunks.push(new WeakRef(this))
  }
  return metrics.apply(this, args)
}
const store = new SourceStore('', {
  tabId: 'compaction-retention',
  revision: 0,
})
const maintenance = new SourceMaintenance(
  store,
  (change) => store.commitCompaction(change),
  (error) => {
    throw error
  },
)
const edit = (changes) => {
  const before = store.snapshot()
  store.commit(
    store.prepare({
      document: before.document,
      operationId: `edit-${before.version}`,
      baseVersion: before.version,
      contentVersion: before.version + 1,
      historyGroup: 'retention',
      origin: 'source',
      changes,
    }),
  )
  roots.push(new WeakRef(store.snapshot()))
}
try {
  for (let cycle = 0; cycle < 12; cycle++) {
    edit([
      {
        from: 0,
        to: store.snapshot().utf16Length,
        insert: 'a'.repeat(80 * 4096),
      },
    ])
    edit(
      Array.from({ length: 80 }, (_, n) => ({
        from: n * 4096,
        to: (n + 1) * 4096 - 1,
        insert: '',
      })),
    )
    await maintenance.request()
    roots.push(new WeakRef(store.snapshot()))
  }
} finally {
  SourceChunk.prototype.metrics = metrics
}
for (let turn = 0; turn < 5; turn++) {
  await setImmediate()
  global.gc()
}
const retainedRoots = roots.filter((root) => root.deref()).length
const retainedChunks = chunks.filter((chunk) => chunk.deref()).length
assert.equal(retainedRoots, 1)
assert.equal(retainedChunks, 1)
assert.equal(store.snapshot().materialize(), 'a'.repeat(80))
console.log(
  JSON.stringify({
    cycles: 12,
    trackedRoots: roots.length,
    retainedRoots,
    trackedChunks: chunks.length,
    retainedChunks,
    sourceUnits: store.snapshot().utf16Length,
    storageEpoch: store.snapshot().storageEpoch,
  }),
)
maintenance.dispose()
