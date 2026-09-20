import assert from 'node:assert/strict'
import test from 'node:test'
import { scheduleCounts } from '../src/addons/word-count/schedule.ts'

function fixture(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let text = 'initial',
    reads = 0
  const messages = [],
    published = []
  const counter = scheduleCounts(
    () => {
      reads++
      return text
    },
    (source) => messages.push(source),
    (result) => published.push(result),
  )
  t.after(() => counter.stop())
  return {
    counter,
    messages,
    published,
    reads: () => reads,
    edit(source) {
      text = source
      counter.refresh()
    },
    tick: (ms) => t.mock.timers.tick(ms),
  }
}

test('sustained typing does not read or send whole source until input is quiet', (t) => {
  const f = fixture(t)
  for (let key = 0; key < 1000; key++) {
    f.edit(`source ${key}`)
    f.tick(30)
  }
  assert.equal(f.reads(), 0)
  assert.deepEqual(f.messages, [])
  f.tick(219)
  assert.equal(f.reads(), 0)
  f.tick(1)
  assert.equal(f.reads(), 1)
  assert.deepEqual(f.messages, ['source 999'])
  f.counter.receive({ words: 2, characters: 10 })
  assert.deepEqual(f.published, [{ words: 2, characters: 10 }])
})

test('obsolete replies preserve displayed counts and do not skip restored text', (t) => {
  const f = fixture(t)
  f.edit('original')
  f.tick(250)
  f.counter.receive({ words: 1, characters: 8 })
  f.edit('same sent text')
  f.tick(250)
  f.edit('changed')
  f.tick(100)
  f.edit('same sent text')
  f.counter.receive({ words: 3, characters: 14 })
  assert.equal(f.reads(), 2)
  assert.deepEqual(f.published, [{ words: 1, characters: 8 }])
  f.tick(250)
  assert.equal(f.reads(), 3)
  assert.deepEqual(f.messages, ['original', 'same sent text', 'same sent text'])
  f.counter.receive({ words: 3, characters: 14 })
  assert.deepEqual(f.published.at(-1), { words: 3, characters: 14 })
})

test('one in-flight count coalesces the latest quiet source and renewed input postpones it', (t) => {
  const f = fixture(t)
  f.edit('first')
  f.tick(250)
  f.edit('quiet but waiting')
  f.tick(250)
  assert.equal(f.reads(), 1)
  f.edit('typing again')
  f.counter.receive({ words: 1, characters: 5 })
  assert.equal(f.reads(), 1)
  assert.deepEqual(f.published, [])
  f.tick(250)
  assert.deepEqual(f.messages, ['first', 'typing again'])
  f.edit('latest quiet source')
  f.tick(250)
  assert.equal(f.reads(), 2)
  f.counter.receive({ words: 2, characters: 12 })
  assert.equal(f.reads(), 3)
  assert.deepEqual(f.messages, ['first', 'typing again', 'latest quiet source'])
  f.counter.receive({ words: 3, characters: 19 })
  assert.deepEqual(f.published, [{ words: 3, characters: 19 }])
})

test('stopping drops pending timers and replies without clearing displayed counts', (t) => {
  const f = fixture(t)
  f.edit('first')
  f.tick(250)
  f.counter.receive({ words: 1, characters: 5 })
  f.edit('pending')
  f.tick(250)
  f.edit('queued')
  f.counter.stop()
  f.counter.receive({ words: 1, characters: 7 })
  f.edit('after stop')
  f.tick(1000)
  assert.deepEqual(f.messages, ['first', 'pending'])
  assert.deepEqual(f.published, [{ words: 1, characters: 5 }])
})
