import assert from 'node:assert/strict'
import test from 'node:test'
import {
  decodeDiagnostic,
  diagnosticEvents,
  diagnosticLimits,
  diagnosticPolicies,
  projectError,
  projectLocation,
  projectStack,
} from '../src/shared/local-diagnostics.ts'
import {
  DiagnosticAdmission,
  DiagnosticQueue,
} from '../src/shared/local-diagnostics-budget.ts'

const secret = 'PRIVATE_DOCUMENT_雪_\r\n\u001b[31m'
const catalog = new Map([
  ['app://hibi/assets/app.js', 1],
  ['/owned/build/main/index.js', 2],
])
const encode = (extra = {}) =>
  JSON.stringify({
    code: 'RENDERER_ERROR',
    stackStatus: 'unavailable',
    ...extra,
  })

for (const profile of ['release', 'debug']) {
  test(`${profile}: projection preserves original app coordinates and drops names, messages, URLs and eval`, () => {
    const stack = `Error: ${secret}\n    at ${secret} (/owned/build/main/index.js:12:3)\n    at innocent (app://hibi/assets/app.js:45:6)\n    at query (app://hibi/assets/app.js?${secret}:7:8)\n    at eval at injected (/owned/build/main/index.js:20:9)\n    at /workspace/${secret}.js:8:2\n    at https://remote.example/${secret}:4:5`
    const safe = projectStack(stack, catalog, profile)
    // The newline in the injected function name prevents accepting that frame.
    assert.deepEqual(safe.frames, [[1, 45, 6]])
    assert.equal(safe.stackStatus, 'captured')
    assert.ok(!JSON.stringify(safe).includes('PRIVATE'))
    assert.deepEqual(
      projectLocation('app://hibi/assets/app.js', 22, 4, catalog),
      { frames: [[1, 22, 4]], stackStatus: 'captured' },
    )
    assert.equal(
      projectLocation('file:///private/document', 1, 1, catalog).stackStatus,
      'omitted-untrusted',
    )
    const many = projectStack(
      `Error\n${' at /owned/build/main/index.js:12:3\n'.repeat(60)}`,
      catalog,
      profile,
    )
    assert.equal(many.frames.length, diagnosticPolicies[profile].frames)
    assert.equal(many.stackStatus, 'truncated')
    assert.deepEqual(projectStack('x'.repeat(40000), catalog, profile), {
      stackStatus: 'truncated',
    })
  })

  test(`${profile}: arbitrary rejection objects, proxies, getters and formatters are never inspected`, () => {
    let calls = 0
    const hostile = new Proxy(
      {},
      {
        get() {
          calls++
          throw 1
        },
        getOwnPropertyDescriptor() {
          calls++
          throw 1
        },
        getPrototypeOf() {
          calls++
          throw 1
        },
      },
    )
    const lazy = new Error(secret)
    const original = Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace')
    Object.defineProperty(Error, 'prepareStackTrace', {
      configurable: true,
      value: () => {
        calls++
        throw 1
      },
    })
    try {
      const cyclic = {}
      cyclic.cause = cyclic
      for (const value of [
        hostile,
        new Proxy(lazy, {}),
        lazy,
        cyclic,
        1n,
        secret,
        null,
        new AggregateError([hostile], secret),
      ]) {
        assert.equal(
          projectError(value, catalog, profile).stackStatus,
          'omitted-untrusted',
        )
        assert.equal(decodeDiagnostic(value, profile), null)
      }
      Object.defineProperty(lazy, 'stack', {
        get() {
          calls++
          throw 1
        },
      })
      assert.equal(
        projectError(lazy, catalog, profile).stackStatus,
        'omitted-untrusted',
      )
      assert.equal(calls, 0)
    } finally {
      if (original) Object.defineProperty(Error, 'prepareStackTrace', original)
      else delete Error.prepareStackTrace
    }
    const materialized = new Error(secret, { cause: hostile })
    Object.defineProperty(materialized, 'stack', {
      value: `Error: ${secret}\n at /owned/build/main/index.js:9:2`,
    })
    Object.defineProperty(materialized, 'code', { value: 'ENOSPC' })
    assert.deepEqual(projectError(materialized, catalog, profile), {
      frames: [[2, 9, 2]],
      stackStatus: 'captured',
      errorCode: 'ENOSPC',
    })
  })

  test(`${profile}: only finite inert schema enters the transport and queue`, () => {
    for (const code of Object.keys(diagnosticEvents)) {
      const wire = encode({ code })
      assert.ok(decodeDiagnostic(wire, profile))
      assert.equal(
        !!decodeDiagnostic(wire, profile, true),
        diagnosticEvents[code].producer,
      )
    }
    for (const data of [
      { message: secret },
      { cause: secret },
      { path: secret },
      { toJSON: secret },
      { code: '__proto__' },
      { stackStatus: secret },
      { errorCode: secret },
      { frames: [[0, 1, 1]], stackStatus: 'captured' },
      { frames: [[1, -1, 1]], stackStatus: 'captured' },
      { frames: [[1, 1, Infinity]], stackStatus: 'captured' },
      { frames: [[1, 1, 1, 1]], stackStatus: 'captured' },
      { frames: Array(25).fill([1, 1, 1]), stackStatus: 'captured' },
      { stackStatus: 'captured' },
      { count: 0 },
      { count: 1_000_001 },
    ])
      assert.equal(decodeDiagnostic(encode(data), profile), null)
    for (const wire of [
      'null',
      '[]',
      secret,
      `${encode()}\n`,
      ' '.repeat(diagnosticPolicies[profile].recordBytes) + encode(),
    ])
      assert.equal(decodeDiagnostic(wire, profile), null)
    const queue = new DiagnosticQueue(profile, 'producer')
    const parent = secret.repeat(10000) + encode()
    assert.ok(queue.push(parent.slice(-encode().length)))
    assert.equal(queue.take()[0], encode())
    assert.equal(queue.push(encode({ code: 'RENDERER_GONE' })), false)
    for (const forged of [
      { role: 'main' },
      { reason: 'oom' },
      { exitCode: 9 },
    ]) {
      assert.equal(decodeDiagnostic(encode(forged), profile, true), null)
      assert.equal(queue.push(encode(forged)), false)
    }
  })

  test(`${profile}: pressure has hard byte/count caps and reserved host incident capacity`, () => {
    const policy = diagnosticPolicies[profile]
    for (const lane of ['main', 'producer']) {
      const queue = new DiagnosticQueue(profile, lane)
      const wire = encode()
      for (let i = 0; i < 2000; i++) queue.push(wire)
      assert.ok(
        queue.size.records <=
          (lane === 'main' ? policy.mainRecords : policy.producerRecords),
      )
      assert.ok(
        queue.size.bytes <=
          (lane === 'main' ? policy.mainBytes : policy.producerBytes),
      )
      if (lane === 'main')
        assert.ok(
          queue.push(
            encode({
              code: 'RENDERER_GONE',
              stackStatus: 'unavailable-native',
            }),
            true,
          ),
        )
      assert.ok(queue.takeDropped() > 0)
      while (queue.size.records) {
        const batch = queue.take()
        assert.ok(batch.length <= diagnosticLimits.batchRecords)
        assert.ok(batch.join('').length <= diagnosticLimits.batchBytes)
      }
      assert.deepEqual(queue.size, { bytes: 0, records: 0 })
      queue.clear()
    }
  })

  test(`${profile}: admission precedes detail and repeated/independent failures are bounded`, () => {
    const admission = new DiagnosticAdmission(profile)
    assert.ok(admission.admit('RENDERER_ERROR', 1))
    for (let i = 0; i < 2000; i++)
      assert.equal(admission.admit('RENDERER_ERROR', 2), false)
    assert.equal(admission.takeDropped(), 2000)
    assert.equal(admission.takeDropped(), 0)
    assert.ok(admission.admit('RENDERER_ERROR', 1001))
    let admitted = 1
    for (const code of Object.keys(diagnosticEvents).filter(
      (code) => code !== 'RENDERER_ERROR',
    ))
      if (admission.admit(code, 1002)) admitted++
    assert.equal(admitted, diagnosticPolicies[profile].detailsPerSecond)
    const hostile = {
      toString() {
        throw 1
      },
    }
    assert.equal(admission.admit(hostile, 1003), false)
  })
}
