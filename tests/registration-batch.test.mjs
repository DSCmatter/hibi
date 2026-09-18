import assert from 'node:assert/strict'
import test from 'node:test'
import { registrationBatch } from '../src/renderer/src/registration-batch.ts'

test('staged registrations have deterministic order and can be cancelled before publication', () => {
  const batch = registrationBatch(true),
    installed = []
  for (const id of ['z', 'a', 'm'])
    batch.register(id, () => {
      installed.push(id)
      return () => installed.splice(installed.indexOf(id), 1)
    })
  const remove = batch.register('cancel', () => {
    throw new Error('should not install')
  })
  remove()
  assert.deepEqual(installed, [])
  batch.commit()
  assert.deepEqual(installed, ['a', 'm', 'z'])
  batch.dispose()
  batch.dispose()
  assert.deepEqual(installed, [])
})

test('failed commit can roll back earlier registrations and one cleanup failure cannot block another', () => {
  const batch = registrationBatch(true),
    removed = []
  batch.register('a', () => () => {
    removed.push('a')
    throw new Error('cleanup')
  })
  batch.register('b', () => () => {
    removed.push('b')
  })
  batch.register('c', () => {
    throw new Error('install')
  })
  assert.throws(() => batch.commit(), /install/)
  assert.throws(() => batch.dispose(), AggregateError)
  assert.deepEqual(removed, ['b', 'a'])
})

test('legacy registration remains immediate and releases each registration only once', () => {
  const batch = registrationBatch(false)
  let active = 0
  const remove = batch.register('a', () => {
    active++
    return () => {
      active--
    }
  })
  assert.equal(active, 1)
  assert.throws(() => batch.register('a', () => () => {}), /Duplicate/)
  remove()
  batch.dispose()
  assert.equal(active, 0)
})
