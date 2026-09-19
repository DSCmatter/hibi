import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('queued projections retain no original errors, promises or document objects', () => {
  const schema = new URL('../src/shared/local-diagnostics.ts', import.meta.url)
    .href
  const budget = new URL(
    '../src/shared/local-diagnostics-budget.ts',
    import.meta.url,
  ).href
  const probe = spawnSync(
    process.execPath,
    [
      '--expose-gc',
      '--input-type=module',
      '-e',
      `
    import { projectError } from ${JSON.stringify(schema)};
    import { DiagnosticQueue } from ${JSON.stringify(budget)};
    const queue = new DiagnosticQueue('debug', 'main');
    const refs = (() => {
      const document = { source: 'PRIVATE_SOURCE'.repeat(100000) };
      const error = new Error('PRIVATE_MESSAGE', { cause: document });
      Object.defineProperty(error, 'stack', { value: 'Error: PRIVATE_MESSAGE\\n    at PRIVATE_NAME (app://hibi/assets/app.js:1:2)' });
      const promise = Promise.resolve(document);
      const catalog = new Map([['app://hibi/assets/app.js', 100]]);
      for (const value of [error, promise, document])
        queue.push(JSON.stringify({ code: 'RENDERER_ERROR', ...projectError(value, catalog, 'debug') }));
      return [error, promise, document].map(value => new WeakRef(value));
    })();
    for (let i = 0; i < 20; i++) { await new Promise(setImmediate); global.gc(); }
    console.log(JSON.stringify({ collected: refs.every(ref => !ref.deref()), records: queue.take(), size: queue.size }));
  `,
    ],
    { encoding: 'utf8', timeout: 10000 },
  )
  assert.equal(probe.status, 0, probe.stderr)
  const result = JSON.parse(probe.stdout)
  assert.equal(result.collected, true)
  assert.equal(result.records.length, 3)
  assert.deepEqual(result.size, { bytes: 0, records: 0 })
  assert.doesNotMatch(probe.stdout, /PRIVATE_|app:\/\//)
  assert.match(probe.stdout, /100,1,2/)
})
