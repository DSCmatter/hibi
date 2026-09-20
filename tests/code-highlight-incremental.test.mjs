import assert from 'node:assert/strict'
import test from 'node:test'
import { Fragment, Schema } from '@tiptap/pm/model'
import { EditorState } from '@tiptap/pm/state'
import { CodeHighlight } from '../src/renderer/src/CodeHighlight.ts'
import {
  codeLanguages,
  highlightCode,
} from '../src/renderer/src/code-languages.ts'

test('mapped code decorations match full highlighting through text, block, and language changes', async (t) => {
  await codeLanguages.ensure('javascript')
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      text: { group: 'inline' },
      paragraph: { group: 'block', content: 'text*' },
      blockquote: { group: 'block', content: 'block+' },
      codeBlock: {
        group: 'block',
        content: 'text*',
        attrs: { language: { default: 'javascript' } },
      },
    },
  })
  for (const method of ['findDiffStart', 'findDiffEnd'])
    t.mock.method(Fragment.prototype, method, () => {
      assert.fail(
        'code highlighting must use step maps, not whole-text comparisons',
      )
    })
  const [plugin] = CodeHighlight.config.addProseMirrorPlugins()
  const paragraph = (text) =>
    schema.nodes.paragraph.create(null, schema.text(text))
  const code = (text) => schema.nodes.codeBlock.create(null, schema.text(text))
  let state = EditorState.create({
    schema,
    plugins: [plugin],
    doc: schema.nodes.doc.create(null, [
      paragraph('prefix'),
      code('const x = "one"'),
      code('// two\nlet y = 2'),
      paragraph('suffix'),
    ]),
  })
  const verify = () => {
    const expected = []
    state.doc.descendants((node, pos) => {
      if (node.type.name !== 'codeBlock') return
      for (const token of highlightCode(node.textContent, node.attrs.language))
        expected.push({
          from: pos + 1 + token.from,
          to: pos + 1 + token.to,
          classes: token.classes,
        })
    })
    const actual = plugin
      .getState(state)
      .find()
      .map((token) => ({
        from: token.from,
        to: token.to,
        classes: token.type.attrs.class,
      }))
    const sort = (values) =>
      values.sort(
        (a, b) =>
          a.from - b.from || a.to - b.to || a.classes.localeCompare(b.classes),
      )
    assert.deepEqual(sort(actual), sort(expected))
  }
  const apply = (tr) => {
    state = state.apply(tr)
    verify()
  }
  verify()
  const multiple = state.tr.insertText('abcdefgh', 1)
  multiple.insertText('return ', multiple.doc.firstChild.nodeSize + 1)
  multiple.delete(1, 5)
  apply(multiple)
  const firstCode = state.doc.firstChild.nodeSize
  apply(state.tr.setNodeAttribute(firstCode, 'language', 'text'))
  apply(state.tr.setNodeAttribute(firstCode, 'language', 'javascript'))
  apply(state.tr.join(firstCode + state.doc.child(1).nodeSize))
  apply(state.tr.split(firstCode + 4))
  // A transaction can change steps without changing its final document.
  apply(state.tr.insertText('x', 1).delete(1, 2))
  for (let index = 0; index < 120; index++) {
    const blocks = []
    state.doc.forEach((node, pos) => {
      blocks.push({ node, pos })
    })
    const { node, pos } = blocks[(index * 7) % blocks.length]
    switch (index % 5) {
      case 0:
        apply(state.tr.insertText(index % 2 ? 'z' : ' ', pos + 1))
        break
      case 1:
        apply(
          state.tr.setNodeMarkup(
            pos,
            node.type.name === 'codeBlock'
              ? schema.nodes.paragraph
              : schema.nodes.codeBlock,
          ),
        )
        break
      case 2:
        apply(state.tr.insert(state.doc.content.size, code('const later = 42')))
        break
      case 3:
        apply(state.tr.delete(pos, pos + node.nodeSize))
        break
      case 4:
        if (node.content.size) apply(state.tr.delete(pos + 1, pos + 2))
        break
    }
  }
  const nested = schema.nodes.blockquote.create(null, [
    code('const nested = 1'),
    paragraph('after'),
  ])
  apply(state.tr.insert(0, nested))
  apply(state.tr.insertText(' ', 2))
  apply(state.tr.setNodeMarkup(1, schema.nodes.paragraph))
  apply(state.tr.delete(0, state.doc.firstChild.nodeSize))
  codeLanguages.setEnabled('javascript', false)
  apply(state.tr.setMeta(plugin, true))
  codeLanguages.setEnabled('javascript', true)
  apply(state.tr.setMeta(plugin, true))
})
