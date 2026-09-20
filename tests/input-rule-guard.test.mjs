import assert from 'node:assert/strict'
import test from 'node:test'
import { getExtensionField, InputRule, Mark } from '@tiptap/core'
import { Bold } from '@tiptap/extension-bold'
import { Italic } from '@tiptap/extension-italic'
import { Schema } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import { guardNativeInputRules } from '../src/renderer/src/input-rule-guard.ts'

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*' },
    text: {},
  },
  marks: { bold: {}, italic: {} },
})
const rulesFor = (extension) =>
  getExtensionField(extension, 'addInputRules', {
    type: schema.marks[extension.name],
  })()

const cases = [
  '',
  'ordinary prose',
  'words '.repeat(12000),
  '*',
  '**',
  '_',
  '__',
]
for (const prefix of ['', ' ', 'before ', 'before', '\t', '\n', '\\'])
  for (const delimiter of ['*', '**', '_', '__'])
    for (const body of [
      '',
      'word',
      ' two words ',
      ' ',
      '\t',
      'word\nnext',
      'word\\*next',
      'word\\_next',
      '**nested**',
      '__nested__',
      'long words '.repeat(2000),
    ])
      for (const suffix of [
        '',
        's',
        ' ',
        '\n',
        '\r',
        '\r\n',
        '\u2028',
        '\u2029',
      ])
        cases.push(`${prefix}${delimiter}${body}${delimiter}${suffix}`)

test('native emphasis guards preserve full regex results, including long spans', () => {
  for (const extension of [Bold, Italic]) {
    const original = rulesFor(extension)
    const guarded = rulesFor(guardNativeInputRules(extension.configure({})))
    assert.equal(guarded.length, original.length)
    for (let index = 0; index < original.length; index++) {
      const before = original[index]
      const after = guarded[index]
      assert.ok(after.find instanceof RegExp)
      assert.equal(after.find.source, before.find.source)
      assert.equal(after.find.flags, before.find.flags)
      assert.equal(after.undoable, before.undoable)
      for (const source of cases)
        assert.deepEqual(
          after.find.exec(source),
          before.find.exec(source),
          `${extension.name}: ${JSON.stringify(source.slice(0, 70))}`,
        )
    }
  }
})

test('ordinary long input never reaches native emphasis regexes', (t) => {
  const source = `${'long ordinary prose '.repeat(20000)}s`
  for (const extension of [Bold, Italic]) {
    const original = rulesFor(extension)
    const guarded = rulesFor(guardNativeInputRules(extension))
    for (const rule of original)
      t.mock.method(rule.find, 'exec', () => {
        assert.fail('unnecessary native regex scan')
      })
    for (const rule of guarded) assert.equal(rule.find.exec(source), null)
  }
})

function apply(rule, source) {
  const match = rule.find.exec(source)
  assert.ok(match)
  const state = EditorState.create({
    schema,
    doc: schema.node('doc', null, [
      schema.node('paragraph', null, schema.text(source)),
    ]),
  })
  const tr = state.tr
  rule.handler({
    state: { doc: state.doc, tr },
    range: { from: match.index + 1, to: match.index + match[0].length + 1 },
    match,
  })
  return { doc: tr.doc.toJSON(), storedMarks: tr.storedMarks }
}

test('guarded native rules preserve mark edits and undoability', () => {
  for (const extension of [Bold, Italic]) {
    const original = rulesFor(extension)
    const guarded = rulesFor(guardNativeInputRules(extension))
    const width = extension === Bold ? 2 : 1
    for (const [index, character] of ['*', '_'].entries()) {
      const marker = character.repeat(width)
      const source = `before ${marker}${'long words '.repeat(1000)}end${marker}`
      assert.deepEqual(
        apply(guarded[index], source),
        apply(original[index], source),
      )
      assert.equal(guarded[index].undoable, true)
    }
  }
})

test('same-name addons and replaced native rules remain untouched', () => {
  const customRule = new InputRule({
    find: /custom$/,
    handler() {},
    undoable: false,
  })
  for (const native of [Bold, Italic]) {
    const config = { name: native.name, addInputRules: () => [customRule] }
    const custom = Mark.create(config)
    const overridden = native.extend(config)
    assert.equal(guardNativeInputRules(custom), custom)
    assert.equal(guardNativeInputRules(overridden), overridden)
    const guarded = guardNativeInputRules(native)
    const original = rulesFor(native)[0]
    const replacement = new InputRule({
      find: new RegExp(original.find.source, original.find.flags),
      handler: customRule.handler,
      undoable: false,
    })
    const rules = guarded.config.addInputRules.call({
      parent: () => [replacement],
    })
    assert.equal(rules[0], replacement)
    assert.equal(rules[0].find.exec, RegExp.prototype.exec)
    assert.equal(rules[0].undoable, false)
  }
})
