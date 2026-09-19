import assert from 'node:assert/strict'
import test from 'node:test'
import { DocumentSession } from '../src/shared/document-session.ts'
import { composeSourceChanges } from '../src/shared/source-operations.ts'

const replace = (source, edits) => {
  for (let index = edits.length - 1; index >= 0; index--) {
    const edit = edits[index]
    source = source.slice(0, edit.from) + edit.insert + source.slice(edit.to)
  }
  return source
}
function fixture(source = 'before', options = {}) {
  const journal = [],
    errors = []
  const session = new DocumentSession(
    source,
    { tabId: 'test', revision: 0 },
    0,
    {
      enqueue: (operation) => journal.push(operation),
      onError: (error) => errors.push(error),
      ...options,
    },
  )
  return { session, journal, errors }
}

test('exact change composition agrees with sequential replacement across random positions', () => {
  let seed = 8120
  const random = (max) => {
    seed ^= seed << 13
    seed ^= seed >>> 17
    seed ^= seed << 5
    return (seed >>> 0) % max
  }
  for (let run = 0; run < 3000; run++) {
    const original = 'abcdefghijklmnop',
      first = [],
      second = []
    for (const changes of [first, second]) {
      const source = changes === first ? original : replace(original, first)
      let offset = 0
      for (let count = 0; count < 3 && offset <= source.length; count++) {
        const from = offset + random(source.length - offset + 1),
          to = from + random(source.length - from + 1)
        changes.push({ from, to, insert: 'xyz'.slice(0, random(4)) })
        offset = to + 1
      }
    }
    assert.equal(
      replace(original, composeSourceChanges(first, second, original.length)),
      replace(replace(original, first), second),
    )
  }
})

test('S07/J01/ENG28: source and metadata commit before recovery, view reconciliation and observers', () => {
  const order = []
  let session
  const f = fixture('before', {
    enqueue(operation) {
      assert.equal(session.snapshot().materialize(), 'after')
      assert.equal(session.state().contentVersion, operation.contentVersion)
      order.push('journal')
    },
  })
  session = f.session
  const initial = session.state()
  assert.equal(session.state(), initial)
  session.subscribe(() => {
    order.push('observer')
    assert.equal(session.snapshot().materialize(), 'after')
    assert.equal(session.state().contentVersion, 1)
  })
  session.edit(
    [{ from: 0, to: 6, insert: 'after' }],
    'source',
    'typing',
    () => {
      order.push('view')
      assert.equal(session.state().contentVersion, 1)
    },
  )
  assert.deepEqual(order, ['journal', 'view', 'observer'])
  assert.notEqual(session.state(), initial)
  assert.equal(session.state(), session.state())
  assert.deepEqual(f.errors, [])
})

test('S08/ENG20: source and visual history groups share monotonic undo and redo', () => {
  const { session, journal, errors } = fixture('')
  session.edit([{ from: 0, to: 0, insert: 'a' }], 'source', 'typing')
  session.edit([{ from: 1, to: 1, insert: 'b' }], 'source', 'typing')
  session.edit([{ from: 0, to: 2, insert: '**ab**' }], 'visual', 'bold')
  assert.equal(session.snapshot().materialize(), '**ab**')
  session.undo()
  assert.equal(session.snapshot().materialize(), 'ab')
  session.undo()
  assert.equal(session.snapshot().materialize(), '')
  assert.equal(session.state().dirty, false)
  session.redo()
  session.redo()
  assert.equal(session.snapshot().materialize(), '**ab**')
  assert.deepEqual(
    journal.map((operation) => operation.contentVersion),
    [1, 2, 3, 4, 5, 6, 7],
  )
  assert.deepEqual(
    journal.map((operation) => operation.origin),
    ['source', 'source', 'visual', 'undo', 'undo', 'redo', 'redo'],
  )
  assert.deepEqual(errors, [])
})

test('S07: rich acceptance keeps one guarded source commit until native view callbacks finish', () => {
  const { session, journal } = fixture('before')
  const events = []
  session.subscribeOperations(() => events.push('mirror'))
  session.subscribe(() => events.push('observer'))
  const accepted = session.beginEdit(
    [{ from: 0, to: 6, insert: 'after' }],
    'visual',
    'typing',
  )
  assert.equal(session.snapshot().materialize(), 'after')
  assert.equal(journal.length, 1)
  assert.deepEqual(events, [])
  assert.throws(
    () =>
      session.edit([{ from: 0, to: 0, insert: 'nested' }], 'addon', 'nested'),
    /dispatching/,
  )
  events.push('native view callbacks')
  accepted.finish()
  accepted.finish()
  assert.deepEqual(events, ['native view callbacks', 'mirror', 'observer'])
  session.undo()
  assert.equal(session.snapshot().materialize(), 'before')
  assert.equal(journal.length, 2)
})

test('selection preparation cannot reenter the source commit and rejection releases its guard', () => {
  const { session, journal } = fixture('original')
  assert.throws(
    () =>
      session.beginEdit(
        [{ from: 0, to: 8, insert: 'changed' }],
        'visual',
        'test',
        () => {
          session.edit(
            [{ from: 0, to: 0, insert: 'nested' }],
            'addon',
            'nested',
          )
          return null
        },
      ),
    /dispatching/,
  )
  assert.equal(session.snapshot().materialize(), 'original')
  assert.equal(journal.length, 0)
  session.edit([{ from: 0, to: 0, insert: 'safe ' }], 'source', 'next')
  assert.equal(session.snapshot().materialize(), 'safe original')
})

test('group cancellation and new line-ending seams preserve undo source', () => {
  const { session } = fixture('\rX\n')
  session.edit([{ from: 1, to: 2, insert: '' }], 'source', 'typing')
  session.edit([{ from: 0, to: 2, insert: '\rX\n' }], 'source', 'typing')
  assert.equal(session.snapshot().materialize(), '\rX\n')
  assert.equal(session.state().canUndo, false)
  assert.equal(session.state().dirty, false)
  session.edit([{ from: 1, to: 2, insert: '' }], 'source', 'delete')
  session.undo()
  assert.equal(session.snapshot().materialize(), '\rX\n')
})

test('J08: saving V leaves V+1 dirty and equal text verification is deferred', async () => {
  const { session } = fixture('alpha')
  session.edit([{ from: 0, to: 5, insert: 'bravo' }], 'source', 'first')
  const saving = session.snapshot()
  session.edit([{ from: 0, to: 5, insert: 'charlie' }], 'source', 'second')
  session.markSaved(saving)
  assert.equal(session.state().dirty, true)
  session.undo()
  assert.equal(session.state().dirty, false)
  session.edit([{ from: 0, to: 5, insert: 'delta' }], 'source', 'third')
  session.counters(true)
  session.edit([{ from: 0, to: 5, insert: 'bravo' }], 'source', 'fourth')
  assert.equal(session.state().dirty, true)
  await session.settled()
  assert.equal(session.state().dirty, false)
})

test('ENG21: history is bounded and redo is revoked by new input', () => {
  const { session } = fixture('', { historyGroups: 3, historyBytes: 2000 })
  for (let n = 0; n < 20; n++)
    session.edit([{ from: n, to: n, insert: 'x' }], 'source', `group-${n}`)
  assert.equal(session.historySize().groups, 3)
  assert.ok(session.historySize().bytes <= 2000)
  session.undo()
  assert.equal(session.state().canRedo, true)
  session.edit([{ from: 0, to: 0, insert: 'y' }], 'visual', 'different')
  assert.equal(session.state().canRedo, false)
})

test('reentrant edits and observer failures cannot corrupt committed source', () => {
  const { session, errors, journal } = fixture('a')
  session.subscribe(() => {
    session.edit([{ from: 0, to: 0, insert: 'x' }], 'addon', 'reentrant')
  })
  session.edit([{ from: 0, to: 1, insert: 'b' }], 'source', 'typing')
  assert.equal(session.snapshot().materialize(), 'b')
  assert.equal(journal.length, 1)
  assert.match(errors[0].message, /dispatching/)
  session.dispose()
  assert.throws(
    () => session.edit([{ from: 0, to: 0, insert: 'x' }], 'source', 'typing'),
    /disposed/,
  )
})

test('saved-content verification retains one scheduled job and resolves canceled waiters', async () => {
  const schedule = globalThis.setTimeout,
    cancel = globalThis.clearTimeout
  const pending = new Map(),
    waiters = []
  let next = 0
  globalThis.setTimeout = (_callback, delay) => {
    const id = ++next
    pending.set(id, delay)
    return id
  }
  globalThis.clearTimeout = (id) => {
    pending.delete(id)
  }
  try {
    const { session } = fixture('abcdef')
    for (let index = 0; index < 300; index++) {
      session.edit(
        [{ from: 0, to: 1, insert: index % 2 ? 'x' : 'y' }],
        'source',
        `group-${index}`,
      )
      waiters.push(session.settled())
      assert.equal(
        [...pending.values()].filter((delay) => delay === 0).length,
        1,
      )
      assert.equal(
        [...pending.values()].filter((delay) => delay === 500).length,
        Number(index >= 255),
      )
    }
    session.dispose()
    assert.equal(pending.size, 0)
    await Promise.all(waiters)
  } finally {
    globalThis.setTimeout = schedule
    globalThis.clearTimeout = cancel
  }
})
