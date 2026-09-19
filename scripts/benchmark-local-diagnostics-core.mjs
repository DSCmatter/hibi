import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { LocalDiagnosticSink } from '../src/main/local-diagnostics/sink.ts'
import {
  decodeDiagnostic,
  diagnosticPolicies,
  projectError,
  projectStack,
} from '../src/shared/local-diagnostics.ts'
import { DiagnosticAdmission } from '../src/shared/local-diagnostics-budget.ts'

const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[
    Math.max(0, Math.ceil(values.length * p) - 1)
  ]
function stats(samples) {
  return {
    n: samples.length,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    p99: percentile(samples, 0.99),
    maximum: Math.max(...samples),
  }
}
function measure(fn) {
  let start = performance.now()
  fn()
  const first = performance.now() - start
  const samples = []
  for (let i = 0; i < 10000; i++) {
    start = performance.now()
    fn()
    samples.push(performance.now() - start)
  }
  return { first, ...stats(samples) }
}
const identity = {
  app: '0.1.0',
  build: 'unknown',
  electron: process.versions.electron ?? 'unknown',
  chrome: process.versions.chrome ?? 'unknown',
  v8: process.versions.v8,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch,
  packaged: false,
}
const results = []
const selected = process.env.HIBI_O11Y_CORE_PROFILE
assert.ok(selected === undefined || ['release', 'debug'].includes(selected))
for (const profile of selected ? [selected] : ['release', 'debug']) {
  const root = await fs.mkdtemp(join(tmpdir(), 'hibi-log-core-bench-'))
  let io = 0,
    held = false,
    release
  const storage = {
    ...fs,
    open: async (...args) => {
      io++
      const handle = await fs.open(...args)
      return new Proxy(handle, {
        get(target, key) {
          if (key === 'write')
            return (...args) => {
              io++
              return held
                ? new Promise((resolve, reject) => {
                    release = () => target.write(...args).then(resolve, reject)
                  })
                : target.write(...args)
            }
          return typeof target[key] === 'function'
            ? target[key].bind(target)
            : target[key]
        },
      })
    },
  }
  const sink = new LocalDiagnosticSink({
    userData: root,
    profile,
    identity,
    filesystem: storage,
  })
  try {
    await sink.ready
    await sink.flush()
    const catalog = new Map([['app://hibi/assets/app.js', 100]])
    const stack =
      'PRIVATE_MESSAGE\n' +
      '    at PRIVATE_NAME (app://hibi/assets/app.js:123:456)\n'.repeat(
        diagnosticPolicies[profile].frames,
      )
    const error = new Error('PRIVATE_MESSAGE')
    Object.defineProperty(error, 'stack', { value: stack })
    let traps = 0
    const hostile = new Proxy(error, {
      get() {
        traps++
        throw 1
      },
      getOwnPropertyDescriptor() {
        traps++
        throw 1
      },
    })
    const record = {
      code: 'RENDERER_ERROR',
      stackStatus: 'captured',
      frames: Array.from({ length: diagnosticPolicies[profile].frames }, () => [
        100, 123, 456,
      ]),
    }
    const wire = JSON.stringify(record)
    const admission = new DiagnosticAdmission(profile)
    let tick = 1000
    const stages = {
      error: measure(() => projectError(error, catalog, profile)),
      admission: measure(() => {
        tick += 1000
        return admission.admit('RENDERER_ERROR', tick)
      }),
      stack: measure(() => projectStack(stack, catalog, profile)),
      hostile: measure(() => projectError(hostile, catalog, profile)),
      validation: measure(() => decodeDiagnostic(wire, profile)),
      serialization: measure(() => JSON.stringify(record)),
    }
    assert.equal(traps, 0)
    const enqueue = []
    for (let batch = 0; batch < 200; batch++) {
      for (let n = 0; n < 32; n++) {
        const start = performance.now()
        const accepted = sink.enqueue(wire)
        enqueue.push(performance.now() - start)
        assert.ok(accepted)
      }
      await sink.flush()
    }
    const idleIo = io
    await new Promise((resolve) => setTimeout(resolve, 500))
    const idleIoDelta = io - idleIo
    assert.equal(io, idleIo)
    assert.equal(sink.status.timer, false)
    held = true
    sink.enqueue(wire)
    const pending = sink.flush()
    const plateau = []
    for (let epoch = 0; epoch < 6; epoch++) {
      for (let i = 0; i < 20000; i++) sink.enqueue(wire)
      await new Promise(setImmediate)
      global.gc?.()
      plateau.push({ heapUsed: process.memoryUsage().heapUsed, ...sink.status })
    }
    held = false
    release()
    await pending
    assert.ok(sink.report().includes('DIAGNOSTICS_DROPPED'))
    assert.doesNotMatch(sink.report(), /PRIVATE_|app:\/\//)
    for (const point of plateau) {
      assert.ok(point.queued.bytes <= diagnosticPolicies[profile].mainBytes)
      assert.ok(point.queued.records <= diagnosticPolicies[profile].mainRecords)
      assert.ok(point.retainedBytes <= 64 * 1024)
      assert.ok(point.inFlightBytes <= 16 * 1024)
    }
    const enqueues = stats(enqueue)
    results.push({
      profile,
      stages,
      enqueue: enqueues,
      enqueueGate: enqueues.p95 <= 0.1 && enqueues.p99 <= 0.5,
      idleIoDelta,
      forcedGc: typeof global.gc === 'function',
      plateau,
      final: sink.status,
    })
  } finally {
    await sink.finish()
    await fs.rm(root, { recursive: true, force: true })
  }
}
console.log(
  JSON.stringify({ runtime: identity, unit: 'milliseconds', results }, null, 2),
)
