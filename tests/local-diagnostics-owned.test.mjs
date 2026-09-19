import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import {
  attachDiagnosticService,
  consumeDiagnosticService,
  diagnosticServiceName,
  expectDiagnosticStop,
  installOwnedFailureReporter,
  reportOwnedFailure,
} from '../src/main/local-diagnostics/owned.ts'

test('utility intent correlates only by an exact ephemeral service generation', () => {
  const first = diagnosticServiceName('format'),
    second = diagnosticServiceName('format')
  const worker = new EventEmitter(),
    replacement = new EventEmitter()
  attachDiagnosticService(worker, first)
  attachDiagnosticService(replacement, second)
  expectDiagnosticStop(worker)
  assert.equal(consumeDiagnosticService('hibi format'), null)
  assert.equal(consumeDiagnosticService(`${first}-private`), null)
  assert.deepEqual(consumeDiagnosticService(second), {
    role: 'format',
    expected: false,
  })
  assert.deepEqual(consumeDiagnosticService(first), {
    role: 'format',
    expected: true,
  })
  assert.equal(consumeDiagnosticService(first), 'untracked')
  assert.equal(worker.listenerCount('exit'), 0)
  assert.equal(replacement.listenerCount('exit'), 0)
})

test('zero exit retires exact generation; expected cleanup stays quiet and late native events cannot duplicate it', () => {
  const records = []
  installOwnedFailureReporter((code, _error, metadata) =>
    records.push({ code, ...metadata }),
  )
  try {
    for (const expected of [true, false]) {
      const worker = new EventEmitter(),
        name = diagnosticServiceName('format')
      attachDiagnosticService(worker, name)
      if (expected) expectDiagnosticStop(worker)
      worker.emit('exit', 0)
      assert.equal(consumeDiagnosticService(name), 'untracked')
      assert.equal(worker.listenerCount('exit'), 0)
    }
    assert.deepEqual(records, [
      {
        code: 'COMPILER_PROCESS_FAILED',
        role: 'format',
        reason: 'unknown',
        exitCode: 0,
      },
    ])
    const workers = Array.from({ length: 100 }, () => new EventEmitter())
    workers.forEach((worker) => {
      attachDiagnosticService(worker, diagnosticServiceName('typst'))
    })
    assert.equal(
      workers.reduce(
        (count, worker) => count + worker.listenerCount('exit'),
        0,
      ),
      64,
    )
  } finally {
    installOwnedFailureReporter(null)
  }
})

test('abandoned utility registration stays bounded and forgotten intent is not guessed', () => {
  const names = Array.from({ length: 100 }, () =>
    diagnosticServiceName('typst'),
  )
  assert.equal(consumeDiagnosticService(names[0]), 'untracked')
  assert.equal(
    names.filter((name) => typeof consumeDiagnosticService(name) === 'object')
      .length,
    64,
  )
})

test('failure reporting cannot replace the owner exception or retain the failure', () => {
  const error = new Error('private')
  let count = 0
  installOwnedFailureReporter((_code, seen) => {
    count++
    assert.equal(seen, error)
    throw new Error('logger unavailable')
  })
  assert.doesNotThrow(() =>
    reportOwnedFailure('COMPILER_PROCESS_FAILED', 'format', error),
  )
  installOwnedFailureReporter(null)
  reportOwnedFailure('COMPILER_PROCESS_FAILED', 'format', error)
  assert.equal(count, 1)
})
