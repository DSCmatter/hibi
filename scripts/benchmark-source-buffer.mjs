import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { cpus, totalmem } from 'node:os'
import { performance } from 'node:perf_hooks'
import { Text } from '@codemirror/state'
import { SourceStore } from '../src/shared/source-buffer.ts'
import { documentEngineFixture } from './document-engine-fixtures.mjs'

const output = process.argv[2]
const iterations = Number(process.env.HIBI_KERNEL_EDITS ?? 2000)
const runs = Number(process.env.HIBI_KERNEL_RUNS ?? 3)
const pattern = process.env.HIBI_KERNEL_PATTERN ?? 'rotating'
if (
  !Number.isInteger(iterations) ||
  iterations < 1 ||
  iterations > 100_000 ||
  !Number.isInteger(runs) ||
  runs < 1 ||
  runs > 20 ||
  !['rotating', 'typing'].includes(pattern)
)
  throw new Error('Invalid kernel benchmark sample count.')
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]
const report = {
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: execFileSync('git', ['status', '--short'], {
    encoding: 'utf8',
  }).trim(),
  environment: {
    runtime: process.versions,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model,
    memoryBytes: totalmem(),
    gcAvailable: typeof global.gc === 'function',
  },
  scope:
    'source storage microbenchmark; no editor, journaling, visual echo or production selection claim',
  pattern,
  samples: [],
}
for (const lines of [1000, 10_000, 100_000]) {
  const fixture = documentEngineFixture('text', lines)
  const configurations = [
    {
      engine:
        'CodeMirror Text control (storage only; no raw coordinate/UTF-8 metrics)',
    },
    ...[16, 32, 64].flatMap((fanout) =>
      [32, 64, 128].flatMap((leafCapacity) =>
        [4096, 16384, 65536].map((chunkUnits) => ({
          engine: 'piece-bplus',
          fanout,
          leafCapacity,
          chunkUnits,
        })),
      ),
    ),
  ]
  for (const config of configurations) {
    for (let run = 0; run < runs; run++) {
      global.gc?.()
      const memoryBefore = process.memoryUsage(),
        heapBefore = memoryBefore.heapUsed
      const coldStart = performance.now()
      const store =
        config.engine === 'piece-bplus'
          ? new SourceStore(
              fixture.source,
              { tabId: 'benchmark', revision: 0 },
              0,
              { ...config, maximumBytes: 32 * 1024 * 1024 },
            )
          : null
      let cm = store ? null : Text.of(fixture.source.split('\n'))
      const coldMs = performance.now() - coldStart
      const times = [],
        retained = [],
        positions = []
      store?.counters(true)
      for (let edit = 0; edit < iterations; edit++) {
        const length = fixture.source.length + edit
        const from =
          pattern === 'typing'
            ? Math.floor(fixture.source.length / 2) + edit
            : edit % 3 === 0
              ? 0
              : edit % 3 === 1
                ? Math.floor(length / 2)
                : length
        positions.push(from)
        const start = performance.now()
        if (store) {
          store.commit(
            store.prepare({
              document: { tabId: 'benchmark', revision: 0 },
              operationId: `op-${edit}`,
              baseVersion: edit,
              contentVersion: edit + 1,
              origin: 'source',
              historyGroup: 'typing',
              changes: [{ from, to: from, insert: 'x' }],
            }),
          )
          if (edit % 20 === 0) retained.push(store.snapshot())
        } else {
          cm = cm.replace(from, from, Text.of(['x']))
          if (edit % 20 === 0) retained.push(cm)
        }
        times.push(performance.now() - start)
      }
      const counters = store?.counters()
      const memoryAfter = process.memoryUsage(),
        heapAfter = memoryAfter.heapUsed
      let expected = Text.of(fixture.source.split('\n'))
      for (const from of positions)
        expected = expected.replace(from, from, Text.of(['x']))
      assert.equal(
        store ? store.snapshot().materialize() : cm.toString(),
        expected.toString(),
      )
      const shape = store?.inspect()
      assert.deepEqual(shape?.problems ?? [], [])
      report.samples.push({
        fixture: fixture.metadata,
        ...config,
        coldMs,
        run,
        edits: iterations,
        p50: percentile(times, 0.5),
        p95: percentile(times, 0.95),
        p99: percentile(times, 0.99),
        maximum: Math.max(...times),
        heapBefore,
        heapAfter,
        memoryBefore,
        memoryAfter,
        retainedRoots: retained.length,
        counters,
        shape: shape && {
          pieceCount: shape.pieceCount,
          leafCount: shape.leafCount,
          height: shape.height,
          occupancy: shape.occupancy.map((values) => ({
            minimum: Math.min(...values),
            maximum: Math.max(...values),
            count: values.length,
          })),
        },
      })
    }
  }
  if (output) await writeFile(output, JSON.stringify(report, null, 2))
  console.log(
    JSON.stringify({
      lines,
      completeConfigurations: configurations.length,
      runs,
      edits: iterations,
    }),
  )
}
if (!output) console.log(JSON.stringify(report, null, 2))
