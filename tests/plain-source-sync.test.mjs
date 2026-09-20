import assert from 'node:assert/strict'
import test from 'node:test'
import { getSchema } from '@tiptap/core'
import { MarkdownManager } from '@tiptap/markdown'
import { Fragment, Slice } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import { ReplaceStep } from '@tiptap/pm/transform'
import { StarterKit } from '@tiptap/starter-kit'
import { markdownSerializer } from '../src/renderer/src/markdown-serialization.ts'
import { markdownSyntax } from '../src/renderer/src/markdown-syntax.ts'
import { createPlainSourceSync } from '../src/renderer/src/plain-source-sync.ts'
import { SourceStore } from '../src/shared/source-buffer.ts'

const extensions = [StarterKit.configure({ trailingNode: false })]
const schema = getSchema(extensions)
const manager = new MarkdownManager({ extensions })

test('core syntax provenance excludes addon features using the core owner name', (t) => {
  const remove = markdownSyntax.register('core', {
    id: 'pretend-core',
    label: 'Pretend core',
    group: 'text',
    level: 'inline',
    matches: () => false,
  })
  t.after(remove)
  assert.equal(markdownSyntax.isCore('core.bold'), true)
  assert.equal(markdownSyntax.isCore('core.pretend-core'), false)
})

function setup(source) {
  const store = new SourceStore(source, { tabId: 'plain-sync', revision: 0 })
  const state = EditorState.create({
    schema,
    doc: schema.nodeFromJSON(manager.parse(source)),
  })
  const serialized = markdownSerializer(manager, true)(state.doc)
  const certificate = createPlainSourceSync(
    store.snapshot(),
    state.doc,
    serialized,
  )
  return { store, state, certificate, serialized }
}

function prepare(store, changes) {
  const before = store.snapshot()
  return store.prepare({
    document: before.document,
    operationId: crypto.randomUUID(),
    baseVersion: before.version,
    contentVersion: before.version + 1,
    origin: 'source',
    historyGroup: 'plain-sync',
    changes,
  })
}

function accept(context, change) {
  assert.ok(context.certificate, 'Canonical paragraphs must be certified.')
  const prepared = prepare(context.store, [change])
  context.store.counters(true)
  const parsed = []
  const result = context.certificate.prepare(
    prepared,
    context.state,
    (source) => {
      parsed.push(source)
      return manager.parse(source)
    },
  )
  assert.ok(result, 'A plain-text edit must use local synchronization.')
  const counters = context.store.counters()
  if (context.state.doc.childCount > 1)
    assert.equal(counters.materializations, 0)
  assert.equal(parsed.length, 1, 'Only the changed paragraph needs parsing.')
  assert.ok(parsed[0].length <= 16 * 1024)
  assert.ok(
    counters.sourceUnitsRead <= parsed[0].length * 2 + change.to - change.from,
  )
  const nextState = context.state.apply(result.transaction)
  assert.deepEqual(
    nextState.doc.toJSON(),
    schema.nodeFromJSON(manager.parse(prepared.after.materialize())).toJSON(),
    'Local transaction must match the full Markdown parser.',
  )
  context.store.commit(prepared)
  context.state = nextState
  context.certificate = result.next
  return { parsed: parsed[0], transaction: result.transaction }
}

function reject(source, changes, stateChange) {
  const context = setup(source)
  if (!context.certificate) return
  const prepared = prepare(context.store, changes)
  const state = stateChange ? stateChange(context.state) : context.state
  assert.ok(
    context.certificate.prepare(prepared, state, (text) =>
      manager.parse(text),
    ) === null,
    `Unsupported edit must fall back: ${JSON.stringify({ source, changes })}`,
  )
}

test('plain source sync inserts and deletes text using only the changed paragraph', () => {
  const context = setup('alpha beta\n\nmiddle words\n\nomega final')
  const initialFirst = context.state.doc.firstChild
  const initialLast = context.state.doc.lastChild
  const from = 'alpha beta\n\nmiddle'.length
  assert.ok(
    accept(context, { from, to: from, insert: ' new' }).parsed.startsWith(
      'middle new words',
    ),
  )
  assert.equal(context.state.doc.firstChild, initialFirst)
  assert.equal(context.state.doc.lastChild, initialLast)
  assert.ok(
    accept(context, { from, to: from + 4, insert: '' }).parsed.startsWith(
      'middle words',
    ),
  )
  assert.equal(
    context.state.doc.textContent,
    'alpha betamiddle wordsomega final',
  )
})

test('plain source sync maps CRLF prefixes and preserves trailing line endings', () => {
  for (const ending of ['', '\n', '\n\n', '\r\n', '\r\n\r\n']) {
    const source = `first paragraph\r\n\r\nsecond paragraph\r\n\r\nlast paragraph${ending}`
    const context = setup(source)
    const from = source.indexOf('second') + 3
    accept(context, { from, to: from + 1, insert: 'XX' })
    assert.equal(
      context.store.snapshot().materialize(),
      `${source.slice(0, from)}XX${source.slice(from + 1)}`,
    )
    const last = context.store.snapshot().materialize().indexOf('last') + 2
    accept(context, { from: last, to: last, insert: 'Z' })
  }
})

test('plain source sync updates distant paragraph offsets after sequential length changes', () => {
  const context = setup(
    Array.from(
      { length: 300 },
      (_, index) => `paragraph ${index} contains several ordinary words`,
    ).join('\n\n'),
  )
  for (const index of [0, 299, 1, 298, 150, 0, 299, 149]) {
    const current = context.store.snapshot().materialize()
    const from =
      current.indexOf(` ${index} contains`) + ` ${index} contains`.length
    const result = accept(context, { from, to: from, insert: ' extended' })
    assert.ok(result.parsed.includes('contains extended'))
    assert.ok(result.parsed.length < 100)
  }
})

test('plain source sync never inherits editor stored marks', () => {
  const context = setup('ordinary words')
  context.state = context.state.apply(
    context.state.tr.setStoredMarks([schema.marks.bold.create()]),
  )
  accept(context, { from: 5, to: 5, insert: ' inserted' })
  assert.equal(context.state.doc.firstChild.firstChild.marks.length, 0)
})

test('plain source sync keeps Unicode and UTF-16 positions exact', () => {
  const source = '# title\r\n\r\nalpha 😀 é beta\r\n\r\nlast words'
  const context = setup(source)
  const from = source.indexOf('😀') + '😀'.length
  accept(context, { from, to: from, insert: '水' })
  const accent = context.store.snapshot().materialize().indexOf('́')
  accept(context, { from: accent, to: accent + 1, insert: '' })
})

test('plain source sync edits canonical plain paragraphs beside structural blocks', () => {
  const source =
    '# heading\r\n\r\nordinary words\r\n\r\n- list item\r\n\r\nlast words'
  const context = setup(source)
  const heading = context.state.doc.firstChild
  const list = context.state.doc.child(2)
  const from = source.indexOf('ordinary') + 3
  accept(context, { from, to: from, insert: 'X' })
  assert.equal(context.state.doc.firstChild, heading)
  assert.equal(context.state.doc.child(2), list)
})

test('plain source sync accepts plain paragraph edge edits', () => {
  const context = setup('ordinary words\n\nsecond words')
  accept(context, { from: 0, to: 0, insert: 'new ' })
  accept(context, { from: 18, to: 18, insert: ' added' })
  const last = context.store.snapshot().utf16Length
  accept(context, { from: last, to: last, insert: ' added' })
})

test('plain source sync rejects indentation changes that can alter preceding block ownership', () => {
  for (const [source, changes] of [
    ['- item\n\nparagraph', [{ from: 8, to: 8, insert: '  ' }]],
    ['- item\n\nparagraph', [{ from: 8, to: 8, insert: '\t' }]],
    ['- item\n\nx  paragraph', [{ from: 8, to: 9, insert: '' }]],
    ['previous\n\n paragraph', [{ from: 10, to: 11, insert: '' }]],
  ]) {
    assert.ok(setup(source).certificate)
    reject(source, changes)
  }
})

test('plain source sync preserves trailing backslash behavior before line endings', () => {
  for (const ending of ['\n', '\r\n', '\n\nnext words', '\r\n\r\nnext words']) {
    const context = setup(`ordinary words${ending}`)
    assert.ok(context.certificate)
    const prepared = prepare(context.store, [
      { from: 14, to: 14, insert: '\\' },
    ])
    const result = context.certificate.prepare(
      prepared,
      context.state,
      (source) => manager.parse(source),
    )
    if (result)
      assert.deepEqual(
        result.transaction.doc.toJSON(),
        schema
          .nodeFromJSON(manager.parse(prepared.after.materialize()))
          .toJSON(),
      )
  }
  reject('ordinary words\nnext line\n\nlast words', [
    { from: 14, to: 14, insert: '\\' },
  ])
})

test('plain source sync preserves trailing backslash behavior at EOF', () => {
  accept(setup('ordinary words'), { from: 14, to: 14, insert: '\\' })
})

test('plain source sync falls back when deleting an entire paragraph', () => {
  reject('ordinary words', [{ from: 0, to: 14, insert: '' }])
})

test('plain source sync requires exact canonical source and block serialization', () => {
  const context = setup('ordinary words')
  assert.equal(
    createPlainSourceSync(context.store.snapshot(), context.state.doc, {
      ...context.serialized,
      blocks: null,
    }),
    null,
  )
  assert.equal(
    createPlainSourceSync(context.store.snapshot(), context.state.doc, {
      ...context.serialized,
      source: 'different text',
    }),
    null,
  )
  for (const source of ['\nordinary words', '\tordinary words'])
    assert.equal(setup(source).certificate, null, source)
})

test('plain source sync falls back for structural changes, marks, references and HTML', () => {
  for (const [source, changes] of [
    ['ordinary words', [{ from: 3, to: 3, insert: '\n' }]],
    ['ordinary words', [{ from: 3, to: 3, insert: '\r\n' }]],
    ['ordinary words', [{ from: 3, to: 3, insert: '**bold**' }]],
    ['ordinary words', [{ from: 3, to: 3, insert: '[label]' }]],
    ['ordinary words', [{ from: 3, to: 3, insert: '<em>html</em>' }]],
    [
      'ordinary words',
      [
        { from: 2, to: 3, insert: 'a' },
        { from: 8, to: 9, insert: 'b' },
      ],
    ],
    ['first words\n\nsecond words', [{ from: 9, to: 14, insert: 'join' }]],
    ['# heading words', [{ from: 5, to: 6, insert: 'X' }]],
    ['- list words', [{ from: 5, to: 6, insert: 'X' }]],
    ['**bold words**', [{ from: 5, to: 6, insert: 'X' }]],
    ['word **marked** tail', [{ from: 2, to: 3, insert: 'X' }]],
    ['ordinary [reference] words', [{ from: 3, to: 4, insert: 'X' }]],
    ['ordinary <br> words', [{ from: 3, to: 4, insert: 'X' }]],
    ['ordinary &amp; words', [{ from: 3, to: 4, insert: 'X' }]],
    ['ordinary  \nwords', [{ from: 3, to: 4, insert: 'X' }]],
  ])
    reject(source, changes)
})

test('plain source sync bounds changed paragraph size', () => {
  accept(setup('a'.repeat(16 * 1024)), { from: 5, to: 6, insert: 'b' })
  reject('a'.repeat(16 * 1024 + 1), [{ from: 5, to: 6, insert: 'b' }])
  reject('ordinary words', [{ from: 5, to: 5, insert: 'a'.repeat(16 * 1024) }])
})

test('plain source sync rejects stale source snapshots and changed rich documents', () => {
  const context = setup('ordinary words\n\nsecond words')
  assert.ok(context.certificate)
  const foreign = new SourceStore('ordinary words\n\nsecond words', {
    tabId: 'plain-sync',
    revision: 0,
  })
  const foreignEdit = prepare(foreign, [{ from: 3, to: 4, insert: 'X' }])
  assert.equal(
    context.certificate.prepare(foreignEdit, context.state, (text) =>
      manager.parse(text),
    ),
    null,
  )
  reject('ordinary words', [{ from: 3, to: 4, insert: 'X' }], (state) =>
    state.apply(state.tr.insertText('changed', 2)),
  )
  const oldCertificate = context.certificate
  accept(context, { from: 3, to: 4, insert: 'X' })
  const nextEdit = prepare(context.store, [{ from: 4, to: 5, insert: 'Y' }])
  assert.equal(
    oldCertificate.prepare(nextEdit, context.state, (text) =>
      manager.parse(text),
    ),
    null,
  )
})

test('plain source sync rejects a parser result with changed text or structure', () => {
  const context = setup('ordinary words')
  assert.ok(context.certificate)
  const prepared = prepare(context.store, [{ from: 3, to: 4, insert: 'X' }])
  for (const source of [
    'different words',
    '# ordinary words',
    '**ordinary words**',
    'one\n\ntwo',
  ])
    assert.equal(
      context.certificate.prepare(prepared, context.state, () =>
        manager.parse(source),
      ),
      null,
      source,
    )
})

function checkPlainMaps(context, source, paragraphs) {
  const snapshot = context.store.snapshot()
  const doc = context.state.doc
  assert.ok(context.certificate.matches(snapshot, doc))
  context.store.counters(true)
  for (const raw of paragraphs) {
    const start = source.indexOf(raw)
    assert.ok(start >= 0)
    const normalized = raw.replace(/\r\n/g, '\n')
    let richStart = null
    doc.forEach((node, position) => {
      if (node.type.name === 'paragraph' && node.textContent === normalized)
        richStart = position + 1
    })
    assert.notEqual(richStart, null)
    for (let offset = 0; offset <= raw.length; offset++) {
      const rawPosition = start + offset
      const rich = context.certificate.map(snapshot, doc, rawPosition, 'source')
      if (!snapshot.isEditBoundary(rawPosition)) {
        assert.equal(rich, null)
        continue
      }
      const expected =
        richStart + raw.slice(0, offset).replace(/\r\n/g, '\n').length
      assert.equal(rich, expected, `Source offset ${rawPosition}`)
      assert.equal(
        context.certificate.map(snapshot, doc, rich, 'rich'),
        rawPosition,
      )
    }
    for (let offset = 0; offset < normalized.length; offset++)
      if (
        /^[\uD800-\uDBFF][\uDC00-\uDFFF]$/.test(
          normalized.slice(offset, offset + 2),
        )
      )
        assert.equal(
          context.certificate.map(
            snapshot,
            doc,
            richStart + offset + 1,
            'rich',
          ),
          null,
        )
  }
  assert.equal(context.store.counters().materializations, 0)
}

test('plain source maps round-trip every scalar boundary across Unicode and CRLF', () => {
  const paragraphs = ['alpha 🌱 café\r\nsoft line', 'omega e\u0301 tail']
  const source = `# heading\r\n\r\n${paragraphs[0]}\r\n\r\n**bold**\r\n\r\n${paragraphs[1]}\r\n`
  const context = setup(source)
  assert.ok(context.certificate)
  checkPlainMaps(context, source, paragraphs)
})

test('plain source maps reject separators, nonplain blocks, invalid positions and stale identities', () => {
  const source =
    '# heading\r\n\r\nplain words\r\n\r\n**marked**\r\n\r\nlast words\r\n\r\n'
  const context = setup(source)
  const snapshot = context.store.snapshot()
  const doc = context.state.doc
  assert.ok(context.certificate)
  for (const position of [
    0,
    3,
    source.indexOf('marked') + 2,
    source.indexOf('\r\n\r\n', source.indexOf('plain')) + 2,
    source.length,
    -1,
    0.5,
    NaN,
    Infinity,
    source.length + 1,
  ])
    assert.equal(
      context.certificate.map(snapshot, doc, position, 'source'),
      null,
    )
  for (const position of [
    0,
    doc.content.size,
    -1,
    0.5,
    NaN,
    Infinity,
    doc.content.size + 1,
  ])
    assert.equal(context.certificate.map(snapshot, doc, position, 'rich'), null)
  doc.forEach((node, position) => {
    if (
      node.type.name === 'heading' ||
      node.textContent === 'marked' ||
      !node.content.size
    )
      assert.equal(
        context.certificate.map(snapshot, doc, position + 1, 'rich'),
        null,
      )
  })
  const equivalentDoc = schema.nodeFromJSON(doc.toJSON())
  const foreign = new SourceStore(source, snapshot.document).snapshot()
  assert.equal(context.certificate.matches(snapshot, equivalentDoc), false)
  assert.equal(context.certificate.matches(foreign, doc), false)
  const raw = source.indexOf('plain') + 2
  assert.equal(
    context.certificate.map(snapshot, equivalentDoc, raw, 'source'),
    null,
  )
  assert.equal(context.certificate.map(foreign, doc, raw, 'source'), null)
})

test('plain source maps remain exact after local edits shift later paragraphs', () => {
  const source = 'first words\r\n\r\nsecond 🌱 words\r\n\r\nlast words'
  const context = setup(source)
  const previous = context.certificate
  accept(context, { from: 5, to: 5, insert: ' extended' })
  const current = context.store.snapshot().materialize()
  assert.equal(
    previous.matches(context.store.snapshot(), context.state.doc),
    false,
  )
  checkPlainMaps(context, current, [
    'first extended words',
    'second 🌱 words',
    'last words',
  ])
})

test('plain source advance binds exact native transactions and retains position maps', () => {
  const context = setup('alpha words\r\n\r\nomega words')
  const before = context.store.snapshot()
  const oldCertificate = context.certificate
  assert.ok(oldCertificate)
  const prepared = prepare(context.store, [
    { from: 6, to: 11, insert: 'letters' },
  ])
  const transaction = context.state.tr.insertText('letters', 7, 12)
  const certificate = oldCertificate.advance(
    prepared,
    context.state,
    transaction,
    transaction.doc,
    (source) => manager.parse(source),
  )
  assert.ok(certificate)
  assert.equal(oldCertificate.matches(before, context.state.doc), true)
  assert.equal(certificate.matches(prepared.after, transaction.doc), true)
  assert.equal(
    certificate.matches(
      prepared.after,
      schema.nodeFromJSON(transaction.doc.toJSON()),
    ),
    false,
  )
  context.store.commit(prepared)
  context.state = context.state.apply(transaction)
  context.certificate = certificate
  checkPlainMaps(context, context.store.snapshot().materialize(), [
    'alpha letters',
    'omega words',
  ])
  accept(context, { from: 21, to: 21, insert: ' new' })
})

test('plain source advance rejects marks, appended changes and mismatched source steps', () => {
  const context = setup('alpha words\n\nomega words')
  assert.ok(context.certificate)
  const prepared = prepare(context.store, [{ from: 5, to: 5, insert: ' new' }])
  const correct = context.state.tr.insertText(' new', 6)
  const markedState = context.state.apply(
    context.state.tr.setStoredMarks([schema.marks.bold.create()]),
  )
  const marked = markedState.tr.insertText(' new', 6)
  const extra = context.state.tr.insertText(' new', 6).insertText('other', 2)
  const different = context.state.tr.insertText(' other', 6)
  const moved = context.state.tr.insertText(' new', 7)
  const structural = context.state.tr.step(
    new ReplaceStep(6, 6, correct.steps[0].slice, true),
  )
  const staleState = EditorState.create({
    schema,
    doc: schema.nodeFromJSON(context.state.doc.toJSON()),
  })
  const stale = staleState.tr.insertText(' new', 6)
  for (const [state, transaction, nextDocument] of [
    [markedState, marked, marked.doc],
    [context.state, extra, extra.doc],
    [context.state, different, different.doc],
    [context.state, moved, moved.doc],
    [context.state, structural, structural.doc],
    [staleState, stale, stale.doc],
    [context.state, stale, stale.doc],
    [
      context.state,
      correct,
      context.state.apply(correct).tr.insertText('appended', 2).doc,
    ],
    [context.state, correct, schema.nodeFromJSON(correct.doc.toJSON())],
    [context.state, context.state.tr, context.state.doc],
  ])
    assert.ok(
      context.certificate.advance(
        prepared,
        state,
        transaction,
        nextDocument,
        (source) => manager.parse(source),
      ) === null,
    )
  const otherOperation = prepare(context.store, [
    { from: 7, to: 7, insert: ' new' },
  ])
  assert.ok(
    context.certificate.advance(
      otherOperation,
      context.state,
      correct,
      correct.doc,
      (source) => manager.parse(source),
    ) === null,
  )
  const foreign = new SourceStore(
    'alpha words\n\nomega words',
    context.store.snapshot().document,
  )
  const foreignEdit = prepare(foreign, [{ from: 5, to: 5, insert: ' new' }])
  assert.ok(
    context.certificate.advance(
      foreignEdit,
      context.state,
      correct,
      correct.doc,
      (source) => manager.parse(source),
    ) === null,
  )
})

test('plain source certificates rebase only over committed matching storage changes', () => {
  const source = 'alpha words\r\n\r\nomega 🌱 words'
  const context = setup(source)
  const original = context.certificate
  const before = context.store.snapshot()
  const doc = context.state.doc
  assert.ok(original)
  const work = context.store.prepareCompaction()
  let step = work.next()
  for (let yields = 0; !step.done; yields++) {
    assert.ok(yields < 100, 'Small-source compaction must converge.')
    step = work.next()
  }
  const change = step.value
  assert.ok(change)
  assert.equal(original.adoptStorage(change, doc), null)
  context.store.commitCompaction(change)
  assert.equal(original.adoptStorage({ ...change }, doc), null)
  assert.equal(
    original.adoptStorage(change, schema.nodeFromJSON(doc.toJSON())),
    null,
  )
  context.store.counters(true)
  const rebased = original.adoptStorage(change, doc)
  assert.ok(rebased)
  assert.equal(context.store.counters().materializations, 0)
  assert.equal(context.store.counters().sourceUnitsRead, 0)
  assert.equal(original.matches(before, doc), true)
  assert.equal(original.matches(change.after, doc), false)
  assert.equal(rebased.matches(change.after, doc), true)
  assert.equal(rebased.adoptStorage(change, doc), null)
  context.certificate = rebased
  checkPlainMaps(context, source, ['alpha words', 'omega 🌱 words'])
  accept(context, { from: 5, to: 5, insert: ' new' })
  checkPlainMaps(context, context.store.snapshot().materialize(), [
    'alpha new words',
    'omega 🌱 words',
  ])
})

function commitVisualPlan(context, transaction, expected) {
  const encoded = []
  context.store.counters(true)
  const plan = context.certificate.planVisual(
    context.store.snapshot(),
    context.state,
    transaction,
    transaction.doc,
    (text) => {
      encoded.push(text)
      return text
    },
  )
  assert.ok(plan)
  assert.deepEqual(plan.change, expected)
  assert.ok(encoded.length <= 1)
  assert.equal(encoded.join(''), expected.insert)
  assert.equal(context.store.counters().materializations, 0)
  assert.ok(
    context.store.counters().sourceUnitsRead <=
      expected.to - expected.from + 32,
  )
  const prepared = prepare(context.store, [plan.change])
  context.store.commit(prepared)
  const next = plan.certify(prepared)
  assert.ok(next)
  context.state = context.state.apply(transaction)
  context.certificate = next
  assert.equal(next.matches(context.store.snapshot(), context.state.doc), true)
  assert.equal(context.store.counters().materializations, 0)
  return prepared
}

test('plain visual plans edit giant ASCII paragraphs without parsing or materializing source', (t) => {
  const prefix = 'prefix words\r\n\r\n'
  const body = 'word123 '.repeat(12500).trimEnd()
  const source = `${prefix}${body}\r\n\r\nlast words\n`
  const context = setup(source)
  assert.ok(context.certificate)
  t.mock.method(manager, 'parse', () => {
    throw new Error('Visual planning must not parse the document.')
  })
  t.mock.method(manager, 'serialize', () => {
    throw new Error('Visual planning must not serialize the document.')
  })
  const operations = []
  let expected = source
  const richStart = context.state.doc.firstChild.nodeSize + 1
  for (const [offset, removed, insert] of [
    [50000, 0, '42 '],
    [3, 3, '9'],
    [80000, 2, ''],
    [99980, 1, ' 7'],
  ]) {
    const from = prefix.length + offset
    const change = { from, to: from + removed, insert }
    const transaction = context.state.tr.insertText(
      insert,
      richStart + offset,
      richStart + offset + removed,
    )
    operations.push(commitVisualPlan(context, transaction, change))
    expected = `${expected.slice(0, from)}${insert}${expected.slice(from + removed)}`
    const raw = prefix.length + offset
    assert.equal(
      context.certificate.map(
        context.store.snapshot(),
        context.state.doc,
        raw,
        'source',
      ),
      richStart + offset,
    )
  }
  assert.equal(context.store.snapshot().materialize(), expected)
  for (const operation of operations.toReversed()) {
    const inverse = prepare(context.store, operation.inverse)
    context.store.commit(inverse)
  }
  assert.equal(context.store.snapshot().materialize(), source)
})

test('plain visual plans reject syntax, whitespace-only results and indentation changes', () => {
  for (const [source, from, to, insert] of [
    ['plain words', 4, 4, '*'],
    ['plain words', 4, 4, '.'],
    ['plain words', 4, 4, '['],
    ['plain words', 4, 4, '\n'],
    ['plain words', 4, 4, '\t'],
    ['plain words', 4, 4, 'é'],
    ['plain words', 0, 0, ' '],
    [' plain words', 0, 1, ''],
    ['plain words', 0, 11, '  '],
    ['plain words', 0, 11, ''],
    ['plain words', 1, 1, 'x'.repeat(16385)],
    [`${'x'.repeat(16385)} tail`, 0, 16385, ''],
    ['plain words!', 4, 4, 'x'],
    ['plain café', 4, 4, 'x'],
  ]) {
    const context = setup(source)
    assert.ok(context.certificate)
    const transaction = context.state.tr.insertText(insert, from + 1, to + 1)
    assert.ok(
      context.certificate.planVisual(
        context.store.snapshot(),
        context.state,
        transaction,
        transaction.doc,
        (text) => text,
      ) === null,
      `Unsupported visual edit must fall back: ${source.slice(0, 40)} / ${JSON.stringify(insert.slice(0, 40))}`,
    )
  }
})

test('plain visual plans require exact unmarked native steps, identities and text encoding', () => {
  const context = setup('plain words\n\nlast words')
  const snapshot = context.store.snapshot()
  const correct = context.state.tr.insertText('123', 4)
  const markedState = context.state.apply(
    context.state.tr.setStoredMarks([schema.marks.bold.create()]),
  )
  const marked = markedState.tr.insertText('123', 4)
  const multiple = context.state.tr.insertText('1', 4).insertText('2', 4)
  const openSlice = context.state.tr.step(
    new ReplaceStep(
      4,
      4,
      new Slice(
        Fragment.from(schema.nodes.paragraph.create(null, schema.text('123'))),
        1,
        1,
      ),
    ),
  )
  const equivalent = schema.nodeFromJSON(context.state.doc.toJSON())
  const foreignState = EditorState.create({ schema, doc: equivalent })
  const foreignTransaction = foreignState.tr.insertText('123', 4)
  const foreignSource = new SourceStore(
    'plain words\n\nlast words',
    snapshot.document,
  ).snapshot()
  for (const [source, state, transaction, nextDocument, encode] of [
    [snapshot, markedState, marked, marked.doc, (text) => text],
    [snapshot, context.state, multiple, multiple.doc, (text) => text],
    [snapshot, context.state, openSlice, openSlice.doc, (text) => text],
    [
      snapshot,
      context.state,
      correct,
      context.state.apply(correct).tr.insertText('extra', 2).doc,
      (text) => text,
    ],
    [
      snapshot,
      context.state,
      correct,
      schema.nodeFromJSON(correct.doc.toJSON()),
      (text) => text,
    ],
    [
      snapshot,
      foreignState,
      foreignTransaction,
      foreignTransaction.doc,
      (text) => text,
    ],
    [
      snapshot,
      context.state,
      foreignTransaction,
      foreignTransaction.doc,
      (text) => text,
    ],
    [foreignSource, context.state, correct, correct.doc, (text) => text],
    [snapshot, context.state, correct, correct.doc, (text) => `${text}!`],
  ])
    assert.ok(
      context.certificate.planVisual(
        source,
        state,
        transaction,
        nextDocument,
        encode,
      ) === null,
    )
  const crossParagraph = context.state.tr.insertText(
    'joined',
    4,
    context.state.doc.content.size - 3,
  )
  assert.ok(
    context.certificate.planVisual(
      snapshot,
      context.state,
      crossParagraph,
      crossParagraph.doc,
      (text) => text,
    ) === null,
  )
})

test('plain visual plans certify only the matching prepared source operation', () => {
  const context = setup('plain words\n\nlast words')
  const transaction = context.state.tr.insertText('123', 4)
  const plan = context.certificate.planVisual(
    context.store.snapshot(),
    context.state,
    transaction,
    transaction.doc,
    (text) => text,
  )
  assert.ok(plan)
  const incorrect = prepare(context.store, [{ from: 3, to: 3, insert: '456' }])
  context.store.commit(incorrect)
  assert.equal(plan.certify(incorrect), null)
  const foreign = new SourceStore('plain words\n\nlast words', {
    tabId: 'plain-sync',
    revision: 0,
  })
  const foreignEdit = prepare(foreign, [plan.change])
  foreign.commit(foreignEdit)
  assert.equal(plan.certify(foreignEdit), null)
})

test('bounded source edits refresh the ASCII proof used by later visual plans', () => {
  const context = setup('plain words\n\nlast words')
  accept(context, { from: 5, to: 5, insert: '!' })
  const rejected = context.state.tr.insertText('123', 4)
  assert.ok(
    context.certificate.planVisual(
      context.store.snapshot(),
      context.state,
      rejected,
      rejected.doc,
      (text) => text,
    ) === null,
  )
  accept(context, { from: 5, to: 6, insert: '' })
  commitVisualPlan(context, context.state.tr.insertText('123', 4), {
    from: 3,
    to: 3,
    insert: '123',
  })
})

test('plain visual trailing-space edits match native parsing with retained line endings', () => {
  for (const ending of [
    '',
    '\n',
    '\r\n',
    '\n\nnext words',
    '\r\n\r\nnext words',
  ]) {
    for (const spaces of [' ', '  ']) {
      const original = `plain words${ending}`
      const context = setup(original)
      const operations = []
      for (const [from, to, insert] of [
        [12, 12, spaces],
        [12, 12 + spaces.length, ''],
      ]) {
        const transaction = context.state.tr.insertText(insert, from, to)
        const plan = context.certificate.planVisual(
          context.store.snapshot(),
          context.state,
          transaction,
          transaction.doc,
          (text) => text,
        )
        assert.ok(
          plan,
          'Plain trailing spaces remain eligible for visual planning.',
        )
        const prepared = prepare(context.store, [plan.change])
        context.store.commit(prepared)
        const next = plan.certify(prepared)
        assert.ok(next)
        context.state = context.state.apply(transaction)
        context.certificate = next
        operations.push(prepared)
        assert.deepEqual(
          context.state.doc.toJSON(),
          schema
            .nodeFromJSON(manager.parse(prepared.after.materialize()))
            .toJSON(),
          JSON.stringify({ ending, spaces, insert }),
        )
      }
      for (const operation of operations.toReversed())
        context.store.commit(prepare(context.store, operation.inverse))
      assert.equal(context.store.snapshot().materialize(), original)
    }
  }
})
