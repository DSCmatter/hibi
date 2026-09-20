import assert from 'node:assert/strict'
import test from 'node:test'
import { flattenExtensions, getExtensionField, Node } from '@tiptap/core'
import { OrderedList, TaskItem, TaskList } from '@tiptap/extension-list'
import { MarkdownManager } from '@tiptap/markdown'
import { StarterKit } from '@tiptap/starter-kit'
import { Marked } from 'marked'
import { guardNativeListTokenizer } from '../src/renderer/src/list-tokenizer-prefix.ts'
import { markdownConfiguration } from '../src/renderer/src/markdown.ts'

const lexer = {
  inlineTokens: (source) => [{ type: 'text', raw: source, text: source }],
  blockTokens: (source) => [{ type: 'paragraph', raw: source, text: source }],
}
const tokenize = (extension, source) =>
  getExtensionField(extension, 'markdownTokenizer').tokenize(source, [], lexer)

const cases = [
  '',
  'ordinary words',
  '# heading\n1. later',
  'text\n- [ ] later',
  '1. item',
  '42) item\n43) next',
  '0. zero',
  '001. leading zero',
  'a. alpha\nb. second',
  'AA) alpha\nAB) second',
  'iii. roman',
  'XIV) roman',
  'mMm. mixed roman',
  'abcd. not alpha',
  'ab1. not marker',
  '(216) phone',
  '216) 555-1234',
  '1.item',
  '1.\ntext',
  '1.\r\ntext',
  '1. item\n  2) nested\n\n  extra\n3. last',
  '1. item\nplain continuation\n\n# end',
  '- [ ] task',
  '* [x] task',
  '+ [X] task',
  '- [ ] ',
  '- [ ]',
  '- [] task',
  '- [xx] task',
  '- [y] task',
  '- [ ]task',
  '- \n[ ] task',
  '- [ ]\ntext',
  '- [ ] task\n  - [x] nested\n  - plain\n\n# end',
  '- plain\n- [ ] task',
  '- [ ] task\n- plain',
  'a'.repeat(12000),
  'prose '.repeat(12000),
  `${'i'.repeat(200)} no marker`,
]
for (const whitespace of [
  '',
  ' ',
  '\t',
  '\r',
  '\v',
  '\f',
  '\u00a0',
  '\u1680',
  '\u2000',
  '\u2028',
  '\u2029',
  '\ufeff',
  '\n',
  ' \n\t\n',
]) {
  for (const marker of [
    '1.',
    '123)',
    'aa.',
    'IV)',
    'AB.',
    '- [ ]',
    '* [x]',
    '+ [X]',
  ])
    for (const separator of [' ', '\t', '\r', '\u00a0', '\n', ''])
      cases.push(
        `${whitespace}${marker}${separator}item\n\nremaining paragraph`,
      )
}

test('prefix guards preserve installed ordered and task tokenizer results', () => {
  for (const original of [OrderedList, TaskList]) {
    const guarded = guardNativeListTokenizer(original)
    for (const source of cases)
      assert.deepEqual(
        tokenize(guarded, source),
        tokenize(original, source),
        `${original.name}: ${JSON.stringify(source.slice(0, 100))}`,
      )
  }
})

test('non-list prose never reaches native whole-tail splitting', (t) => {
  const source = `ordinary paragraph\n\n${'more words\n\n'.repeat(20000)}`
  const split = String.prototype.split
  let fullSplits = 0
  t.mock.method(String.prototype, 'split', function (...args) {
    if (String(this) === source && args[0] === '\n') fullSplits++
    return split.apply(this, args)
  })
  for (const extension of [OrderedList, TaskList]) {
    fullSplits = 0
    assert.equal(tokenize(extension, source), undefined)
    assert.equal(
      fullSplits,
      1,
      `${extension.name} baseline must exercise measured split`,
    )
    fullSplits = 0
    const guarded = guardNativeListTokenizer(extension)
    for (let index = 0; index < 100; index++)
      assert.equal(tokenize(guarded, source), undefined)
    assert.equal(
      fullSplits,
      0,
      `${extension.name} guard must reject before split`,
    )
  }
})

test('configured builtins retain options and custom addon tokenizers remain untouched', () => {
  for (const base of [OrderedList, TaskList]) {
    const extension = base.configure({
      itemTypeName: 'customItem',
      HTMLAttributes: { class: 'custom' },
    })
    const guarded = guardNativeListTokenizer(extension)
    assert.deepEqual(guarded.options, extension.options)
    assert.equal(guarded.name, extension.name)
    assert.equal(guarded.config.parseMarkdown, extension.config.parseMarkdown)
    const tokenizer = getExtensionField(extension, 'markdownTokenizer')
    assert.equal(
      getExtensionField(guarded, 'markdownTokenizer').start,
      tokenizer.start,
    )
    const custom = extension.extend({
      markdownTokenizer: {
        ...tokenizer,
        tokenize: () => ({ type: 'custom', raw: 'ordinary' }),
      },
    })
    assert.equal(guardNativeListTokenizer(custom), custom)
    assert.equal(tokenize(custom, 'ordinary').type, 'custom')
  }
  const unrelated = Node.create({ name: 'custom' })
  assert.equal(guardNativeListTokenizer(unrelated), unrelated)
})

test('the shared markdown factory guards native lists without wrapping addon replacements', (t) => {
  const source = `ordinary paragraph\n\n${'more words\n\n'.repeat(10000)}`
  const taskReplacement = TaskList.extend({
    markdownTokenizer: {
      ...getExtensionField(TaskList, 'markdownTokenizer'),
      tokenize: () => ({ type: 'custom', raw: 'ordinary' }),
    },
  })
  const configuration = markdownConfiguration([
    { id: 'github-markdown.github', richExtensions: [TaskList] },
    { id: 'custom.override', richExtensions: [taskReplacement] },
  ])
  const ordered = flattenExtensions(configuration.core).find(
    (extension) => extension.name === 'orderedList',
  )
  const split = String.prototype.split
  let fullSplits = 0
  t.mock.method(String.prototype, 'split', function (...args) {
    if (String(this) === source && args[0] === '\n') fullSplits++
    return split.apply(this, args)
  })
  assert.equal(tokenize(ordered, source), undefined)
  assert.equal(tokenize(configuration.addons[0], source), undefined)
  assert.equal(fullSplits, 0)
  assert.equal(configuration.addons[1], taskReplacement)
})

test('native list JSON remains identical through mixed lists, nested blocks and references', () => {
  const guardedStarter = StarterKit.extend({
    addExtensions() {
      return this.parent().map(guardNativeListTokenizer)
    },
  })
  const managers = [
    [StarterKit, TaskList, TaskItem],
    [guardedStarter, guardNativeListTokenizer(TaskList), TaskItem],
  ].map(
    (extensions) =>
      new MarkdownManager({ marked: new Marked({ gfm: true }), extensions }),
  )
  for (const source of [
    ...cases.slice(0, 34),
    '1. **bold**\n2. [ref]\n\n[ref]: /target',
    '[ref]: /first\n\n- [ ] [ref]\n  - [x] nested\n  1. numbered',
    '- ordinary\n- [ ] [ref]\n  - nested\n\n[ref]: /later',
    'AA) first\n  i. nested\n  ii. second\nAB) next\n\nparagraph',
    '> 1. quote\n> 2. next\n>\n> - [ ] task',
    'paragraph\n\n\n\n- [ ] task\n\ntrailing',
  ])
    assert.deepEqual(
      managers[1].parse(source),
      managers[0].parse(source),
      source,
    )
})
