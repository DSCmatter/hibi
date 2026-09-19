import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import { SourceStore } from '../src/shared/source-buffer.ts'
import { SourceChunk } from '../src/shared/source-metrics.ts'

if (!global.gc)
  throw new Error('Run with node --expose-gc scripts/check-source-storage.mjs')
const collect = async () => {
  for (let turn = 0; turn < 4; turn++) {
    await setImmediate()
    global.gc()
  }
}
await collect()
const before = process.memoryUsage(),
  chunks = [],
  seen = new WeakSet()
const metrics = SourceChunk.prototype.metrics
SourceChunk.prototype.metrics = function (...args) {
  if (!seen.has(this)) {
    seen.add(this)
    chunks.push(new WeakRef(this))
  }
  return metrics.apply(this, args)
}
const units = 8 * 1024 * 1024
const store = (() => {
  const source = new SourceStore('x'.repeat(units), {
    tabId: 'storage',
    revision: 0,
  })
  source.commit(
    source.prepare({
      document: source.snapshot().document,
      operationId: 'delete',
      baseVersion: 0,
      contentVersion: 1,
      origin: 'source',
      historyGroup: 'delete',
      changes: [{ from: 4096, to: units, insert: '' }],
    }),
  )
  return source
})()
SourceChunk.prototype.metrics = metrics
await collect()
const after = process.memoryUsage(),
  retainedChunks = chunks.filter((chunk) => chunk.deref()).length
assert.equal(store.snapshot().utf16Length, 4096)
const report = {
  sourceUnits: units,
  remainingUnits: store.snapshot().utf16Length,
  chunksCreated: chunks.length,
  retainedChunks,
  heapDeltaMiB: (after.heapUsed - before.heapUsed) / 1024 ** 2,
  bufferDeltaMiB: (after.arrayBuffers - before.arrayBuffers) / 1024 ** 2,
}
console.log(JSON.stringify(report))
if (process.argv.includes('--assert')) {
  assert.equal(
    retainedChunks,
    1,
    'A surviving chunk must not retain the entire build context.',
  )
  assert.ok(
    report.heapDeltaMiB < 4,
    'A 4 KiB survivor must not retain the 8 MiB input string.',
  )
}
