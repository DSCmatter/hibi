import type { Editor } from '@tiptap/core'
import type { Mark, Node } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const delimiters: Record<string, string> = {
  bold: '**',
  italic: '*',
  strike: '~~',
  code: '`',
}

/** Formatting hints use canonical delimiters; they never become document text. */
export function blockMarkdownMarkers(block: Node, start: number) {
  const hints: { pos: number; text: string; side: number }[] = []
  if (!block.isTextblock || block.type.spec.code) return hints
  if (block.type.name === 'heading')
    hints.push({
      pos: start,
      text: `${'#'.repeat(block.attrs.level)} `,
      side: -10,
    })
  let previous: readonly Mark[] = []
  const transition = (marks: readonly Mark[], pos: number) => {
    const next = marks.filter((mark) => delimiters[mark.type.name])
    let shared = 0
    for (const mark of previous) {
      const other = next[shared]
      if (!other || !mark.eq(other)) break
      shared++
    }
    const close = previous
      .slice(shared)
      .reverse()
      .map((mark) => delimiters[mark.type.name])
      .join('')
    const open = next
      .slice(shared)
      .map((mark) => delimiters[mark.type.name])
      .join('')
    if (close || open)
      hints.push({ pos, text: close + open, side: close ? (open ? 0 : 1) : -1 })
    previous = next
  }
  block.forEach((node, offset) => {
    transition(node.marks, start + offset)
  })
  transition([], start + block.content.size)
  return hints
}

export function observeMarkdownMarkers(editor: Editor) {
  const key = new PluginKey('markdownMarkers')
  let document: Node | null = null
  let block: Node | null = null
  let start = -1
  let decorations = DecorationSet.empty
  editor.registerPlugin(
    new Plugin({
      key,
      props: {
        decorations(state) {
          const selection = state.selection
          if (
            !editor.isFocused ||
            !editor.isEditable ||
            !(selection instanceof TextSelection) ||
            !selection.$from.sameParent(selection.$to)
          )
            return DecorationSet.empty
          const current = selection.$head.parent
          const position = selection.$head.start()
          if (document === state.doc && block === current && start === position)
            return decorations
          document = state.doc
          block = current
          start = position
          decorations = DecorationSet.create(
            state.doc,
            blockMarkdownMarkers(current, position).map(({ pos, text, side }) =>
              Decoration.widget(
                pos,
                (view) => {
                  const hint = view.dom.ownerDocument.createElement('span')
                  hint.className = 'markdown-marker'
                  hint.dataset.marker = text
                  hint.setAttribute('aria-hidden', 'true')
                  hint.contentEditable = 'false'
                  return hint
                },
                {
                  side,
                  marks: [],
                  ignoreSelection: true,
                  key: `${pos}:${side}:${text}`,
                },
              ),
            ),
          )
          return decorations
        },
      },
    }),
  )
  return () => {
    if (!editor.isDestroyed) editor.unregisterPlugin(key)
  }
}
