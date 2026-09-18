import { Extension } from '@tiptap/core'
import type { Node } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
  type CodeSpan,
  codeLanguages,
  highlightCode,
} from './code-languages.ts'

/** Decorations never change the document, Markdown serialization, selection, or history. */
export const CodeHighlight = Extension.create({
  name: 'codeHighlight',
  addProseMirrorPlugins() {
    const key = new PluginKey<DecorationSet>('codeHighlight')
    const cache = new WeakMap<Node, { version: number; spans: CodeSpan[] }>()
    function decorate(
      doc: Node,
      previous = DecorationSet.empty,
      from = 0,
      to = doc.content.size,
    ) {
      const decorations: Decoration[] = []
      doc.nodesBetween(from, to, (node, pos) => {
        if (!node.isTextblock) return
        // Changed code blocks may now be paragraphs; remove their old tokens too.
        previous = previous.remove(
          previous.find(pos + 1, pos + node.nodeSize - 1),
        )
        if (node.type.name !== 'codeBlock') return false
        let result = cache.get(node)
        if (result?.version !== codeLanguages.version()) {
          result = {
            version: codeLanguages.version(),
            spans: highlightCode(
              node.textContent,
              String(node.attrs.language ?? ''),
            ),
          }
          cache.set(node, result)
        }
        for (const span of result.spans)
          decorations.push(
            Decoration.inline(pos + 1 + span.from, pos + 1 + span.to, {
              class: span.classes,
            }),
          )
        return false
      })
      return previous.add(doc, decorations)
    }
    return [
      new Plugin({
        key,
        state: {
          init: (_config, state) => decorate(state.doc),
          apply(transaction, previous) {
            if (transaction.getMeta(key)) return decorate(transaction.doc)
            if (!transaction.docChanged) return previous
            const from = transaction.before.content.findDiffStart(
              transaction.doc.content,
            )
            if (from === null) return previous
            const end =
              transaction.before.content.findDiffEnd(transaction.doc.content)
                ?.b ?? from
            return decorate(
              transaction.doc,
              previous.map(transaction.mapping, transaction.doc),
              Math.max(0, from - 1),
              Math.min(transaction.doc.content.size, Math.max(from, end) + 1),
            )
          },
        },
        props: { decorations: (state) => key.getState(state) },
        view(view) {
          const unsubscribe = codeLanguages.subscribe(() =>
            view.dispatch(
              view.state.tr.setMeta(key, true).setMeta('addToHistory', false),
            ),
          )
          return { destroy: unsubscribe }
        },
      }),
    ]
  },
})
