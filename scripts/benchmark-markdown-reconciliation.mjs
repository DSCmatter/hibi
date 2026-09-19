import { parser } from '@lezer/markdown'
import { MarkdownSourceModel } from '../src/shared/markdown-source-model.ts'
import { SourceStore } from '../src/shared/source-buffer.ts'

const finish = (model) => {
  while (!model.advance().complete) {}
}
const samples = []
for (const fences of [128, 256, 512, 1024]) {
  const fence = '`'.repeat(3)
  const source = Array.from(
    { length: fences },
    (_, index) => `${fence}\nbody ${index}\n`,
  ).join('')
  const store = new SourceStore(source, { tabId: 'fences', revision: 0 })
  const model = new MarkdownSourceModel(store.snapshot(), parser, 'commonmark')
  finish(model)
  const prepared = store.prepare({
    document: store.snapshot().document,
    operationId: 'shift-fences',
    baseVersion: 0,
    contentVersion: 1,
    origin: 'source',
    historyGroup: 'shift-fences',
    changes: [{ from: 0, to: 0, insert: `${fence}\n` }],
  })
  store.commit(prepared)
  model.counters(true)
  store.counters(true)
  const start = performance.now()
  model.apply(prepared)
  finish(model)
  samples.push({
    fences,
    sourceUnits: source.length,
    milliseconds: performance.now() - start,
    model: model.counters(),
    source: store.counters(),
  })
  model.dispose()
}
console.log(
  JSON.stringify(
    {
      runtime: process.version,
      workload: 'one opening fence changes all later fence pairings',
      samples,
    },
    null,
    2,
  ),
)
