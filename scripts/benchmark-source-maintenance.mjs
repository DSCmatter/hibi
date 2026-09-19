import { SourceStore } from '../src/shared/source-buffer.ts'
import { SourceMaintenance } from '../src/shared/source-maintenance.ts'

const percentile = (values, fraction) =>
  [...values].sort((a, b) => a - b)[
    Math.floor((values.length - 1) * fraction)
  ] ?? 0
const drain = (iterator) => {
  const times = []
  const start = performance.now()
  for (;;) {
    const step = performance.now(),
      next = iterator.next()
    times.push(performance.now() - step)
    if (next.done)
      return {
        result: next.value,
        steps: times.length,
        totalMs: performance.now() - start,
        p95StepMs: percentile(times, 0.95),
        maxStepMs: Math.max(...times),
      }
  }
}
const prepare = (lines) => {
  const store = new SourceStore('a'.repeat(63).concat('\n').repeat(lines), {
    tabId: 'benchmark',
    revision: 0,
  })
  const changes = []
  for (let from = 0; from < store.snapshot().utf16Length; from += 4096) {
    const to = Math.min(from + 3072, store.snapshot().utf16Length)
    changes.push({ from, to, insert: '' })
  }
  store.commit(
    store.prepare({
      document: store.snapshot().document,
      operationId: 'fragment',
      baseVersion: 0,
      contentVersion: 1,
      origin: 'source',
      historyGroup: 'fragment',
      changes,
    }),
  )
  return store
}
const samples = []
for (const lines of [1000, 10000, 100000])
  for (let run = 0; run < 3; run++) {
    const store = prepare(lines)
    store.counters(true)
    const audit = drain(store.inspectStorage())
    const prepared = drain(store.prepareCompaction())
    store.commitCompaction(prepared.result)
    const after = drain(store.inspectStorage()).result
    const measured = store.counters()
    const scheduled = prepare(lines)
    const errors = []
    let commits = 0,
      ticks = 0
    const maintenance = new SourceMaintenance(
      scheduled,
      (change) => {
        scheduled.commitCompaction(change)
        commits++
      },
      (error) => errors.push(String(error)),
    )
    const heartbeat = setInterval(() => ticks++, 0)
    const start = performance.now()
    await maintenance.request()
    const scheduledMs = performance.now() - start
    clearInterval(heartbeat)
    maintenance.dispose()
    const { source: _source, ...usage } = audit.result
    const { result: _auditResult, ...auditTiming } = audit
    const { result: _preparedResult, ...compactionTiming } = prepared
    samples.push({
      lines,
      run,
      sourceUnits: after.source.utf16Length,
      before: usage,
      after: {
        allocatedUnits: after.allocatedUnits,
        indexBytes: after.indexBytes,
        chunks: after.chunks,
        pieces: after.pieces,
      },
      audit: auditTiming,
      compaction: compactionTiming,
      counters: measured,
      scheduler: {
        milliseconds: scheduledMs,
        commits,
        eventLoopTicks: ticks,
        errors,
      },
    })
  }
console.log(
  JSON.stringify(
    {
      runtime: process.version,
      platform: process.platform,
      architecture: process.arch,
      workload:
        'retain final quarter of each 4096-unit chunk; three independent stores at each scale',
      samples,
    },
    null,
    2,
  ),
)
