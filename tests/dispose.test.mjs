import assert from 'node:assert/strict'
import test from 'node:test'
import { disposeAll } from '../src/renderer/src/dispose.ts'

test('cleanup attempts every callback and preserves all failures', () => {
  const called = []
  const first = new Error('first'),
    second = new Error('second')
  assert.throws(
    () =>
      disposeAll(
        [
          () => {
            called.push(1)
            throw first
          },
          () => {
            called.push(2)
          },
          () => {
            called.push(3)
            throw second
          },
          () => {
            called.push(4)
          },
        ],
        'Plugin cleanup failed',
      ),
    (error) => {
      assert.ok(error instanceof AggregateError)
      assert.deepEqual(error.errors, [first, second])
      return true
    },
  )
  assert.deepEqual(called, [1, 2, 3, 4])
})
