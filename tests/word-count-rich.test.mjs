import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { observeRichCounts } from '../src/addons/word-count/rich.ts'
import { scheduleCounts } from '../src/addons/word-count/schedule.ts'

test('rich counts wait for matching native content, not timer expiry or selection changes', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const editor = Object.assign(new EventEmitter(), {
    state: { doc: { text: 'initial' } },
    isDestroyed: false,
    getText() {
      reads++
      return this.state.doc.text
    },
  })
  let document = { tabId: 'tab', revision: 1, contentVersion: 0 },
    reads = 0
  const messages = [],
    published = []
  const counter = scheduleCounts(
    () => rich.read(document),
    (text) => messages.push(text),
    (result) => published.push(result),
  )
  const rich = observeRichCounts(editor, () => document, counter.refresh)
  t.after(() => {
    rich.stop()
    counter.stop()
  })
  counter.refresh()
  t.mock.timers.tick(250)
  counter.receive({ words: 1, characters: 7 })
  assert.deepEqual(messages, ['initial'])

  document = { ...document, contentVersion: 1 }
  counter.refresh()
  editor.emit('transaction', {
    transaction: { docChanged: false },
    appendedTransactions: [],
  })
  t.mock.timers.tick(1000)
  assert.equal(reads, 1)
  assert.deepEqual(messages, ['initial'])
  assert.deepEqual(published, [{ words: 1, characters: 7 }])

  editor.state.doc = { text: 'current words' }
  assert.equal(rich.read(document), null)
  editor.emit('transaction', { transaction: { docChanged: true } })
  t.mock.timers.tick(249)
  assert.equal(reads, 1)
  t.mock.timers.tick(1)
  assert.deepEqual(messages, ['initial', 'current words'])
  counter.receive({ words: 2, characters: 13 })
  assert.deepEqual(published.at(-1), { words: 2, characters: 13 })
})

test('rich count snapshots expire across files, revisions, native replacement and detach', () => {
  const editor = Object.assign(new EventEmitter(), {
    state: { doc: {} },
    isDestroyed: false,
    getText: () => 'text',
  })
  let document = { tabId: 'tab', revision: 1, contentVersion: 2 }
  const rich = observeRichCounts(
    editor,
    () => document,
    () => {},
  )
  assert.equal(rich.read(document), 'text')
  for (const changed of [
    { ...document, tabId: 'another' },
    { ...document, revision: 2 },
    { ...document, contentVersion: 3 },
  ]) {
    assert.equal(rich.read(changed), null)
  }
  document = { ...document, tabId: 'another', revision: 2, contentVersion: 0 }
  editor.emit('transaction', {
    transaction: { docChanged: false },
    appendedTransactions: [],
  })
  assert.equal(rich.read(document), null)
  editor.state.doc = {}
  editor.emit('transaction', { transaction: { docChanged: true } })
  assert.equal(rich.read(document), 'text')
  editor.state.doc = {}
  assert.equal(rich.read(document), null)
  rich.stop()
  editor.emit('transaction', { transaction: { docChanged: true } })
  assert.equal(rich.read(document), null)
  assert.equal(editor.listenerCount('transaction'), 0)

  const replacement = observeRichCounts(
    editor,
    () => document,
    () => {},
  )
  assert.equal(replacement.read(document), 'text')
  editor.isDestroyed = true
  assert.equal(replacement.read(document), null)
  replacement.stop()
})

test('appended document changes refresh counts after a selection-only root transaction', () => {
  const editor = Object.assign(new EventEmitter(), {
    state: { doc: { text: 'initial' } },
    isDestroyed: false,
    getText() {
      return this.state.doc.text
    },
  })
  let document = { tabId: 'tab', revision: 1, contentVersion: 0 },
    refreshes = 0
  const rich = observeRichCounts(
    editor,
    () => document,
    () => refreshes++,
  )
  document = { ...document, contentVersion: 1 }
  editor.emit('transaction', {
    transaction: { docChanged: false },
    appendedTransactions: [{ docChanged: false }],
  })
  assert.equal(refreshes, 0)
  assert.equal(rich.read(document), null)

  editor.state.doc = { text: 'appended edit' }
  editor.emit('transaction', {
    transaction: { docChanged: false },
    appendedTransactions: [{ docChanged: false }, { docChanged: true }],
  })
  assert.equal(refreshes, 1)
  assert.equal(rich.read(document), 'appended edit')
  rich.stop()
})
