import { execFileSync } from 'node:child_process'
import os from 'node:os'
import { GFM, parser } from '@lezer/markdown'
import { MarkdownSourceModel } from '../src/shared/markdown-source-model.ts'
import { MarkdownSourceReferences } from '../src/shared/markdown-source-references.ts'
import { SourceStore } from '../src/shared/source-buffer.ts'

const sizes = process.argv.slice(2).map(Number)
if (!sizes.length) sizes.push(1000, 10000, 100000)
if (
  sizes.some((size) => !Number.isSafeInteger(size) || size < 1 || size > 100000)
)
  throw new Error('Use definition counts from 1 to 100000.')
const percentile = (sorted, fraction) =>
  sorted[Math.ceil(sorted.length * fraction) - 1]
const results = []
for (const count of sizes) {
  const text = '[ref]: /target\r\n\r\n'.repeat(count)
  const store = new SourceStore(text, { tabId: 'benchmark', revision: 0 })
  const model = new MarkdownSourceModel(
    store.snapshot(),
    parser.configure(GFM),
    'gfm',
  )
  const reader = new MarkdownSourceReferences({
    gfm: true,
    alerts: true,
    textExtras: true,
  })
  const parse = () => {
    const started = performance.now()
    while (!model.advance().complete) {
      /* Isolate reader measurements from parsing. */
    }
    return performance.now() - started
  }
  const read = () => {
    const state = model.state(),
      work = reader.update(state.source, state.owners)
    const steps = [],
      started = performance.now()
    for (;;) {
      const before = performance.now(),
        step = work.next()
      steps.push(performance.now() - before)
      if (step.done) break
    }
    const elapsedMs = performance.now() - started,
      finalCommitMs = steps.at(-1),
      firstStepMs = steps[0],
      maxStepIndex = steps.reduce(
        (best, value, index) => (value > steps[best] ? index : best),
        0,
      )
    steps.sort((a, b) => a - b)
    return {
      elapsedMs,
      steps: steps.length,
      p50StepMs: percentile(steps, 0.5),
      p95StepMs: percentile(steps, 0.95),
      p99StepMs: percentile(steps, 0.99),
      maxStepMs: steps.at(-1),
      finalCommitMs,
      firstStepMs,
      maxStepIndex,
      work: reader.counters(true),
    }
  }
  const parseMs = parse(),
    cold = read()
  const before = store.snapshot()
  const change = store.prepare({
    document: before.document,
    operationId: 'prefix',
    baseVersion: 0,
    contentVersion: 1,
    origin: 'source',
    historyGroup: 'benchmark',
    changes: [{ from: 0, to: 0, insert: '# prefix\r\n\r\n' }],
  })
  store.commit(change)
  model.apply(change)
  const editParseMs = parse(),
    prefix = read()
  results.push({
    count,
    bytes: Buffer.byteLength(text),
    utf16: text.length,
    lines: count * 2 + 1,
    owners: model.state().owners.count,
    parseMs,
    editParseMs,
    cold,
    prefix,
    source: store.counters(),
    memory: process.memoryUsage(),
    result: reader.lookup('ref'),
  })
  reader.dispose()
  model.dispose()
}
console.log(
  JSON.stringify(
    {
      kind: 'core reader steps, not native input latency',
      head: execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim(),
      dirty: execFileSync('git', ['status', '--porcelain'], {
        encoding: 'utf8',
      }).trim(),
      mode: 'Node strip-types source modules, no bundling',
      versions: process.versions,
      environment: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        cpu: os.cpus()[0]?.model,
      },
      results,
    },
    null,
    2,
  ),
)
