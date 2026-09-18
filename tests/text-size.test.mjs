import assert from 'node:assert/strict'
import test from 'node:test'
import { exceedsUtf8Limit } from '../src/shared/text-size.ts'

test('UTF-8 bounds agree with exact byte length at every boundary', () => {
  const values = [
    '',
    'ascii',
    'é',
    '日本語',
    '😀',
    '\ud800',
    '\udfff',
    'a😀é中\ud800',
  ]
  for (const text of values) {
    for (let repeat = 1; repeat <= 20; repeat++) {
      const value = text.repeat(repeat)
      const bytes = Buffer.byteLength(value)
      for (const limit of [
        0,
        value.length,
        value.length * 3,
        bytes - 1,
        bytes,
        bytes + 1,
      ]) {
        if (limit >= 0)
          assert.equal(exceedsUtf8Limit(value, limit), bytes > limit)
      }
    }
  }
})
